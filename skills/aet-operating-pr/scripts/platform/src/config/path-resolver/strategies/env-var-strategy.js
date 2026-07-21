/**
 * 环境变量搜索策略
 * 从环境变量中获取配置文件路径
 */

const path = require('path');
const SearchStrategy = require('../search-strategy');

/**
 * 环境变量搜索策略
 */
class EnvVarStrategy extends SearchStrategy {
  /**
   * 创建环境变量搜索策略
   * @param {Object} options - 配置选项
   * @param {string} options.name - 策略名称
   * @param {number} options.priority - 优先级
   * @param {string} options.envVar - 环境变量名（默认为'AGENTDEV_CONFIG_PATH'）
   * @param {Object} options.env - 环境变量对象（默认为process.env）
   */
  constructor(options = {}) {
    super({
      name: 'EnvVarStrategy',
      priority: 10, // 最高优先级
      ...options
    });
    this.envVar = options.envVar || 'AGENTDEV_CONFIG_PATH';
    this.env = options.env || process.env;
  }

  /**
   * 搜索配置文件
   * @param {string} configName - 配置文件名（未使用）
   * @param {string} startDir - 起始目录（未使用）
   * @returns {Promise<string|null>} 找到的配置文件路径或null
   */
  async search(configName, startDir) {
    const configPath = this.env[this.envVar];
    
    if (!configPath) {
      return null;
    }

    // 解析路径（支持相对路径）
    const resolvedPath = path.isAbsolute(configPath) 
      ? configPath 
      : path.resolve(process.cwd(), configPath);

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
    return `${super.toString()}, envVar: ${this.envVar}`;
  }
}

module.exports = EnvVarStrategy;