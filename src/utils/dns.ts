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
    if (curr >= buffer.length) break; // 边界检查
    const len = buffer[curr];
    
    if (len === 0) {
      if (!jumped) consumed++;
      break;
    }

    if ((len & 0xc0) === 0xc0) {
      if (curr + 1 >= buffer.length) break; // 指针字节不足
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
    // 检查标签内容是否超出范围
    if (curr + 1 + len > buffer.length) break;
    
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
  try {
    let raw: Uint8Array;

    if (request.method === "GET") {
      const url = new URL(request.url);
      const dnsParam = url.searchParams.get("dns");
      if (!dnsParam) return null;

      let base64 = dnsParam.replace(/-/g, "+").replace(/_/g, "/");
      while (base64.length % 4) base64 += '=';
      
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

    // 基础长度检查：Header(12) + QTYPE(2) + QCLASS(2) = 16
    if (raw.length < 16) return null;

    const { name, read } = decodeName(raw, 12);
    const qtypeOffset = 12 + read;
    
    // 再次检查剩余长度
    if (qtypeOffset + 4 > raw.length) return null;
    
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

export function buildResponse(queryRaw: Uint8Array, type: string, value: string, ttl: number = 60, rcode: number = 0): Uint8Array {
  try {
    if (!queryRaw || queryRaw.length < 12) {
      // 极端情况：包太短，返回一个最简错误包
      const err = new Uint8Array(12);
      err[2] = 0x81; err[3] = 0x82; // Server Failure
      return err;
    }

    // 1. 准备 Header (12 字节)
    const header = new Uint8Array(12);
    header.set(queryRaw.slice(0, 12));
    header[2] = (header[2] & 0x01) | 0x84; // QR=1, AA=1, 继承 RD
    header[3] = 0x80 | (rcode & 0x0F);    // RA=1, RCODE
    
    // 2. 提取 Question Section (紧跟 Header 之后)
    let qEnd = 12;
    const qCount = (queryRaw[4] << 8) | queryRaw[5];
    for (let i = 0; i < qCount; i++) {
      const { read } = decodeName(queryRaw, qEnd);
      if (read === 0 && qEnd < queryRaw.length) {
        qEnd++; // 安全步进
      } else {
        qEnd += read + 4;
      }
      if (qEnd > queryRaw.length) { qEnd = queryRaw.length; break; }
    }
    const questionSection = queryRaw.slice(12, qEnd);
    
    header[4] = (qCount >> 8) & 0xff; header[5] = qCount & 0xff; // 保持原始问题数
    header[6] = 0; header[7] = value ? 1 : 0; // ANCOUNT
    header[8] = 0; header[9] = 0;             // NSCOUNT
    header[10] = 0; header[11] = 0;           // ARCOUNT (丢弃额外的附加记录)

    if (!value) {
      const res = new Uint8Array(12 + questionSection.length);
      res.set(header);
      res.set(questionSection, 12);
      return res;
    }

    // 3. 准备 Answer 内容
    let data: number[] = [];
    if (type === 'A') {
      data = value.split('.').map(v => parseInt(v) || 0);
    } else if (type === 'AAAA') {
      const parts = value.split(':');
      for (const part of parts) {
        const v = parseInt(part || "0", 16);
        data.push((v >> 8) & 0xff);
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
      const safeVal = value.substring(0, 255);
      data.push(safeVal.length);
      for (let i = 0; i < safeVal.length; i++) data.push(safeVal.charCodeAt(i));
    }

    const answerRR = new Uint8Array(10 + data.length);
    answerRR[0] = 0xc0; answerRR[1] = 0x0c; // 压缩指针指向第一个问题
    const typeMap: Record<string, number> = { "A": 1, "AAAA": 28, "CNAME": 5, "TXT": 16 };
    const tCode = typeMap[type] || 1;
    answerRR[2] = (tCode >> 8); answerRR[3] = tCode & 0xff;
    answerRR[4] = 0; answerRR[5] = 1; // Class IN
    answerRR[6] = (ttl >> 24) & 0xff; answerRR[7] = (ttl >> 16) & 0xff;
    answerRR[8] = (ttl >> 8) & 0xff; answerRR[9] = ttl & 0xff;
    answerRR.set(data, 10);

    const res = new Uint8Array(12 + questionSection.length + answerRR.length);
    res.set(header);
    res.set(questionSection, 12);
    res.set(answerRR, 12 + questionSection.length);
    return res;
  } catch (e) {
    console.error("Critical error in buildResponse:", e);
    const fallback = new Uint8Array(12);
    fallback.set(queryRaw.slice(0, 12));
    fallback[2] |= 0x80; fallback[3] = (fallback[3] & 0xF0) | 0x02; // ServFail
    return fallback;
  }
}
