/**
 * BloomFilter.ts
 * 
 * 一个简单的布隆过滤器，用于快速检测元素是否可能存在于集合中。
 * 布隆过滤器具有空间效率高和查询速度快的特点，但会有一定的假阳性率。
 * 适用于需要快速判断元素是否存在但不需要存储实际元素的场景。
 */
export class BloomFilter {
  private size: number;
  private hashes: number;
  private bitArray: Uint8Array;
  private static readonly FNV_PRIME = 14717619;
  private static readonly FNV_SEED_0 = 1166146261;
  private static readonly FNV_SEED_1 = 3074159265;

  /**
   * 创建实例
   * @param size 
   * @param hashes 
   * @param bitArray 
   */
  constructor(size: number, hashes: number, bitArray?: Uint8Array) {
    this.size = size;
    this.hashes = hashes;
    this.bitArray = bitArray || new Uint8Array(Math.ceil(size / 8));
  }

  /**
   * 初始化布隆过滤器
   * @param expectedItems 条目数
   * @param errorRate 假阳性率
   * @returns 
   */
  static create(expectedItems: number, errorRate: number = 0.01): BloomFilter {
    const n = Math.max(expectedItems, 100);
    const p = errorRate;
    const m = Math.ceil(-(n * Math.log(p)) / (Math.log(2) ** 2));
    const k = Math.round((m / n) * Math.log(2));
    return new BloomFilter(m, k);
  }

  /**
   * 添加元素
   * @param element 字符串元素
   */
  add(element: string): void {
    const h1 = this.fnv1a(element);
    const h2 = this.fnv1a(element, BloomFilter.FNV_SEED_1); // Salt

    for (let i = 0; i < this.hashes; i++) {
      const pos = (h1 + Math.imul(i, h2)) % this.size;
      const index = (pos + this.size) % this.size;
      const byteIndex = Math.floor(index / 8);
      const bitIndex = index % 8;
      this.bitArray[byteIndex] |= (1 << bitIndex);
    }
  }

  /**
   * 检测元素是否可能存在。布隆过滤器不会有假阴性，但可能有假阳性。
   * @param element 要检测的元素
   * @returns {boolean} 如果返回 false 则元素一定不存在；如果返回 true 则元素有既定假阳性率存在
   * @example
   * const bloom = BloomFilter.create(1000, 0.01);
   * bloom.add("example.com");
   * console.log(bloom.test("example.com")); // true (可能存在)
   * console.log(bloom.test("not-in-filter.com")); // false (一定不存在)
   */
  test(element: string): boolean {
    const h1 = this.fnv1a(element);
    const h2 = this.fnv1a(element, BloomFilter.FNV_SEED_1);

    for (let i = 0; i < this.hashes; i++) {
      const pos = (h1 + Math.imul(i, h2)) % this.size;
      const index = (pos + this.size) % this.size;
      const byteIndex = Math.floor(index / 8);
      const bitIndex = index % 8;
      if ((this.bitArray[byteIndex] & (1 << bitIndex)) === 0) {
        return false;
      }
    }
    return true;
  }

  /**
   * 导出为原始二进制格式 (用于 R2 存储，避开 Base64 开销)
   * 结构: [4字节 size][4字节 hashes][位数组]
   */
  toUint8Array(): Uint8Array {
    const res = new Uint8Array(8 + this.bitArray.length);
    const view = new DataView(res.buffer);
    view.setUint32(0, this.size, true);
    view.setUint32(4, this.hashes, true);
    res.set(this.bitArray, 8);
    return res;
  }

  /**
   * 从原始二进制流恢复
   */
  static fromUint8Array(buffer: Uint8Array): BloomFilter {
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const size = view.getUint32(0, true);
    const hashes = view.getUint32(4, true);
    const bitArray = buffer.slice(8);
    return new BloomFilter(size, hashes, bitArray);
  }

  /**
   * 原有的 JSON 导出 (保持兼容)
   */
  dump(): { size: number; hashes: number; data: string } {
    // ...
    let binary = '';
    const len = this.bitArray.byteLength;
    const chunk = 0x8000; // 32k chunks to avoid stack overflow
    for (let i = 0; i < len; i += chunk) {
      binary += String.fromCharCode.apply(null, this.bitArray.subarray(i, Math.min(i + chunk, len)) as any);
    }
    return { size: this.size, hashes: this.hashes, data: btoa(binary) };
  }

  /**
   * 从导出的数据恢复布隆过滤器实例
   * @param dump 包含位数组大小、哈希函数数量和 Base64 编码的位数组数据
   * @returns 恢复后的 BloomFilter 实例
   * @example
   * // 假设之前通过 bloom.dump() 导出了数据并存储了 dump
   * const loadedBloom = BloomFilter.load(dump);
   * console.log(loadedBloom.test("example.com")); // true (可能存在)
   * console.log(loadedBloom.test("not-in-filter.com")); // false (一定不存在)
   */
  static load(dump: { size: number; hashes: number; data: string }): BloomFilter {
    const binary = atob(dump.data);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new BloomFilter(dump.size, dump.hashes, bytes);
  }

  /**
   * FNV-1a 哈希函数实现，返回 32 位无符号整数 
   * @param str 输入字符串
   * @param seed 可选的种子值，默认为 BloomFilter.FNV_SEED_0
   * @returns 32 位哈希值
   * @example
   * const bloom = new BloomFilter(1024, 3);
   * console.log(bloom.fnv1a("example.com")); // 输出一个 32 位整数
   */
  private fnv1a(str: string, seed: number = BloomFilter.FNV_SEED_0): number {
    let hash = seed;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, BloomFilter.FNV_PRIME);
    }
    return hash >>> 0;
  }
}
