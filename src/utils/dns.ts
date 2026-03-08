import { DNSQuery } from "../types";

/**
 * 解析 DNS 域名（支持压缩指针 0xC0）
 */
function decodeName(buffer: Uint8Array, offset: number): { name: string; read: number } {
  let name = "";
  let curr = offset;
  let jumped = false;
  let consumed = 0;
  let iterations = 0;

  while (iterations < 128) {
    const len = buffer[curr];
    if (len === 0) {
      if (!jumped) consumed++;
      break;
    }

    if ((len & 0xc0) === 0xc0) {
      const pointer = ((len & 0x3f) << 8) | buffer[curr + 1];
      if (!jumped) {
        consumed += 2;
        jumped = true;
      }
      curr = pointer;
      iterations++;
      continue;
    }

    if (name.length > 0) name += ".";
    for (let i = 0; i < len; i++) {
      name += String.fromCharCode(buffer[curr + 1 + i]);
    }
    if (!jumped) consumed += len + 1;
    curr += len + 1;
    iterations++;
  }

  return { name, read: consumed };
}

export async function parseDNSQuery(request: Request): Promise<DNSQuery | null> {
  let raw: Uint8Array;

  if (request.method === "GET") {
    const url = new URL(request.url);
    const dnsParam = url.searchParams.get("dns");
    if (!dnsParam) return null;

    const base64 = dnsParam.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64);
    raw = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      raw[i] = binary.charCodeAt(i);
    }
  } else if (request.method === "POST") {
    const buffer = await request.arrayBuffer();
    raw = new Uint8Array(buffer);
  } else {
    return null;
  }

  try {
    // 使用新的 decodeName 替代旧的解析函数
    const { name, read } = decodeName(raw, 12);
    const qtypeOffset = 12 + read;
    const qtypeCode = (raw[qtypeOffset] << 8) | raw[qtypeOffset + 1];
    
    return {
      name,
      type: getQTypeName(qtypeCode),
      raw
    };
  } catch (e) {
    console.error("DNS Parse Error:", e);
    return null;
  }
}

function getQTypeName(type: number): string {
  const types: Record<number, string> = {
    1: "A",
    2: "NS",
    5: "CNAME",
    6: "SOA",
    12: "PTR",
    15: "MX",
    16: "TXT",
    28: "AAAA",
    33: "SRV",
    41: "OPT",
    64: "SVCB",
    65: "HTTPS",
    255: "ANY"
  };
  return types[type] || `TYPE${type}`;
}

export function buildDNSQuery(name: string, type: string): Uint8Array {
  const header = new Uint8Array(12);
  const id = Math.floor(Math.random() * 65535);
  header[0] = id >> 8;
  header[1] = id & 0xff;
  header[2] = 0x01; // QR=0, Opcode=0, AA=0, TC=0, RD=1
  header[3] = 0x00; // RA=0, Z=0, RCODE=0
  header[4] = 0x00; // QDCOUNT (High)
  header[5] = 0x01; // QDCOUNT (Low) - 1 Question
  header[6] = 0x00; // ANCOUNT
  header[7] = 0x00;
  header[8] = 0x00; // NSCOUNT
  header[9] = 0x00;
  header[10] = 0x00; // ARCOUNT
  header[11] = 0x00;

  const labels = name.split(".");
  const question = [];
  for (const label of labels) {
    question.push(label.length);
    for (let i = 0; i < label.length; i++) {
      question.push(label.charCodeAt(i));
    }
  }
  question.push(0); // Root

  const typeMap: Record<string, number> = { "A": 1, "AAAA": 28, "CNAME": 5, "MX": 15, "TXT": 16 };
  const typeCode = typeMap[type] || 1;
  question.push(typeCode >> 8);
  question.push(typeCode & 0xff);
  question.push(0x00); // Class IN
  question.push(0x01);

  const raw = new Uint8Array(header.length + question.length);
  raw.set(header);
  raw.set(question, header.length);
  return raw;
}

