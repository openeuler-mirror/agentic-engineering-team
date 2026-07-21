/**
 * 配置路径解析器
 * 主解析器类，协调搜索策略并管理缓存
 */

const os = require('os');
const logger = require('../../utils/logger');
const ConfigCache = require('./config-cache');
const {
  ConfigSearchError,
  ConfigNotFoundError,
  SearchStrategyError
} = require('./config-path-error');

// 导入搜索策略
const UpwardSearchStrategy = require('./strategies/upward-search-strategy');
const HomeDirectoryStrategy = require('./strategies/home-directory-strategy');
const EnvVarStrategy = require('./strategies/env-var-strategy');
const CustomPathStrategy = require('./strategies/custom-path-strategy');
const FixedPathStrategy = require('./strategies/fixed-path-strategy');

/**
 * 配置路径解析器
 */
class ConfigPathResolver {
  /**
   * 创建配置路径解析器
   * @param {Object} options - 配置选项
   * @param {Array} options.strategies - 搜索策略数组
   * @param {Object} options.cache - 缓存配置
   * @param {number} options.cache.maxSize - 最大缓存条目数
   * @param {number} options.cache.maxAge - 缓存最大年龄（毫秒）
   * @param {Object} options.logger - 日志记录器
   * @param {boolean} options.enableParallelSearch - 是否启用并行搜索
   * @param {Object} options.env - 环境变量对象
   * @param {string} options.platform - 平台类型
   */
  constructor(options = {}) {
    this.strategies = options.strategies || this.getDefaultStrategies(options);
    this.cache = new ConfigCache(options.cache || {});
    this.logger = options.logger || logger;
    this.enableParallelSearch = options.enableParallelSearch !== false;
    this.env = options.env || process.env;
    this.platform = options.platform || process.platform;
    
    // 按优先级排序策略
    this.strategies.sort((a, b) => a.priority - b.priority);
    
    this.logger.debug('ConfigPathResolver初始化', {
      strategyCount: this.strategies.length,
      strategies: this.strategies.map(s => s.toString()),
      enableParallelSearch: this.enableParallelSearch,
      platform: this.platform
    });
  }

  /**
   * 获取默认搜索策略
   * @param {Object} options - 配置选项
   * @returns {Array} 默认搜索策略数组
   */
  getDefaultStrategies(options = {}) {
    const strategies = [];
    const env = options.env || process.env;
    const platform = options.platform || process.platform;

    // 1. 环境变量策略（最高优先级）
    strategies.push(new EnvVarStrategy({
      envVar: 'AGENTDEV_CONFIG_PATH',
      env,
      priority: 10
    }));

    // 2. 当前目录向上搜索策略
    strategies.push(new UpwardSearchStrategy({
      includeStartDir: true,
      priority: 20
    }));

    // 3. 主目录策略（全局配置优先）
    // 统一使用 os.homedir() 获取主目录，跨平台支持
    // priority 提高为 15，仅次于环境变量策略
    strategies.push(new HomeDirectoryStrategy({
      baseDir: os.homedir(),
      subPath: '.aet',
      priority: 15
    }));

    // 4. 系统级配置（Unix-like系统）
    if (platform !== 'win32') {
      strategies.push(new FixedPathStrategy({
        path: '/etc/aet/config.json',
        priority: 40
      }));
    }

    // 5. 额外的向上搜索策略（不包含起始目录）
    strategies.push(new UpwardSearchStrategy({
      includeStartDir: false,
      priority: 50
    }));

    return strategies;
  }

  /**
   * 解析配置文件路径
   * @param {string} configName - 配置文件名（默认为'.aet/config.json'）
   * @param {string} startDir - 起始目录（默认为当前工作目录）
   * @returns {Promise<string|null>} 找到的配置文件路径或null
   */
  async resolve(configName = '.aet/config.json', startDir = process.cwd()) {
    const cacheKey = `${configName}:${startDir}`;
    
    // 检查缓存
    const cachedResult = this.cache.get(cacheKey);
    if (cachedResult) {
      this.logger.debug(`缓存命中: ${cacheKey}`, {
        strategy: cachedResult.metadata.strategy,
        age: Date.now() - cachedResult.metadata.timestamp
      });
      return cachedResult;
    }

    this.logger.debug(`开始搜索配置文件: ${configName}`, { startDir });

    // 根据配置选择搜索模式
    let result;
    if (this.enableParallelSearch) {
      result = await this._resolveParallel(configName, startDir);
    } else {
      result = await this._resolveSequential(configName, startDir);
    }

    // 缓存结果
    if (result) {
      this.cache.set(cacheKey, result, {
        strategy: result.metadata?.strategy || 'unknown',
        timestamp: Date.now()
      });
      this.logger.debug(`找到配置文件: ${result}`, {
        strategy: result.metadata?.strategy || 'unknown'
      });
    } else {
      this.logger.debug(`未找到配置文件: ${configName}`);
    }

    return result;
  }

