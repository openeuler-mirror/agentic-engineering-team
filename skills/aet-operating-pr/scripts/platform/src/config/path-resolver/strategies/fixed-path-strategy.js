/**
 * 固定路径搜索策略
 * 在预定义的固定路径中查找配置文件
 */

const path = require('path');
const SearchStrategy = require('../search-strategy');

/**
 * 固定路径搜索策略
 */
class FixedPathStrategy extends SearchStrategy {
  /**
   * 创建固定路径搜索策略
   * @param {Object} options - 配置选项
   * @param {string} options.name - 策略名称
   * @param {number} options.priority - 优先级
   * @param {string} options.path - 固定文件路径
   */
  constructor(options = {}) {
    super({
      name: 'FixedPathStrategy',
      priority: 60, // 较低优先级
      ...options
    });
    
    if (!options.path) {
      throw new Error('FixedPathStrategy requires a "path" option');
    }
    
    this.path = options.path;
  }

  /**
   * 搜索配置文件
   * @param {string} configName - 配置文件名（未使用）
   * @param {string} startDir - 起始目录（未使用）
   * @returns {Promise<string|null>} 找到的配置文件路径或null
   */
  async search(configName, startDir) {
    // 解析路径（支持相对路径）
    const resolvedPath = path.isAbsolute(this.path)
      ? this.path
      : path.resolve(process.cwd(), this.path);

    if (await this.fileExists(resolvedPath)) {
      return resolvedPath;
    }

    return null;
  }

  /**
   * 获取策略描述
   * @returns {string} 策略描述
   */
  toString() {
    return `${super.toString()}, path: ${this.path}`;
  }
}

module.exports = FixedPathStrategy;