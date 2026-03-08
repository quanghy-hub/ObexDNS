export const cacheUtils = {
  /**
   * 生成规范的缓存 URL
   * 使用一个内部路径前缀，确保不会与正常的页面请求冲突
   */
  generateCacheUrl(key: string): string {
    // 使用 https://obex.local/ 作为内部命名空间
    // 这样即便在 .workers.dev 下也能保持一致性
    return `https://obex.local/cache/${encodeURIComponent(key)}`;
  },

  /**
   * 尝试从 Cache API 获取 JSON 数据
   */
  async get<T>(cache: Cache, key: string): Promise<T | null> {
    const url = this.generateCacheUrl(key);
    const response = await cache.match(url);
    if (!response) return null;
    return response.json();
  },

  /**
   * 将 JSON 数据写入 Cache API
   */
  async set(cache: Cache, key: string, data: any, ttlSeconds: number): Promise<void> {
    const url = this.generateCacheUrl(key);
    const response = new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": `public, max-age=${ttlSeconds}`
      }
    });
    return cache.put(url, response);
  },

  /**
   * 清除指定缓存
   */
  async delete(cache: Cache, key: string): Promise<boolean> {
    const url = this.generateCacheUrl(key);
    return cache.delete(url);
  }
};
