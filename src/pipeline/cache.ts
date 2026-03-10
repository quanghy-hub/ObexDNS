import { ProfileSettings, Rule } from "../types";
import { BloomFilter } from "../utils/bloom";
import { cacheUtils } from "../utils/cache";

export interface ConfigCacheEntry {
  settings: ProfileSettings;
  rules: Rule[];
  bloom?: BloomFilter;
  timestamp: number;
}

export interface DNSCacheEntry {
  answer: Uint8Array;
  ttl: number;
  action: 'PASS' | 'BLOCK' | 'REDIRECT' | 'FAIL';
  reason?: string;
  expiresAt: number;
}

export const configCache = new Map<string, ConfigCacheEntry>();
export const dnsCache = new Map<string, DNSCacheEntry>();

export const pipelineCache = {
  async clear(profileId: string) {
    configCache.delete(profileId);
    for (const key of dnsCache.keys()) {
      if (key.startsWith(`${profileId}:`)) dnsCache.delete(key);
    }
    
    try {
      const cache = (caches as any).default;
      const cacheKey = `profile:${profileId}`;
      await cacheUtils.delete(cache, cacheKey);
    } catch (e) {
      console.error("Failed to clear cache API:", e);
    }
  }
};
