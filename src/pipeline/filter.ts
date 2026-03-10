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
        const answer = buildResponse(query.raw, query.type, val);
        const result = await pipelineResolver.block(request, query, context, "REDIRECT", `Rule: ${redirectRule.pattern}`, val);
        return { ...result, answer };
      }
    }

    // 3. 本地黑名单
    const blacklist = rules.filter(r => r.type === 'BLOCK');
    const blockRule = DNSFilter.findMatch(query.name, blacklist);
    if (blockRule) {
      track('local_rules');
      return pipelineResolver.block(request, query, context, "BLOCK", `Blacklist: ${blockRule.pattern}`);
    }
    track('local_rules');

    // 4. 外部列表过滤
    if (bloom && bloom.test(domainLower)) {
      track('bloom_check');
      const cache = (caches as any).default;
      const verdictCacheKey = `verdict_v2:${context.profileId}:${domainLower}`;
      const cachedVerdict = await cacheUtils.get<string>(cache, verdictCacheKey);
      
      if (cachedVerdict === 'BLOCK') {
        track('verdict_cache_hit');
        return pipelineResolver.block(request, query, context, "BLOCK", "External List (Cached)");
      } else if (cachedVerdict !== 'PASS') {
        const entry = await context.env.DB.prepare("SELECT domain FROM list_entries WHERE profile_id = ? AND domain = ?")
          .bind(context.profileId, domainLower).first();
        
        if (entry) {
          context.ctx.waitUntil(cacheUtils.set(cache, verdictCacheKey, 'BLOCK', 3600));
          track('db_list_lookup');
          return pipelineResolver.block(request, query, context, "BLOCK", "External List");
        } else {
          context.ctx.waitUntil(cacheUtils.set(cache, verdictCacheKey, 'PASS', 3600));
          track('db_list_lookup');
        }
      }
    } else if (bloom) {
      track('bloom_check');
    }

    return null;
  }
};
