import { Context, Env, User, ExecutionContext } from './types';
import { parseDNSQuery } from './utils/dns';
import { pipeline } from './pipeline';
import { initializeLucia } from './lib/auth';
import { handleAuthRequest } from './api/auth';
import { handleProfilesRequest } from './api/profiles';
import { handleAccountRequest } from './api/account';
import { LogModel } from './models/log';
import { ProfileModel } from './models/profile';
import { syncProfileLists } from './utils/sync';
import { ScheduledEvent } from '@cloudflare/workers-types';
import { cacheUtils } from './utils/cache';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const lucia = initializeLucia(env.DB);
    const cache = (caches as any).default;

    // Auth API 路由 (无需鉴权)
    if (url.pathname.startsWith('/api/auth/')) {
      return handleAuthRequest(request, env);
    }

    // Debug API 路由 (查看客户端信息)
    if (url.pathname === '/api/debug') {
      const clientIp = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
      const connectedProfileId = await cacheUtils.get<string>(cache, `active_dns:${clientIp}`);
      const cf = (request as any).cf;
      
      // 提取地区配置变量
      const regions: Record<string, any> = {};
      for (const [key, value] of Object.entries(env)) {
        if (key.startsWith('IP_REGION_') && typeof value === 'string') {
          try {
            const regionKey = key.replace('IP_REGION_', '');
            regions[regionKey] = JSON.parse(value.trim().replace(/^'|'$/g, ""));
          } catch (e) {}
        }
      }

      return new Response(JSON.stringify({
        ip: clientIp,
        country: cf?.country || "UNKNOWN",
        city: cf?.city || "UNKNOWN",
        asn: cf?.asn || 0,
        asOrganization: cf?.asOrganization || "UNKNOWN",
        connectedProfileId: connectedProfileId || null,
        regions
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // 鉴权中间件逻辑 (仅对 /api 路由生效)
    let currentUser: User | null = null;
    if (url.pathname.startsWith('/api/')) {
      const cookieHeader = request.headers.get("Cookie") || "";
      const sessionId = lucia.readSessionCookie(cookieHeader);
      if (sessionId) {
        const { user } = await lucia.validateSession(sessionId);
        if (user) currentUser = user as any;
      }
      
      const isAuthRoute = ['/api/auth/login', '/api/auth/signup'].includes(url.pathname);
      const isMobileConfigRoute = url.pathname.endsWith('/mobileconfig');
      
      if (!currentUser && !isAuthRoute && !isMobileConfigRoute) {
        return new Response("Unauthorized", { status: 401 });
      }

      // 业务 API 路由
      if (url.pathname.startsWith('/api/profiles')) {
        return handleProfilesRequest(request, env, currentUser, ctx);
      }
      if (url.pathname.startsWith('/api/account') || url.pathname.startsWith('/api/admin')) {
        return handleAccountRequest(request, env, currentUser!, ctx);
      }
      return new Response("API Not Found", { status: 404 });
    }

    // DoH 解析路由: /<6位ID>
    const profileIdMatch = url.pathname.match(/^\/([a-zA-Z0-9]{6})$/);
    if (profileIdMatch) {
      try {
        const profileId = profileIdMatch[1];
        const query = await parseDNSQuery(request);
        if (!query) return new Response('Invalid DNS Query', { status: 400 });
        const context: Context = { profileId, startTime: Date.now(), env, ctx };
        const result = await pipeline.process(request, query, context);

        // 异步处理：记录活跃连接与更新活跃时间 (Throttled)
        ctx.waitUntil((async () => {
          try {
            const clientIp = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
            // 1. 记录活跃连接（用于 Debug 页面）
            await cacheUtils.set(cache, `active_dns:${clientIp}`, profileId, 60);

            // 2. 记录账号/配置活跃时间 (每小时节流一次)
            const nowSec = Math.floor(Date.now() / 1000);
            const lastActiveKey = `active_throttle:${profileId}`;
            const lastActiveThrottled = await cacheUtils.get<number>(cache, lastActiveKey);
            
            if (!lastActiveThrottled || nowSec - lastActiveThrottled > 3600) {
              // 更新 Profile 活跃时间
              await env.DB.prepare("UPDATE profiles SET last_active_at = ? WHERE id = ?").bind(nowSec, profileId).run();
              // 级联更新 Owner 活跃时间
              await env.DB.prepare("UPDATE users SET last_active_at = ? WHERE id = (SELECT owner_id FROM profiles WHERE id = ?)").bind(nowSec, profileId).run();
              // 写入节流标记
              await cacheUtils.set(cache, lastActiveKey, nowSec, 3600);
            }
          } catch (e) {
            console.error(`[Background Task] Error for ${profileId}:`, e);
          }
        })());

        return new Response(result.answer as any, {
          headers: {
            'Content-Type': 'application/dns-message',
            'Cache-Control': `max-age=${result.ttl}`
          }
        });
      } catch (e: any) {
        console.error(`[DoH Pipeline] Internal Error:`, e);
        return new Response(`Internal Server Error: ${e.message}`, { status: 500 });
      }
    }

    // 静态资源托管与 SPA 回退
    try {
      let response = await (env as any).ASSETS.fetch(request);
      if (response.status === 404) {
        return await (env as any).ASSETS.fetch(new Request(url.origin + '/index.html', request));
      }
      return response;
    } catch (e) {
      return new Response("Asset Fetch Error", { status: 500 });
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const logModel = new LogModel(env.DB);
    const now = Math.floor(Date.now() / 1000);
    const inactivityThreshold = now - (180 * 24 * 3600); // 180 天
    
    // 清理 180 天无活动的普通用户 (级联删除其所有 Profile、规则和日志)
    try {
      await env.DB.prepare("DELETE FROM users WHERE role = 'user' AND last_active_at < ?").bind(inactivityThreshold).run();
    } catch (e) {
      console.error("[Cleanup] Failed to delete inactive users:", e);
    }

    // 原有的日志清理逻辑
    const { results: profiles } = await env.DB.prepare("SELECT id, settings FROM profiles").all<{id: string, settings: string}>();
    
    for (const profile of profiles) {
      try {
        const settings = JSON.parse(profile.settings);
        const days = settings.log_retention_days || 30; 
        const threshold = Math.floor(Date.now() / 1000 - (days * 24 * 3600));
        
        await logModel.cleanup(profile.id, threshold);
        // 定期同步外部列表
        ctx.waitUntil(syncProfileLists(profile.id, env, ctx));
      } catch (e) {
        console.error(`[Cleanup] Failed for profile ${profile.id}:`, e);
      }
    }
  }
};