  /**
   * 顺序解析配置文件路径
   * @param {string} configName - 配置文件名
   * @param {string} startDir - 起始目录
   * @returns {Promise<string|null>} 找到的配置文件路径或null
   * @private
   */
  async _resolveSequential(configName, startDir) {
    const searchContext = {
      configName,
      startDir,
      strategiesAttempted: [],
      pathsChecked: []
    };

    for (const strategy of this.strategies) {
      try {
        this.logger.debug(`尝试策略: ${strategy.name}`, { priority: strategy.priority });
        
        const result = await strategy.search(configName, startDir);
        searchContext.strategiesAttempted.push({
          name: strategy.name,
          priority: strategy.priority,
          success: !!result
        });

        if (result) {
          return {
            path: result,
            metadata: {
              strategy: strategy.name,
              priority: strategy.priority,
              searchContext
            }
          };
        }
      } catch (error) {
        this.logger.warn(`策略执行失败: ${strategy.name}`, { error: error.message });
        searchContext.strategiesAttempted.push({
          name: strategy.name,
          priority: strategy.priority,
          success: false,
          error: error.message
        });

        // 如果是权限错误，继续尝试其他策略
        if (error.code === 'EACCES' || error.code === 'EPERM') {
          continue;
        }

        // 其他错误可以抛出
        throw new SearchStrategyError(strategy.name, error, searchContext);
      }
    }

    // 所有策略都未找到配置文件
    throw new ConfigNotFoundError(configName, searchContext);
  }

  /**
   * 并行解析配置文件路径
   * @param {string} configName - 配置文件名
   * @param {string} startDir - 起始目录
   * @returns {Promise<string|null>} 找到的配置文件路径或null
   * @private
   */
  async _resolveParallel(configName, startDir) {
    const searchContext = {
      configName,
      startDir,
      strategiesAttempted: [],
      pathsChecked: []
    };

    // 分组策略：独立策略可并行执行，依赖策略需顺序执行
    const independentStrategies = this.strategies.filter(s => s.isIndependent);
    const dependentStrategies = this.strategies.filter(s => !s.isIndependent);

    // 并行执行独立策略
    const independentPromises = independentStrategies.map(async (strategy) => {
      try {
        this.logger.debug(`并行执行策略: ${strategy.name}`);
        
        const result = await strategy.search(configName, startDir);
        searchContext.strategiesAttempted.push({
          name: strategy.name,
          priority: strategy.priority,
          success: !!result,
          parallel: true
        });

        return result ? { result, strategy } : null;
      } catch (error) {
        this.logger.warn(`并行策略执行失败: ${strategy.name}`, { error: error.message });
        searchContext.strategiesAttempted.push({
          name: strategy.name,
          priority: strategy.priority,
          success: false,
          error: error.message,
          parallel: true
        });
        return null;
      }
    });

    // 等待所有独立策略完成
    const independentResults = await Promise.all(independentPromises);
    
    // 检查是否有策略找到了配置文件
    const successfulResult = independentResults.find(r => r !== null);
    if (successfulResult) {
      return {
        path: successfulResult.result,
        metadata: {
          strategy: successfulResult.strategy.name,
          priority: successfulResult.strategy.priority,
          parallel: true,
          searchContext
        }
      };
    }

    // 顺序执行依赖策略
    for (const strategy of dependentStrategies) {
      try {
        this.logger.debug(`顺序执行依赖策略: ${strategy.name}`);
        
        const result = await strategy.search(configName, startDir);
        searchContext.strategiesAttempted.push({
          name: strategy.name,
          priority: strategy.priority,
          success: !!result,
          parallel: false
        });

        if (result) {
          return {
            path: result,
            metadata: {
              strategy: strategy.name,
              priority: strategy.priority,
              parallel: false,
              searchContext
            }
          };
        }
      } catch (error) {
        this.logger.warn(`依赖策略执行失败: ${strategy.name}`, { error: error.message });
        searchContext.strategiesAttempted.push({
          name: strategy.name,
          priority: strategy.priority,
          success: false,
          error: error.message,
          parallel: false
        });

        // 如果是权限错误，继续尝试其他策略
        if (error.code === 'EACCES' || error.code === 'EPERM') {
          continue;
        }

        // 其他错误可以抛出
        throw new SearchStrategyError(strategy.name, error, searchContext);
      }
    }

    // 所有策略都未找到配置文件
    throw new ConfigNotFoundError(configName, searchContext);
  }

  /**
   * 清空缓存
   */
  clearCache() {
    const stats = this.cache.getStats();
    this.cache.clear();
    this.logger.debug('缓存已清空', { previousStats: stats });
    return stats;
  }

  /**
   * 获取缓存统计信息
   * @returns {Object} 缓存统计信息
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * 获取搜索策略信息
   * @returns {Array} 搜索策略信息数组
   */
  getStrategyInfo() {
    return this.strategies.map(strategy => ({
      name: strategy.name,
      priority: strategy.priority,
      isIndependent: strategy.isIndependent,
      description: strategy.toString()
    }));
  }

  /**
   * 添加搜索策略
   * @param {SearchStrategy} strategy - 搜索策略实例
   */
  addStrategy(strategy) {
    this.strategies.push(strategy);
    this.strategies.sort((a, b) => a.priority - b.priority);
    this.logger.debug('添加搜索策略', { strategy: strategy.toString() });
  }

  /**
   * 移除搜索策略
   * @param {string} strategyName - 策略名称
   * @returns {boolean} 是否成功移除
   */
  removeStrategy(strategyName) {
    const initialLength = this.strategies.length;
    this.strategies = this.strategies.filter(s => s.name !== strategyName);
    const removed = initialLength !== this.strategies.length;
    
    if (removed) {
      this.logger.debug('移除搜索策略', { strategyName });
    }
    
    return removed;
  }

  /**
   * 设置是否启用并行搜索
   * @param {boolean} enable - 是否启用并行搜索
   */
  setParallelSearch(enable) {
    this.enableParallelSearch = enable;
    this.logger.debug('设置并行搜索', { enable });
  }
}

module.exports = ConfigPathResolver;