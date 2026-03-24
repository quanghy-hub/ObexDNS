import { Context, DNSQuery, ResolutionResult, ProfileSettings, Rule } from "../types";
import { DNSFilter } from "../lib/filtering";
import { BloomFilter } from "../utils/bloom";
import { cacheUtils } from "../utils/cache";
import { buildResponse } from "../utils/dns";
import { pipelineResolver } from "./resolver";

export const pipelineFilter = {
  async match(
    request: Request,
    query: DNSQuery,
    context: Context,
    settings: ProfileSettings,
    rules: Rule[],
    bloom: BloomFilter | undefined,
    track: (name: string) => void
  ): Promise<ResolutionResult | null> {
    const domainLower = query.name.toLowerCase();

    // 1. 本地白名单
    const whitelist = rules.filter(r => r.type === 'ALLOW');
    if (DNSFilter.findMatch(query.name, whitelist)) {
      track('local_rules');
      return pipelineResolver.resolve(request, query, context, settings, "PASS", "Whitelist");
    }

    // 2. 本地重定向
    const redirections = rules.filter(r => r.type === 'REDIRECT');
    const redirectRule = DNSFilter.findMatch(query.name, redirections);
    if (redirectRule) {
      let val: string | undefined;
      if (query.type === 'A') val = redirectRule.v_a;
      else if (query.type === 'AAAA') val = redirectRule.v_aaaa;
      else if (query.type === 'TXT') val = redirectRule.v_txt;
      else if (query.type === 'CNAME') val = redirectRule.v_cname;

      if (val) {
        track('local_rules');
        const result = await pipelineResolver.block(request, query, context, settings, "REDIRECT", `Rule: ${redirectRule.pattern}`, val);
        return result;
      }
    }

    // 3. 本地黑名单
    const blacklist = rules.filter(r => r.type === 'BLOCK');
    const blockRule = DNSFilter.findMatch(query.name, blacklist);
    if (blockRule) {
      track('local_rules');
      return pipelineResolver.block(request, query, context, settings, "BLOCK", `Blacklist: ${blockRule.pattern}`);
    }
    track('local_rules');

    // 4. 外部列表过滤 (支持子域名后缀匹配，完全基于高精度布隆过滤器)
    if (bloom) {
      const segments = domainLower.split('.');
      // 从长到短尝试匹配 (例如: a.b.c.com -> b.c.com -> c.com)
      for (let i = 0; i < segments.length - 1; i++) {
        const checkDomain = segments.slice(i).join('.');
        
        // 性能优化：先查 L2 缓存 (Verdict)
        const cache = (caches as any).default;
        const verdictCacheKey = `verdict_v3:${context.profileId}:${checkDomain}`;
        const cachedVerdict = await cacheUtils.get<string>(cache, verdictCacheKey);
        
        if (cachedVerdict === 'BLOCK') {
          track('verdict_cache_hit');
          return pipelineResolver.block(request, query, context, settings, "BLOCK", `External List: ${checkDomain} (Cached)`);
        }

        if (bloom.test(checkDomain)) {
          track('bloom_check');
          // 降低假阳性率，直接信任布隆过滤器结果
          context.ctx.waitUntil(cacheUtils.set(cache, verdictCacheKey, 'BLOCK', 3600));
          return pipelineResolver.block(request, query, context, settings, "BLOCK", `External List: ${checkDomain}`);
        }
      }
      track('bloom_check');
    }

    return null;
  }
};
