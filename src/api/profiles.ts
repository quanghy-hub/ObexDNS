import { Env, User, Profile, ProfileSettings, Rule, List, Context, ExecutionContext } from "../types";
import { RBAC } from "../lib/rbac";
import { buildDNSQuery, parseDNSAnswer } from "../utils/dns";
import { pipeline } from "../pipeline";
import { syncProfileLists } from "../utils/sync";
import { LogModel } from "../models/log";
import { ProfileModel } from "../models/profile";

export async function handleProfilesRequest(request: Request, env: Env, user: User | null, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean); // ['api', 'profiles', ':id', ...]
  const profileModel = new ProfileModel(env.DB);

  // 处理列表和创建 (无 ID)
  if (pathParts.length === 2) {
    if (!user) return new Response("Unauthorized", { status: 401 });

    if (request.method === 'GET') {
      const filter = RBAC.getProfileFilter(user);
      const results = await profileModel.list(filter.sql, filter.params);
      return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } });
    }

    if (request.method === 'POST') {
      const body = await request.json() as { name: string };
      const existing = await profileModel.findByName(user.id, body.name);
      if (existing) return new Response("该配置名称已存在", { status: 400 });

      const newId = Math.random().toString(36).substring(2, 8);
      const defaultSettings: ProfileSettings = {
        upstream: ["https://security.cloudflare-dns.com/dns-query"],
        ecs: { enabled: true, use_client_ip: true },
        log_retention_days: 30,
        default_policy: 'ALLOW'
      };
      await env.DB.prepare("INSERT INTO profiles (id, owner_id, name, settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(newId, user.id, body.name || "未命名配置", JSON.stringify(defaultSettings), Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000)).run();
      return new Response(JSON.stringify({ id: newId }), { status: 201 });
    }
  }

  // 处理特定 Profile (有 ID)
  if (pathParts.length >= 3) {
    const profileId = pathParts[2];
    const profile = await env.DB.prepare("SELECT * FROM profiles WHERE id = ?").bind(profileId).first<Profile>();
    
    if (!profile) return new Response("Profile Not Found", { status: 404 });

    // 特殊处理：mobileconfig 下载允许免登录访问
    const isMobileConfig = pathParts[3] === 'mobileconfig' && request.method === 'GET';
    
    if (!isMobileConfig) {
      if (!user) return new Response("Unauthorized", { status: 401 });
      if (!RBAC.canAccessProfile(user, profile)) return new Response("Forbidden", { status: 403 });
    }

    // DELETE /api/profiles/:id
    if (pathParts.length === 3 && request.method === 'DELETE') {
      await env.DB.prepare("DELETE FROM profiles WHERE id = ?").bind(profileId).run();
      return new Response(null, { status: 204 });
    }

    // PATCH /api/profiles/:id (用于修改名称等基础信息)
    if (pathParts.length === 3 && request.method === 'PATCH') {
      const { name } = await request.json() as { name: string };
      if (!name) return new Response("名称不能为空", { status: 400 });
      await env.DB.prepare("UPDATE profiles SET name = ?, updated_at = ? WHERE id = ?")
        .bind(name, Math.floor(Date.now() / 1000), profileId).run();
      await pipeline.clearCache(profileId);
      return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    // GET /api/profiles/:id
    if (pathParts.length === 3 && request.method === 'GET') {
      return new Response(JSON.stringify(profile), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // PATCH /api/profiles/:id/settings
    if (pathParts[3] === 'settings' && request.method === 'PATCH') {
      const newSettings = await request.json() as ProfileSettings;
      await profileModel.updateSettings(profileId, newSettings);
      const logModel = new LogModel(env.DB);
      const days = newSettings.log_retention_days || 30;
      const threshold = Math.floor(Date.now() / 1000 - (days * 24 * 3600));
      ctx.waitUntil(logModel.cleanup(profileId, threshold));
      await pipeline.clearCache(profileId);
      return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json' } });
    }

    // POST /api/profiles/:id/test
    if (pathParts[3] === 'test' && request.method === 'POST') {
      const { domain, type } = await request.json() as { domain: string, type: string };
      const rawQuery = buildDNSQuery(domain, type);
      const result = await pipeline.process(request, { name: domain, type, raw: rawQuery }, { profileId, startTime: Date.now(), env, ctx });
      return new Response(JSON.stringify({
        action: result.action,
        reason: result.reason,
        answers: result.answer.length > 0 ? parseDNSAnswer(result.answer) : [],
        diagnostics: result.diagnostics,
        latency: result.latency,
        timings: result.timings,
        client_ip: request.headers.get("CF-Connecting-IP") || "127.0.0.1",
        geo_country: (request as any).cf?.country || "UNKNOWN",
        success: true 
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // 子资源路由: /api/profiles/:id/filters
    if (pathParts[3] === 'filters' && request.method === 'GET') {
      const [rules, lists] = await Promise.all([profileModel.getRules(profileId), profileModel.getLists(profileId)]);
      return new Response(JSON.stringify({ rules, lists }), { headers: { 'Content-Type': 'application/json' } });
    }

    // 子资源路由: /api/profiles/:id/logs
    if (pathParts[3] === 'logs' && request.method === 'GET') {
      const urlParams = new URL(request.url).searchParams;
      const range = urlParams.get('range') || '24h';
      const before = urlParams.get('before');
      const status = urlParams.get('status');
      const search = urlParams.get('search');
      const startParam = urlParams.get('start');
      const endParam = urlParams.get('end');
      
      let since: number;
      let until = Math.floor(Date.now() / 1000);
      const settings: ProfileSettings = JSON.parse(profile.settings);
      const retentionThreshold = Math.floor(until - ((settings.log_retention_days || 30) * 24 * 3600));

      if (startParam && endParam) {
        since = Math.max(parseInt(startParam), retentionThreshold);
        until = parseInt(endParam);
      } else {
        since = until;
        switch (range) {
          case '10m': since -= 600; break;
          case '1h': since -= 3600; break;
          case '24h': since -= 86400; break;
          case '7d': since -= 604800; break;
          case '30d': since -= 2592000; break;
          default: since -= 86400; break;
        }
        since = Math.max(since, retentionThreshold);
      }

      let queryStr = "SELECT l.*, p.name as profile_name FROM logs l JOIN profiles p ON l.profile_id = p.id WHERE l.profile_id = ? AND l.timestamp >= ? AND l.timestamp <= ?";
      let params: any[] = [profileId, since, until];
      if (status) { queryStr += " AND l.action = ?"; params.push(status); }
      if (search) { queryStr += " AND l.domain LIKE ?"; params.push(`%${search}%`); }
      if (before) { queryStr += " AND l.timestamp < ?"; params.push(parseInt(before)); }
      queryStr += " ORDER BY l.timestamp DESC LIMIT 50";

      const { results } = await env.DB.prepare(queryStr).bind(...params).all();
      return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } });
    }

    // 子资源路由: /api/profiles/:id/mobileconfig
    if (pathParts[3] === 'mobileconfig' && request.method === 'GET') {
      const dohUrl = `${url.origin}/${profileId}`;
      const payloadUUID = crypto.randomUUID();
      const profileUUID = crypto.randomUUID();
      const config = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>PayloadContent</key>
	<array>
		<dict>
			<key>DNSSettings</key>
			<dict>
				<key>DNSProtocol</key>
				<string>HTTPS</string>
				<key>ServerHTTPVersion</key>
				<string>3</string>
				<key>ServerURL</key>
				<string>${dohUrl}</string>
			</dict>
			<key>OnDemandRules</key>
			<array>
				<dict>
					<key>Action</key>
					<string>Connect</string>
					<key>InterfaceTypeMatch</key>
					<string>WiFi</string>
				</dict>
				<dict>
					<key>Action</key>
					<string>Connect</string>
					<key>InterfaceTypeMatch</key>
					<string>Cellular</string>
				</dict>
				<dict>
					<key>Action</key>
					<string>Disconnect</string>
				</dict>
			</array>
			<key>PayloadDescription</key>
			<string>Obex DNS 保护您的网络流量</string>
			<key>PayloadDisplayName</key>
			<string>Obex DoH (${profile.name})</string>
			<key>PayloadIdentifier</key>
			<string>com.apple.dnsSettings.managed.${payloadUUID}</string>
			<key>PayloadName</key>
			<string>Obex DoH (${profile.name})</string>
			<key>PayloadType</key>
			<string>com.apple.dnsSettings.managed</string>
			<key>PayloadUUID</key>
			<string>${payloadUUID}</string>
			<key>PayloadVersion</key>
			<integer>1</integer>
		</dict>
	</array>
	<key>PayloadDescription</key>
	<string>Obex DNS 保护您的网络流量</string>
	<key>PayloadDisplayName</key>
	<string>Obex - ${profile.name}</string>
	<key>PayloadIdentifier</key>
	<string>obex.dns.profile</string>
	<key>PayloadName</key>
	<string>Obex - ${profile.name}</string>
	<key>PayloadRemovalDisallowed</key>
	<false/>
	<key>PayloadType</key>
	<string>Configuration</string>
	<key>PayloadUUID</key>
	<string>${profileUUID}</string>
	<key>PayloadVersion</key>
	<integer>1</integer>
</dict>
</plist>
`;
      return new Response(config, { headers: { 'Content-Type': 'application/x-apple-aspen-config', 'Content-Disposition': `attachment; filename="obex-${profileId}.mobileconfig"` } });
    }

    // 子资源路由: /api/profiles/:id/analytics
    if (pathParts[3] === 'analytics' && request.method === 'GET') {
      const urlParams = new URL(request.url).searchParams;
      const range = urlParams.get('range');
      const startParam = urlParams.get('start');
      const endParam = urlParams.get('end');
      let since: number; let until = Math.floor(Date.now() / 1000); let interval: string;

      if (startParam && endParam) { since = parseInt(startParam); until = parseInt(endParam); interval = "(timestamp/3600)*3600"; }
      else {
        switch (range) {
          case '10m': since = until - 600; interval = "(timestamp/60)*60"; break;
          case '1h': since = until - 3600; interval = "(timestamp/60)*60"; break;
          case '24h': since = until - 86400; interval = "(timestamp/3600)*3600"; break;
          case '7d': since = until - 604800; interval = "(timestamp/86400)*86400"; break;
          case '30d': since = until - 2592000; interval = "(timestamp/86400)*86400"; break;
          default: since = until - 86400; interval = "(timestamp/3600)*3600"; break;
        }
      }
      
      const [summary, trend, topAllowed, topBlocked, clients, destinations] = await Promise.all([
        env.DB.prepare("SELECT action, COUNT(*) as count FROM logs WHERE profile_id = ? AND timestamp >= ? AND timestamp <= ? GROUP BY action").bind(profileId, since, until).all(),
        env.DB.prepare(`SELECT ${interval} as timestamp, action, COUNT(*) as count FROM logs WHERE profile_id = ? AND timestamp >= ? AND timestamp <= ? GROUP BY ${interval}, action ORDER BY timestamp ASC`).bind(profileId, since, until).all(),
        env.DB.prepare("SELECT domain, COUNT(*) as count FROM logs WHERE profile_id = ? AND timestamp >= ? AND timestamp <= ? AND action = 'PASS' GROUP BY domain ORDER BY count DESC LIMIT 10").bind(profileId, since, until).all(),
        env.DB.prepare("SELECT domain, COUNT(*) as count FROM logs WHERE profile_id = ? AND timestamp >= ? AND timestamp <= ? AND action = 'BLOCK' GROUP BY domain ORDER BY count DESC LIMIT 10").bind(profileId, since, until).all(),
        env.DB.prepare("SELECT client_ip, geo_country, COUNT(*) as count FROM logs WHERE profile_id = ? AND timestamp >= ? AND timestamp <= ? GROUP BY client_ip, geo_country ORDER BY count DESC LIMIT 10").bind(profileId, since, until).all(),
        env.DB.prepare("SELECT dest_geoip, COUNT(*) as count FROM logs WHERE profile_id = ? AND timestamp >= ? AND timestamp <= ? AND dest_geoip IS NOT NULL GROUP BY dest_geoip ORDER BY count DESC LIMIT 10").bind(profileId, since, until).all()
      ]);
      return new Response(JSON.stringify({ summary: summary.results, trend: trend.results, top_allowed: topAllowed.results, top_blocked: topBlocked.results, clients: clients.results, destinations: destinations.results }), { headers: { 'Content-Type': 'application/json' } });
    }

    // 子资源路由: /api/profiles/:id/lists
    if (pathParts[3] === 'lists') {
      if (request.method === 'POST') {
        if (pathParts[4] === 'sync') { ctx.waitUntil(syncProfileLists(profileId, env, ctx)); return new Response(JSON.stringify({ message: "Sync started" }), { status: 202 }); }
        const { url: listUrl } = await request.json() as { url: string };
        await profileModel.addList(profileId, listUrl);
        ctx.waitUntil(syncProfileLists(profileId, env, ctx));
        ctx.waitUntil(pipeline.clearCache(profileId));
        return new Response(null, { status: 201 });
      }
      if (request.method === 'DELETE') {
        const { id } = await request.json() as { id: number };
        await profileModel.deleteList(id, profileId);
        ctx.waitUntil(syncProfileLists(profileId, env, ctx));
        ctx.waitUntil(pipeline.clearCache(profileId));
        return new Response(null, { status: 204 });
      }
    }

    // 子资源路由: /api/profiles/:id/rules
    if (pathParts[3] === 'rules') {
      if (request.method === 'GET') { const results = await profileModel.getRules(profileId); return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } }); }
      if (request.method === 'POST') { const rule = await request.json() as any; await profileModel.addRule(profileId, rule); ctx.waitUntil(pipeline.clearCache(profileId)); return new Response(null, { status: 201 }); }
      if (request.method === 'DELETE') { const { id } = await request.json() as any; await profileModel.deleteRule(id, profileId); ctx.waitUntil(pipeline.clearCache(profileId)); return new Response(null, { status: 204 }); }
    }
  }

  return new Response("Not Found", { status: 404 });
}
