import { Env, List, ExecutionContext } from "../types";
import { parseList } from "./parser";
import { BloomFilter } from "./bloom";
import { pipelineCache } from "../pipeline/cache";

/**
 * 纯 R2 同步逻辑：不再依赖 profiles 表中的 list_bloom 字段
 */
export async function syncProfileLists(profileId: string, env: Env, ctx: ExecutionContext): Promise<void> {
  const { results: lists } = await env.DB.prepare("SELECT url FROM lists WHERE profile_id = ?").bind(profileId).all<List>();
  
  if (lists.length === 0) {
    // 如果没有订阅列表，清理 R2 中的旧数据
    if (env.BUCKET) await env.BUCKET.delete(`bloom/${profileId}.bin`);
    return;
  }

  const allDomains = new Set<string>();
  for (const list of lists) {
    try {
      const response = await fetch(list.url, { signal: AbortSignal.timeout(30000) });
      if (response.ok) {
        const domains = parseList(await response.text());
        domains.forEach(d => allDomains.add(d));
      }
    } catch (e) {
      console.error(`[Sync] Failed to fetch ${list.url}:`, e);
    }
  }

  const domainArray = Array.from(allDomains);
  const now = Math.floor(Date.now() / 1000);

  if (domainArray.length > 0 && env.BUCKET) {
    // 1. 构建高精度布隆过滤器 (10^-6)
    const bloom = BloomFilter.create(domainArray.length, 0.000001);
    domainArray.forEach(d => bloom.add(d));
    const binary = bloom.toUint8Array();

    // 2. 仅存储至 R2
    const r2Key = `bloom/${profileId}.bin`;
    await env.BUCKET.put(r2Key, binary, {
      httpMetadata: { contentType: 'application/octet-stream' },
      customMetadata: { 
        item_count: domainArray.length.toString(),
        synced_at: now.toString()
      }
    });

    // 3. 更新 lists 表记录的同步时间 (作为定时任务的索引)
    await env.DB.prepare("UPDATE lists SET last_synced_at = ? WHERE profile_id = ?").bind(now, profileId).run();

    // 4. 异步清理缓存
    if (ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(pipelineCache.clear(profileId));
    }

    console.log(`[Sync] Profile ${profileId}: ${domainArray.length} domains synced to R2.`);
  }
}
