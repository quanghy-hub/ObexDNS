import { Env, List } from "../types";
import { parseList } from "./parser";
import { BloomFilter } from "./bloom";

export async function syncProfileLists(profileId: string, env: Env, context: any): Promise<void> {
  // 获取该 Profile 的所有启用列表
  const { results: lists } = await env.DB.prepare("SELECT * FROM lists WHERE profile_id = ? AND enabled = 1")
    .bind(profileId).all<List>();

  const allDomains = new Set<string>();

  for (const list of lists) {
    try {
      const response = await fetch(list.url, {
        headers: { "User-Agent": "Obex-DNS-Sync/1.0" }
      });
      if (!response.ok) continue;

      const content = await response.text();
      const domains = parseList(content);

      for (const d of domains) {
        allDomains.add(d.toLowerCase());
      }

      // 更新同步时间
      await env.DB.prepare("UPDATE lists SET last_synced_at = ? WHERE id = ?")
        .bind(Math.floor(Date.now() / 1000), list.id).run();
    } catch (e) {
      console.error(`Failed to sync list ${list.url}:`, e);
    }
  }

  if (allDomains.size === 0) {
    // 清空该 Profile 的列表记录
    await env.DB.prepare("DELETE FROM list_entries WHERE profile_id = ?").bind(profileId).run();
    await env.DB.prepare("UPDATE profiles SET list_bloom = NULL, list_updated_at = ? WHERE id = ?")
      .bind(Math.floor(Date.now() / 1000), profileId).run();
    return;
  }

  const domainArray = Array.from(allDomains);
  
  // 生成 Bloom Filter (0.1% 误判率)
  const bloom = BloomFilter.create(domainArray.length, 0.001);
  for (const domain of domainArray) {
    bloom.add(domain);
  }

  // 使用 D1 存储。
  // 清空旧记录
  await env.DB.prepare("DELETE FROM list_entries WHERE profile_id = ?").bind(profileId).run();

  // 批量插入新域名 (D1 批量插入限制约 100 条/次)
  const batchSize = 100;
  const statements = [];
  for (let i = 0; i < domainArray.length; i += batchSize) {
    const chunk = domainArray.slice(i, i + batchSize);
    const placeholders = chunk.map(() => "(?, ?)").join(", ");
    const params = chunk.flatMap(d => [profileId, d]);
    statements.push(env.DB.prepare(`INSERT OR IGNORE INTO list_entries (profile_id, domain) VALUES ${placeholders}`).bind(...params));
  }

  // 执行批量更新
  if (statements.length > 0) {
    await env.DB.batch(statements);
  }

  // 更新 Profile 中的布隆过滤器
  const bloomData = bloom.dump();
  await env.DB.prepare("UPDATE profiles SET list_bloom = ?, list_updated_at = ? WHERE id = ?")
    .bind(JSON.stringify(bloomData), Math.floor(Date.now() / 1000), profileId).run();

  console.log(`Synced ${domainArray.length} domains for profile ${profileId} to D1`);
}
