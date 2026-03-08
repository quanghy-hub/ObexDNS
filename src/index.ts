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
      return new Response(JSON.stringify({
        ip: clientIp,
        country: cf?.country || "UNKNOWN",
        city: cf?.city || "UNKNOWN",
        asn: cf?.asn || 0,
        asOrganization: cf?.asOrganization || "UNKNOWN",
        connectedProfileId: connectedProfileId || null,
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
      const profileId = profileIdMatch[1];
      const query = await parseDNSQuery(request);
      if (!query) return new Response('Invalid DNS Query', { status: 400 });
      const context: Context = { profileId, startTime: Date.now(), env, ctx };
      const result = await pipeline.process(request, query, context);

      // 优化：使用 Cache API 替代 KV 记录活跃连接，减少计费操作
      const clientIp = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
      ctx.waitUntil(cacheUtils.set(cache, `active_dns:${clientIp}`, profileId, 60));

      return new Response(result.answer as any, {
        headers: {
          'Content-Type': 'application/dns-message',
          'Cache-Control': `max-age=${result.ttl}`
        }
      });
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
    
    // 获取所有配置的留存天数
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
