import { ProfileSettings, Rule } from "../types";
import { BloomFilter } from "../utils/bloom";
import { cacheUtils } from "../utils/cache";

export interface ConfigCacheEntry {
  settings: ProfileSettings;
  rules: Rule[];
  timestamp: number;
}

// --- L1 Memory Cache (Isolate 全局) ---
export const configCache = new Map<string, ConfigCacheEntry>();
export const bloomMemoryMap = new Map<string, { bloom: BloomFilter; ts: number }>();
export const dnsCache = new Map<string, any>();

export const pipelineCache = {
  async clear(profileId: string) {
    // 1. 清理 L1 (内存)
    configCache.delete(profileId);
    bloomMemoryMap.delete(profileId);
    for (const key of dnsCache.keys()) {
      if (key.startsWith(`${profileId}:`)) dnsCache.delete(key);
    }
    
    // 2. 清理 L2 (Cache API)
    try {
      const cache = (caches as any).default;
      await Promise.all([
        cacheUtils.delete(cache, `profile_v6:${profileId}`),
        cache.delete(`https://obex.local/bloom-bin/${profileId}`)
      ]);
    } catch (e) {
      console.error("Failed to clear cache API:", e);
    }
  }
};
