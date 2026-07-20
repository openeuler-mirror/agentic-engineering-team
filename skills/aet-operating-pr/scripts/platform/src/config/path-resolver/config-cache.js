/**
 * 配置缓存
 * 缓存配置文件的查找结果以提高性能
 */

/**
 * 配置缓存
 */
class ConfigCache {
  /**
   * 创建配置缓存
   * @param {Object} options - 配置选项
   * @param {number} options.maxSize - 最大缓存条目数
   * @param {number} options.maxAge - 缓存最大年龄（毫秒）
   */
  constructor(options = {}) {
    this.cache = new Map();
    this.maxSize = options.maxSize || 100;
    this.maxAge = options.maxAge || 300000; // 5分钟
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * 获取缓存值
   * @param {string} key - 缓存键
   * @returns {any|null} 缓存值或null
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    // 检查条目是否已过期
    if (Date.now() - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    entry.accessCount++;
    return entry.value;
  }

  /**
   * 设置缓存值
   * @param {string} key - 缓存键
   * @param {any} value - 缓存值
   * @param {Object} metadata - 元数据
   */
  set(key, value, metadata = {}) {
    // 如果缓存已满，使用LRU策略驱逐最旧的条目
    if (this.cache.size >= this.maxSize) {
      this._evictOldest();
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      accessCount: 0,
      metadata: {
        strategy: metadata.strategy || 'unknown',
        ...metadata
      }
    });
  }

  /**
   * 删除缓存条目
   * @param {string} key - 缓存键
   * @returns {boolean} 是否成功删除
   */
  delete(key) {
    return this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * 获取缓存统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? (this.hits / total) : 0,
      size: this.cache.size,
      maxSize: this.maxSize,
      maxAge: this.maxAge
    };
  }

  /**
   * 驱逐最旧的缓存条目（LRU策略）
   * @private
   */
  _evictOldest() {
    if (this.cache.size === 0) {
      return;
    }

    let oldestKey = null;
    let oldestTimestamp = Date.now();
    let lowestAccessCount = Infinity;

    // 找到最旧且访问最少的条目
    for (const [key, entry] of this.cache.entries()) {
      // 优先驱逐过期的条目
      if (Date.now() - entry.timestamp > this.maxAge) {
        this.cache.delete(key);
        return;
      }

      // 否则使用LRU策略：访问次数最少且时间最旧
      if (entry.accessCount < lowestAccessCount || 
          (entry.accessCount === lowestAccessCount && entry.timestamp < oldestTimestamp)) {
        oldestKey = key;
        oldestTimestamp = entry.timestamp;
        lowestAccessCount = entry.accessCount;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * 清理过期的缓存条目
   * @returns {number} 清理的条目数
   */
  cleanup() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.maxAge) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }
}

module.exports = ConfigCache;