import { Context, DNSQuery, ResolutionResult } from "../types";
import { buildResponse } from "../utils/dns";
import { dnsCache, pipelineCache } from "./cache";
import { pipelineConfig } from "./config";
import { pipelineResolver } from "./resolver";
import { pipelineFilter } from "./filter";

export const pipeline = {
  clearCache: pipelineCache.clear,

  async process(request: Request, query: DNSQuery, context: Context): Promise<ResolutionResult> {
    const timings: Record<string, number> = {};
    let mark = context.startTime;
    const track = (name: string) => { const now = Date.now(); timings[name] = (timings[name] || 0) + (now - mark); mark = now; };

    // 1. 特殊域名 & 缓存检查 (L1)
    if (query.name.toLowerCase() === 'obex' && query.type === 'TXT') {
      const answer = buildResponse(query.raw, 'TXT', context.profileId || 'obex');
      return { answer, ttl: 60, action: "PASS", reason: "Internal Verification", latency: Date.now() - context.startTime, timings: { total: Date.now() - context.startTime } };
    }

    const cached = dnsCache.get(`${context.profileId}:${query.name}:${query.type}`);
    if (cached && Date.now() < cached.expiresAt) {
      const patched = new Uint8Array(cached.answer); 
      if (patched.length >= 2 && query.raw.length >= 2) {
        patched[0] = query.raw[0]; patched[1] = query.raw[1];
      }
      return { 
        answer: patched, 
        ttl: Math.ceil((cached.expiresAt - Date.now()) / 1000), 
        action: cached.action, 
        reason: cached.reason, 
        latency: Date.now() - context.startTime, 
        timings: { dns_cache_mem: Date.now() - context.startTime } 
      };
    }

    // 2. 加载配置
    const config = await pipelineConfig.load(context, track);
    if (!config) return { answer: new Uint8Array(), ttl: 0, action: "FAIL", reason: "Profile Not Found" };

    // 3. 匹配规则 (本地 + 外部)
    const matchResult = await pipelineFilter.match(request, query, context, config.settings, config.rules, config.bloom, track);
    if (matchResult) return { ...matchResult, timings: { ...timings, ...matchResult.timings } };

    // 4. 默认策略 & 最终解析
    if (config.settings.default_policy === 'BLOCK') {
      const block = await pipelineResolver.block(request, query, context, config.settings, "BLOCK", "Default Policy");
      return { ...block, timings: { ...timings, ...block.timings } };
    }

    const final = await pipelineResolver.resolve(request, query, context, config.settings, "PASS");
    return { ...final, timings: { ...timings, ...final.timings } };
  }
};
