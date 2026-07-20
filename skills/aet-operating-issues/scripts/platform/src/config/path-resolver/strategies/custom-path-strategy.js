/**
 * 自定义路径搜索策略
 * 在预定义的自定义路径中查找配置文件
 */

const path = require('path');
const SearchStrategy = require('../search-strategy');

/**
 * 自定义路径搜索策略
 */
class CustomPathStrategy extends SearchStrategy {
  /**
   * 创建自定义路径搜索策略
   * @param {Object} options - 配置选项
   * @param {string} options.name - 策略名称
   * @param {number} options.priority - 优先级
   * @param {string|string[]} options.paths - 自定义路径或路径数组
   */
  constructor(options = {}) {
    super({
      name: 'CustomPathStrategy',
      priority: 40,
      ...options
    });
    
    // 确保paths是数组
    const paths = options.paths || [];
    this.paths = Array.isArray(paths) ? paths : [paths];
  }

  /**
   * 搜索配置文件
   * @param {string} configName - 配置文件名
   * @param {string} startDir - 起始目录（未使用）
   * @returns {Promise<string|null>} 找到的配置文件路径或null
   */
  async search(configName, startDir) {
    // 从配置文件名中提取基本文件名
    const configBaseName = path.basename(configName);
    
    for (const customPath of this.paths) {
      // 构建完整路径
      const configPath = path.isAbsolute(customPath)
        ? path.join(customPath, configBaseName)
        : path.resolve(process.cwd(), customPath, configBaseName);

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
    const pathCount = this.paths.length;
    const samplePaths = this.paths.slice(0, 3).join(', ');
    const moreText = pathCount > 3 ? `... (+${pathCount - 3} more)` : '';
    return `${super.toString()}, paths: [${samplePaths}${moreText}]`;
  }
}

module.exports = CustomPathStrategy;