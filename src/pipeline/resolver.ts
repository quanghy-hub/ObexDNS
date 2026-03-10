import { Context, DNSQuery, ResolutionResult, ProfileSettings } from "../types";
import { LogModel } from "../models/log";
import { fetchGeoIP } from "../utils/geoip";
import { parseDNSAnswer } from "../utils/dns";
import { dnsCache } from "./cache";

export const pipelineResolver = {
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

  async block(request: Request, query: DNSQuery, context: Context, action: 'BLOCK' | 'REDIRECT', reason: string, customAnswer?: string): Promise<ResolutionResult> {
    const logModel = new LogModel(context.env.DB);
    const clientIp = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
    const answer = new Uint8Array(query.raw);

    // 如果是 BLOCK，RCODE=3 (NXDOMAIN)
    if (action === 'BLOCK') {
      answer[2] = (answer[2] | 0x80); // QR = 1
      answer[3] = 0x83; // RA=1, RCODE=3
      answer[6] = 0;
      answer[7] = 0;
      answer[8] = 0; answer[9] = 0; // NSCOUNT = 0
      answer[10] = 0; answer[11] = 0; // ARCOUNT = 0
    }

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
      answer: customAnswer || (action === 'BLOCK' ? "NXDOMAIN" : "REDIRECT"),
      latency
    }));

    return { answer, ttl: 3600, action, reason, latency };
  }
};
