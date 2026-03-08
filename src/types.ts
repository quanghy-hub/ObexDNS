import { D1Database, KVNamespace } from "@cloudflare/workers-types";

export interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

export interface ProfileSettings {
  upstream: string[]; // DoH URLs
  ecs: {
    enabled: boolean;
    use_client_ip: boolean;
    ipv4_cidr?: string;
    ipv6_cidr?: string;
  };
  log_retention_days: number;
  default_policy: 'ALLOW' | 'BLOCK';
}

export interface Profile {
  id: string; // 6-char ID
  owner_id: string;
  name: string;
  settings: string; // JSON string of ProfileSettings
  created_at: number;
  updated_at: number;
}

export interface User {
  id: string;
  username: string;
  role: 'admin' | 'user';
}
export interface Rule {
  id: number;
  profile_id: string;
  type: 'ALLOW' | 'BLOCK' | 'REDIRECT';
  pattern: string;
  v_a?: string;
  v_aaaa?: string;
  v_txt?: string;
  v_cname?: string;
}

export interface List {
  id: number;
  profile_id: string;
  url: string;
  enabled: boolean;
  last_synced_at?: number;
}

export interface ResolutionLog {
  profile_id: string;
  timestamp: number;
  client_ip: string;
  geo_country?: string;
  domain: string;
  record_type: string;
  action: 'PASS' | 'BLOCK' | 'REDIRECT' | 'FAIL';
  reason?: string;
  answer?: string; // Resolved IP(s) or CNAME
  dest_geoip?: string; // JSON string of destination GeoIP
  ecs?: string; // ECS info used (IP/Prefix)
  profile_name?: string; // For frontend display
  upstream?: string; // Upstream DoH URL used
  latency?: number; // ms
}

export interface Env {
  DB: D1Database;
  CACHE_KV: KVNamespace;
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  REGION_CONFIG_JSON?: string;
}

export interface Context {
  profileId: string;
  startTime: number;
  env: Env;
  ctx: ExecutionContext;
}

export interface DNSQuery {
  name: string;
  type: string;
  raw: Uint8Array;
}

export interface ResolutionResult {
  answer: Uint8Array;
  ttl: number;
  action: 'PASS' | 'BLOCK' | 'REDIRECT' | 'FAIL';
  reason?: string;
  latency?: number; // ms
  timings?: Record<string, number>; // Detailed breakdown
  diagnostics?: {
    upstream_url: string;
    method: string;
    status: number;
    response_text?: string;
    sent_dns_param?: string;
  };
}