export function parseDNSAnswer(raw: Uint8Array): { type: string; data: string; ttl: number }[] {
  if (raw.length < 12) return [];
  const ansCount = (raw[6] << 8) | raw[7];
  if (ansCount === 0) return [];

  const results: { type: string; data: string; ttl: number }[] = [];
  let offset = 12;

  const qCount = (raw[4] << 8) | raw[5];
  for (let i = 0; i < qCount; i++) {
    const { read } = decodeName(raw, offset);
    offset += read + 4;
  }

  for (let i = 0; i < ansCount; i++) {
    const { read: nameRead } = decodeName(raw, offset);
    offset += nameRead;

    const typeCode = (raw[offset] << 8) | raw[offset + 1];
    const ttl = (raw[offset + 4] << 24) | (raw[offset + 5] << 16) | (raw[offset + 6] << 8) | raw[offset + 7];
    const rdLength = (raw[offset + 8] << 8) | raw[offset + 9];
    offset += 10;

    const type = getQTypeName(typeCode);
    let data = "";

    if (type === "A" && rdLength === 4) {
      data = `${raw[offset]}.${raw[offset+1]}.${raw[offset+2]}.${raw[offset+3]}`;
    } else if (type === "AAAA" && rdLength === 16) {
      const parts = [];
      for (let j = 0; j < 16; j += 2) {
        parts.push(((raw[offset + j] << 8) | raw[offset + j + 1]).toString(16));
      }
      data = parts.join(':').replace(/(:0)+:/, '::');
    } else if (type === "CNAME" || type === "NS" || type === "PTR") {
      data = decodeName(raw, offset).name;
    } else if (type === "TXT") {
      const txtLen = raw[offset];
      data = String.fromCharCode(...raw.slice(offset + 1, offset + 1 + txtLen));
    } else if (type === "HTTPS" || type === "SVCB") {
      // HTTPS/SVCB 格式: 优先级(2字节) + 目标域名(变长) + 参数(变长)
      const priority = (raw[offset] << 8) | raw[offset + 1];
      const { name: target } = decodeName(raw, offset + 2);
      data = `priority: ${priority}, target: ${target || "."}`;
      if (rdLength > 2) data += ` [params: ${rdLength - 2} bytes]`;
    } else {
      data = `[Raw: ${rdLength} bytes]`;
    }

    results.push({ type, data, ttl });
    offset += rdLength;
  }

  return results;
}

export function buildResponse(queryRaw: Uint8Array, type: string, value: string, ttl: number = 60): Uint8Array {
  let data: number[] = [];
  if (type === 'A') {
    data = value.split('.').map(v => parseInt(v));
  } else if (type === 'AAAA') {
    const parts = value.split(':');
    for (const part of parts) {
      const v = parseInt(part, 16);
      data.push(v >> 8);
      data.push(v & 0xff);
    }
  } else if (type === 'CNAME') {
    const labels = value.split('.');
    for (const label of labels) {
      data.push(label.length);
      for (let i = 0; i < label.length; i++) data.push(label.charCodeAt(i));
    }
    data.push(0);
  } else if (type === 'TXT') {
    data.push(value.length);
    for (let i = 0; i < value.length; i++) data.push(value.charCodeAt(i));
  }

  const response = new Uint8Array(queryRaw.length + 10 + data.length);
  response.set(queryRaw);
  
  response[2] = 0x85; response[3] = 0x80;
  response[6] = 0x00; response[7] = 0x01;
  
  let offset = queryRaw.length;
  response[offset++] = 0xc0; response[offset++] = 0x0c;
  
  const typeMap: Record<string, number> = { "A": 1, "AAAA": 28, "CNAME": 5, "TXT": 16 };
  const typeCode = typeMap[type] || 1;
  response[offset++] = typeCode >> 8; response[offset++] = typeCode & 0xff;
  response[offset++] = 0x00; response[offset++] = 0x01;
  response[offset++] = (ttl >> 24) & 0xff; response[offset++] = (ttl >> 16) & 0xff;
  response[offset++] = (ttl >> 8) & 0xff; response[offset++] = ttl & 0xff;
  response[offset++] = data.length >> 8; response[offset++] = data.length & 0xff;
  for (const b of data) response[offset++] = b;
  
  return response.slice(0, offset);
}
