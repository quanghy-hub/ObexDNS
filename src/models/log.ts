import { D1Database } from "@cloudflare/workers-types";
import { ResolutionLog } from "../types";

export class LogModel {
  constructor(private db: D1Database) {}

  async insert(log: ResolutionLog): Promise<boolean> {
    const result = await this.db.prepare(
      "INSERT INTO logs (profile_id, timestamp, client_ip, geo_country, domain, record_type, action, reason, answer, dest_geoip, ecs, upstream, latency) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(
        log.profile_id,
        log.timestamp,
        log.client_ip,
        log.geo_country || null,
        log.domain,
        log.record_type,
        log.action,
        log.reason || null,
        log.answer || null,
        log.dest_geoip || null,
        log.ecs || null,
        log.upstream || null,
        log.latency || null,
      )
      .run();
    return result.success;
  }

  async getLogs(profileId: string, options: { since: number, until: number, status?: string, search?: string, before?: number, limit?: number }): Promise<ResolutionLog[]> {
    let queryStr = "SELECT l.*, p.name as profile_name FROM logs l JOIN profiles p ON l.profile_id = p.id WHERE l.profile_id = ? AND l.timestamp >= ? AND l.timestamp <= ?";
    let params: any[] = [profileId, options.since, options.until];
    
    if (options.status) { queryStr += " AND l.action = ?"; params.push(options.status); }
    if (options.search) { queryStr += " AND l.domain LIKE ?"; params.push(`%${options.search}%`); }
    if (options.before) { queryStr += " AND l.timestamp < ?"; params.push(options.before); }
    
    queryStr += ` ORDER BY l.timestamp DESC LIMIT ${options.limit || 50}`;
    
    const { results } = await this.db.prepare(queryStr).bind(...params).all<ResolutionLog>();
    return results;
  }

  async deleteByOwner(ownerId: string): Promise<boolean> {
    const result = await this.db.prepare("DELETE FROM logs WHERE profile_id IN (SELECT id FROM profiles WHERE owner_id = ?)").bind(ownerId).run();
    return result.success;
  }

  async cleanup(profileId: string, olderThanTimestamp: number): Promise<number> {
    const result = await this.db.prepare(
      "DELETE FROM logs WHERE profile_id = ? AND timestamp < ?"
    )
      .bind(profileId, olderThanTimestamp)
      .run();
    return result.meta.changes || 0;
  }

  /**
   * 全局清理过期日志 (基于各 Profile 的 settings)
   * 这是一个更重的操作，建议优化为单个 SQL
   */
  async cleanupGlobal(): Promise<void> {
    // 这里的逻辑比较复杂，因为每个 Profile 的保留天数不同
    // 我们先查询出所有不同的天数配置
    const { results } = await this.db.prepare("SELECT DISTINCT json_extract(settings, '$.log_retention_days') as days FROM profiles").all<{days: number}>();
    
    for (const row of results) {
      const days = row.days || 30;
      const threshold = Math.floor(Date.now() / 1000 - (days * 24 * 3600));
      // 清理所有设置为该天数的 Profile 的过期日志
      await this.db.prepare("DELETE FROM logs WHERE timestamp < ? AND profile_id IN (SELECT id FROM profiles WHERE json_extract(settings, '$.log_retention_days') = ? OR (? = 30 AND json_extract(settings, '$.log_retention_days') IS NULL))")
        .bind(threshold, days, days).run();
    }
  }

  async getAnalytics(profileId: string, since: number, until: number, interval: string) {
    const [summary, trend, topAllowed, topBlocked, clients, destinations] = await Promise.all([
      this.db.prepare("SELECT action, COUNT(*) as count FROM logs WHERE profile_id = ? AND timestamp >= ? AND timestamp <= ? GROUP BY action").bind(profileId, since, until).all(),
      this.db.prepare(`SELECT ${interval} as timestamp, action, COUNT(*) as count FROM logs WHERE profile_id = ? AND timestamp >= ? AND timestamp <= ? GROUP BY ${interval}, action ORDER BY timestamp ASC`).bind(profileId, since, until).all(),
      this.db.prepare("SELECT domain, COUNT(*) as count FROM logs WHERE profile_id = ? AND timestamp >= ? AND timestamp <= ? AND action = 'PASS' GROUP BY domain ORDER BY count DESC LIMIT 10").bind(profileId, since, until).all(),
      this.db.prepare("SELECT domain, COUNT(*) as count FROM logs WHERE profile_id = ? AND timestamp >= ? AND timestamp <= ? AND action = 'BLOCK' GROUP BY domain ORDER BY count DESC LIMIT 10").bind(profileId, since, until).all(),
      this.db.prepare("SELECT client_ip, geo_country, COUNT(*) as count FROM logs WHERE profile_id = ? AND timestamp >= ? AND timestamp <= ? GROUP BY client_ip, geo_country ORDER BY count DESC LIMIT 10").bind(profileId, since, until).all(),
      this.db.prepare("SELECT dest_geoip, COUNT(*) as count FROM logs WHERE profile_id = ? AND timestamp >= ? AND timestamp <= ? AND dest_geoip IS NOT NULL GROUP BY dest_geoip ORDER BY count DESC LIMIT 10").bind(profileId, since, until).all()
    ]);
    return { summary: summary.results, trend: trend.results, top_allowed: topAllowed.results, top_blocked: topBlocked.results, clients: clients.results, destinations: destinations.results };
  }
}
