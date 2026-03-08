import { cacheUtils } from "./cache";

export interface GeoIP {
  country: string;
  country_code: string;
  city?: string;
  isp?: string;
}

export async function fetchGeoIP(ip: string): Promise<GeoIP | null> {
  const cache = (caches as any).default;
  const cacheKey = `geoip:${ip}`;

  // Try Cache API
  const cached = await cacheUtils.get<GeoIP>(cache, cacheKey);
  if (cached) return cached;

  // Fetch from public API
  try {
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,city,isp`);
    const data = await response.json() as any;

    if (data.status === 'success') {
      const geo: GeoIP = {
        country: data.country,
        country_code: data.countryCode,
        city: data.city,
        isp: data.isp
      };

      // Store in Cache API, for 14 days
      await cacheUtils.set(cache, cacheKey, geo, 86400 * 14);
      return geo;
    }
  } catch (e) {
    console.error("GeoIP Fetch Error:", e);
  }

  return null;
}

