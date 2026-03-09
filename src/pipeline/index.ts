import { Context, DNSQuery, ResolutionResult, ProfileSettings, ResolutionLog, Rule } from "../types";
import { ProfileModel, ProfileWithBloom } from "../models/profile";
import { LogModel } from "../models/log";
import { DNSFilter } from "../lib/filtering";
import { parseDNSAnswer, buildResponse } from "../utils/dns";
import { fetchGeoIP } from "../utils/geoip";
import { BloomFilter } from "../utils/bloom";
import { cacheUtils } from "../utils/cache";

interface ConfigCacheEntry {
  settings: ProfileSettings;
  rules: Rule[];
  bloom?: BloomFilter;
  timestamp: number;
}

interface DNSCacheEntry {
  answer: Uint8Array;
  ttl: number;
  action: 'PASS' | 'BLOCK' | 'REDIRECT' | 'FAIL';
  reason?: string;
  expiresAt: number;
}

const configCache = new Map<string, ConfigCacheEntry>();
const dnsCache = new Map<string, DNSCacheEntry>();

const CACHE_TTL_MS = 1800000; // 30分钟

export const pipeline = {
  async clearCache(profileId: string) {
    configCache.delete(profileId);
    for (const key of dnsCache.keys()) {
      if (key.startsWith(`${profileId}:`)) dnsCache.delete(key);
    }
    
    // 清理 Cache API 中的配置
    try {
      const cache = (caches as any).default;
      const cacheKey = `profile:${profileId}`;
      await cacheUtils.delete(cache, cacheKey);
    } catch (e) {
      console.error("Failed to clear cache API:", e);
    }
  },

  async process(request: Request, query: DNSQuery, context: Context): Promise<ResolutionResult> {
    const timings: Record<string, number> = {};
    let mark = context.startTime;
    const cache = (caches as any).default;

    const track = (name: string) => {
      const now = Date.now();
      timings[name] = (timings[name] || 0) + (now - mark);
      mark = now;
    };

    // 特殊域名拦截 (obex. -> TXT 返回 profileId)
    if (query.name.toLowerCase() === 'obex' && query.type === 'TXT') {
      const answer = buildResponse(query.raw, 'TXT', context.profileId || 'obex');
      const latency = Date.now() - context.startTime;
      return { answer, ttl: 60, action: "PASS", reason: "Internal Verification", latency, timings: { total: latency } };
    }

    // DNS 响应缓存 (L1 Memory Cache)
    const dnsCacheKey = `${context.profileId}:${query.name}:${query.type}`;
    const cachedDNS = dnsCache.get(dnsCacheKey);
    if (cachedDNS && Date.now() < cachedDNS.expiresAt) {
      const patchedAnswer = new Uint8Array(cachedDNS.answer);
      patchedAnswer[0] = query.raw[0]; patchedAnswer[1] = query.raw[1];
      const latency = Date.now() - context.startTime;
      return {
        answer: patchedAnswer,
        ttl: Math.ceil((cachedDNS.expiresAt - Date.now()) / 1000),
        action: cachedDNS.action,
        reason: cachedDNS.reason,
        latency,
        timings: { dns_cache_mem: latency }
      };
    }

    // 配置加载 (Memory -> Cache API -> D1)
    let settings: ProfileSettings;
    let rules: Rule[];
    let bloom: BloomFilter | undefined;
    
    const cachedConfig = configCache.get(context.profileId);
    if (cachedConfig && (Date.now() - cachedConfig.timestamp < CACHE_TTL_MS)) {
      settings = cachedConfig.settings;
      rules = cachedConfig.rules;
      bloom = cachedConfig.bloom;
      track('load_config_mem');
    } else {
      const cacheKey = `profile:${context.profileId}`;
      const apiCached = await cacheUtils.get<any>(cache, cacheKey);
      
      if (apiCached) {
        settings = apiCached.settings;
        rules = apiCached.rules;
        bloom = apiCached.bloom ? BloomFilter.load(apiCached.bloom) : undefined;
        configCache.set(context.profileId, { settings, rules, bloom, timestamp: Date.now() });
        track('load_config_cache_api');
      } else {
        const profileModel = new ProfileModel(context.env.DB);
        const profile = await profileModel.getById(context.profileId);
        if (!profile) return { answer: new Uint8Array(), ttl: 0, action: "FAIL", reason: "Profile Not Found" };
        
        settings = JSON.parse(profile.settings);
        rules = await profileModel.getRules(context.profileId);
        bloom = profile.list_bloom ? BloomFilter.load(JSON.parse(profile.list_bloom)) : undefined;
        
        const configToCache = { settings, rules, bloom: bloom?.dump() };
        configCache.set(context.profileId, { settings, rules, bloom, timestamp: Date.now() });
        context.ctx.waitUntil(cacheUtils.set(cache, cacheKey, configToCache, 1800));
        track('load_config_db');
      }
    }

    const domainLower = query.name.toLowerCase();

    // 本地规则匹配 (Whitelist -> Redirect -> Blacklist)
    const whitelist = rules.filter(r => r.type === 'ALLOW');
    if (DNSFilter.findMatch(query.name, whitelist)) {
      track('local_rules');
      const result = await this.resolve(request, query, context, settings, "PASS", "Whitelist");
      return { ...result, timings: { ...timings, ...result.timings } };
    }

    const redirections = rules.filter(r => r.type === 'REDIRECT');
    const redirectRule = DNSFilter.findMatch(query.name, redirections);
    if (redirectRule) {
      let redirectValue: string | undefined;
      if (query.type === 'A') redirectValue = redirectRule.v_a;
      else if (query.type === 'AAAA') redirectValue = redirectRule.v_aaaa;
      else if (query.type === 'TXT') redirectValue = redirectRule.v_txt;
      else if (query.type === 'CNAME') redirectValue = redirectRule.v_cname;

      if (redirectValue) {
        track('local_rules');
        const answer = buildResponse(query.raw, query.type, redirectValue);
        const latency = Date.now() - context.startTime;
        const logModel = new LogModel(context.env.DB);
        context.ctx.waitUntil(logModel.insert({
          profile_id: context.profileId,
          timestamp: Math.floor(Date.now() / 1000),
          client_ip: request.headers.get("CF-Connecting-IP") || "127.0.0.1",
          domain: query.name,
          record_type: query.type,
          action: 'REDIRECT',
          reason: `Rule: ${redirectRule.pattern}`,
          answer: redirectValue,
          latency
        }));
        return { answer, ttl: 60, action: "REDIRECT", reason: `Redirect: ${redirectRule.pattern}`, latency, timings };
      }
    }

    const blacklist = rules.filter(r => r.type === 'BLOCK');
    const blockRule = DNSFilter.findMatch(query.name, blacklist);
    if (blockRule) {
      track('local_rules');
      const result = await this.block(request, query, context, "BLOCK", `Blacklist: ${blockRule.pattern}`);
      return { ...result, timings };
    }
    track('local_rules');

    // 外部列表过滤 (D1 + Bloom Filter + Cache API) - 无 KV 参与
    if (bloom) {
      if (bloom.test(domainLower)) {
        track('bloom_check');
        
        const verdictCacheKey = `verdict_v2:${context.profileId}:${domainLower}`;
        const cachedVerdict = await cacheUtils.get<string>(cache, verdictCacheKey);
        
        if (cachedVerdict === 'BLOCK') {
          track('verdict_cache_hit');
          const result = await this.block(request, query, context, "BLOCK", "External List (Cached)");
          return { ...result, timings: { ...timings, ...result.timings } };
        } else if (cachedVerdict === 'PASS') {
          track('verdict_cache_hit');
        } else {
          // 实际查询 D1
          const entry = await context.env.DB.prepare("SELECT domain FROM list_entries WHERE profile_id = ? AND domain = ?")
            .bind(context.profileId, domainLower).first();
          
          if (entry) {
            context.ctx.waitUntil(cacheUtils.set(cache, verdictCacheKey, 'BLOCK', 3600));
            track('db_list_lookup');
            const result = await this.block(request, query, context, "BLOCK", "External List");
            return { ...result, timings: { ...timings, ...result.timings } };
          } else {
            context.ctx.waitUntil(cacheUtils.set(cache, verdictCacheKey, 'PASS', 3600));
            track('db_list_lookup');
          }
        }
      } else {
        track('bloom_check');
      }
    }

    if (settings.default_policy === 'BLOCK') {
      const result = await this.block(request, query, context, "BLOCK", "Default Policy");
      return { ...result, timings };
    }

    // 请求上游
    const result = await this.resolve(request, query, context, settings, "PASS");
    return { ...result, timings: { ...timings, ...result.timings } };
  },

  async resolve(request: Request, query: DNSQuery, context: Context, settings: ProfileSettings, action: 'PASS', reason?: string): Promise<ResolutionResult> {
    const logModel = new LogModel(context.env.DB);
    let upstreamUrl = settings.upstream[0] || "https://security.cloudflare-dns.com/dns-query";
    const startFetch = Date.now();

    const targetUrl = new URL(upstreamUrl);
    targetUrl.searchParams.set('dns', btoa(String.fromCharCode(...query.raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''));

    if (settings.ecs?.enabled) {
      const clientIp = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
      let ecs = settings.ecs.use_client_ip ? `${clientIp}/${clientIp.includes(':') ? 48 : 24}` : (settings.ecs.ipv4_cidr || settings.ecs.ipv6_cidr);
      if (ecs) targetUrl.searchParams.set('edns_client_subnet', ecs);
    }

    try {
      const response = await fetch(targetUrl.toString(), {
        method: "GET",
        headers: { "Accept": "application/dns-message", "User-Agent": "Obex-DNS/1.0" }
      });

      if (!response.ok) return { 
        answer: new Uint8Array(), 
        ttl: 0, 
        action: "FAIL", 
        reason: `Upstream HTTP ${response.status}`,
        diagnostics: {
          upstream_url: targetUrl.toString(),
          method: "GET",
          status: response.status
        }
      };

      const answerBuffer = await response.arrayBuffer();
      const answer = new Uint8Array(answerBuffer);
      const upstreamLatency = Date.now() - startFetch;

      const parsedAnswers = parseDNSAnswer(answer);
      const minTTL = parsedAnswers.length > 0 ? Math.max(10, Math.min(...parsedAnswers.map(a => a.ttl))) : 60;

      context.ctx.waitUntil((async () => {
        const clientIp = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
        const firstIp = parsedAnswers.find(a => a.type === 'A' || a.type === 'AAAA')?.data;
        let destGeoJson = "";
        if (firstIp) {
          const geo = await fetchGeoIP(firstIp);
          if (geo) destGeoJson = JSON.stringify(geo);
        }

        const latency = Date.now() - context.startTime;
        await logModel.insert({
          profile_id: context.profileId,
          timestamp: Math.floor(Date.now() / 1000),
          client_ip: clientIp,
          geo_country: (request as any).cf?.country || "UN",
          domain: query.name,
          record_type: query.type,
          action,
          reason,
          answer: parsedAnswers.map(a => a.data).join(", "),
          dest_geoip: destGeoJson,
          upstream: upstreamUrl,
          latency
        });

        dnsCache.set(`${context.profileId}:${query.name}:${query.type}`, {
          answer, ttl: minTTL, action, reason, expiresAt: Date.now() + (minTTL * 1000)
        });
      })());

      return { 
        answer, 
        ttl: minTTL, 
        action, 
        reason, 
        latency: Date.now() - context.startTime, 
        timings: { upstream_fetch: upstreamLatency },
        diagnostics: {
          upstream_url: targetUrl.toString(),
          method: "GET",
          status: response.status
        }
      };
    } catch (e: any) {
      return { 
        answer: new Uint8Array(), 
        ttl: 0, 
        action: "FAIL", 
        reason: `Net Error: ${e.message}`,
        diagnostics: {
          upstream_url: targetUrl.toString(),
          method: "GET",
          status: 0
        }
      };
    }
  },

  async block(request: Request, query: DNSQuery, context: Context, action: 'BLOCK', reason: string): Promise<ResolutionResult> {
    const logModel = new LogModel(context.env.DB);
    const clientIp = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
    const answer = new Uint8Array(query.raw);
    answer[2] = 0x81; answer[3] = 0x83; // NXDOMAIN

    const latency = Date.now() - context.startTime;
    context.ctx.waitUntil(logModel.insert({
      profile_id: context.profileId,
      timestamp: Math.floor(Date.now() / 1000),
      client_ip: clientIp,
      geo_country: (request as any).cf?.country || "UN",
      domain: query.name,
      record_type: query.type,
      action,
      reason,
      answer: "NXDOMAIN",
      latency
    }));

    return { answer, ttl: 3600, action, reason, latency };
  }
};
