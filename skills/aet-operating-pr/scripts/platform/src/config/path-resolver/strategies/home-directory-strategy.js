/**
 * 主目录搜索策略
 * 在用户主目录中查找配置文件
 */

const path = require('path');
const os = require('os');
const SearchStrategy = require('../search-strategy');

/**
 * 主目录搜索策略
 */
class HomeDirectoryStrategy extends SearchStrategy {
  /**
   * 创建主目录搜索策略
   * @param {Object} options - 配置选项
   * @param {string} options.name - 策略名称
   * @param {number} options.priority - 优先级
   * @param {string} options.baseDir - 基础目录（默认为用户主目录）
   * @param {string} options.subPath - 子路径（默认为'.aet'）
   */
  constructor(options = {}) {
    super({
      name: 'HomeDirectoryStrategy',
      priority: 30,
      ...options
    });
    this.baseDir = options.baseDir || os.homedir();
    this.subPath = options.subPath || '.aet';
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
    
    // 构建完整路径：baseDir/subPath/configBaseName
    const configDir = path.join(this.baseDir, this.subPath);
    const configPath = path.join(configDir, configBaseName);

    if (await this.fileExists(configPath)) {
      return configPath;
    }

    return null;
  }

  /**
   * 获取策略描述
   * @returns {string} 策略描述
   */
  toString() {
    return `${super.toString()}, baseDir: ${this.baseDir}, subPath: ${this.subPath}`;
  }
}

module.exports = HomeDirectoryStrategy;