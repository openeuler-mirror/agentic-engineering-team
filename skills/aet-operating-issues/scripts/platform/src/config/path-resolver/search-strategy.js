/**
 * 搜索策略基类
 * 定义所有搜索策略的通用接口和行为
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * 搜索策略基类
 */
class SearchStrategy {
  /**
   * 创建搜索策略
   * @param {Object} options - 配置选项
   * @param {string} options.name - 策略名称
   * @param {number} options.priority - 优先级（数值越小优先级越高）
   * @param {boolean} options.isIndependent - 是否可并行执行
   */
  constructor(options = {}) {
    this.name = options.name || this.constructor.name;
    this.priority = options.priority || 100;
    this.isIndependent = options.isIndependent !== false;
  }

  /**
   * 搜索配置文件
   * @param {string} configName - 配置文件名
   * @param {string} startDir - 起始目录
   * @returns {Promise<string|null>} 找到的配置文件路径或null
   * @throws {Error} 搜索过程中发生错误
   */
  async search(configName, startDir) {
    throw new Error('search() 方法必须由子类实现');
  }

  /**
   * 检查文件是否存在
   * @param {string} filePath - 文件路径
   * @returns {Promise<boolean>} 文件是否存在
   * @protected
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取策略描述
   * @returns {string} 策略描述
   */
  toString() {
    return `${this.name} (priority: ${this.priority})`;
  }
}

module.exports = SearchStrategy;