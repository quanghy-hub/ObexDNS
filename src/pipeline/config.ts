import { Context, ProfileSettings, Rule } from "../types";
import { ProfileModel } from "../models/profile";
import { BloomFilter } from "../utils/bloom";
import { cacheUtils } from "../utils/cache";
import { configCache } from "./cache";

const CACHE_TTL_MS = 1800000; // 30分钟

export const pipelineConfig = {
  async load(context: Context, track: (name: string) => void): Promise<{ settings: ProfileSettings; rules: Rule[]; bloom?: BloomFilter } | null> {
    const cachedConfig = configCache.get(context.profileId);
    
    if (cachedConfig && (Date.now() - cachedConfig.timestamp < CACHE_TTL_MS)) {
      track('load_config_mem');
      return cachedConfig;
    }

    const cache = (caches as any).default;
    const cacheKey = `profile:${context.profileId}`;
    const apiCached = await cacheUtils.get<any>(cache, cacheKey);
    
    if (apiCached) {
      const settings = apiCached.settings;
      const rules = apiCached.rules;
      const bloom = apiCached.bloom ? BloomFilter.load(apiCached.bloom) : undefined;
      configCache.set(context.profileId, { settings, rules, bloom, timestamp: Date.now() });
      track('load_config_cache_api');
      return { settings, rules, bloom };
    }

    const profileModel = new ProfileModel(context.env.DB);
    const profile = await profileModel.getById(context.profileId);
    if (!profile) return null;
    
    const settings = JSON.parse(profile.settings);
    const rules = await profileModel.getRules(context.profileId);
    const bloom = profile.list_bloom ? BloomFilter.load(JSON.parse(profile.list_bloom)) : undefined;
    
    const configToCache = { settings, rules, bloom: bloom?.dump() };
    configCache.set(context.profileId, { settings, rules, bloom, timestamp: Date.now() });
    context.ctx.waitUntil(cacheUtils.set(cache, cacheKey, configToCache, 1800));
    track('load_config_db');
    
    return { settings, rules, bloom };
  }
};
