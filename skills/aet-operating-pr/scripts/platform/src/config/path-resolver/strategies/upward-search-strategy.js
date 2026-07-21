/**
 * 向上搜索策略
 * 从起始目录向上遍历父目录查找配置文件
 */

const path = require('path');
const SearchStrategy = require('../search-strategy');

/**
 * 向上搜索策略
 */
class UpwardSearchStrategy extends SearchStrategy {
  /**
   * 创建向上搜索策略
   * @param {Object} options - 配置选项
   * @param {string} options.name - 策略名称
   * @param {number} options.priority - 优先级
   * @param {number} options.maxDepth - 最大搜索深度
   * @param {boolean} options.includeStartDir - 是否包含起始目录
   */
  constructor(options = {}) {
    super({
      name: 'UpwardSearchStrategy',
      priority: 50,
      ...options
    });
    this.maxDepth = options.maxDepth || 20;
    this.includeStartDir = options.includeStartDir !== false;
  }

  /**
   * 搜索配置文件
   * @param {string} configName - 配置文件名
   * @param {string} startDir - 起始目录
   * @returns {Promise<string|null>} 找到的配置文件路径或null
   */
  async search(configName, startDir) {
    let currentDir = path.resolve(startDir);
    const rootDir = path.parse(currentDir).root;
    let depth = 0;

    // 可选地检查起始目录
    if (this.includeStartDir) {
      const configPath = path.join(currentDir, configName);
      if (await this.fileExists(configPath)) {
        return configPath;
      }
    }

    // 向上遍历，带深度限制
    while (currentDir !== rootDir && depth < this.maxDepth) {
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        break; // 到达根目录
      }

      currentDir = parentDir;
      depth++;

      const configPath = path.join(currentDir, configName);
      if (await this.fileExists(configPath)) {
        return configPath;
      }
    }

    return null;
  }

  /**
   * 获取策略描述
   * @returns {string} 策略描述
   */
  toString() {
    return `${super.toString()}, maxDepth: ${this.maxDepth}, includeStartDir: ${this.includeStartDir}`;
  }
}

module.exports = UpwardSearchStrategy;