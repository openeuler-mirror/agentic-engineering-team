/**
 * 配置管理器
 */

const fs = require('fs').promises;
const path = require('path');
const fsExtra = require('fs-extra');
const ConfigValidator = require('./validator');
const { ConfigError, ConfigFileNotFoundError, ConfigParseError } = require('../errors/config-errors');
const constants = require('../constants');
const logger = require('../utils/logger');

// 导入新的配置路径解析器
const { ConfigPathResolver, ConfigNotFoundError } = require('./path-resolver');

/**
 * 配置管理器
 */
class ConfigManager {
  /**
   * 创建配置管理器
   * @param {Object} options - 选项
   */
  constructor(options = {}) {
    // 将配置路径解析为绝对路径
    // 如果路径是相对的，则相对于当前工作目录解析
    const configPath = options.configPath || constants.PATHS.CONFIG_FILE;
    const resolvedConfigPath = path.isAbsolute(configPath)
      ? configPath
      : path.resolve(process.cwd(), configPath);

    this.options = {
      configPath: resolvedConfigPath,
      defaults: options.defaults || constants.CONFIG_DEFAULTS,
      ...options
    };

    // 特性标志：是否启用新的配置路径解析器
    this.useNewPathResolver = options.useNewPathResolver !== false;
    
    // 初始化配置路径解析器（如果启用）
    if (this.useNewPathResolver) {
      this.pathResolver = new ConfigPathResolver({
        logger,
        enableParallelSearch: true,
        cache: {
          maxSize: 50,
          maxAge: 300000 // 5分钟
        }
      });
      logger.debug('启用新的配置路径解析器');
    }

    logger.debug('ConfigManager初始化', {
      inputPath: configPath,
      resolvedPath: this.options.configPath,
      cwd: process.cwd(),
      useNewPathResolver: this.useNewPathResolver
    });

    this.config = null;
    this.loaded = false;
  }

  /**
   * 加载配置
   * @returns {Promise<Object>} 配置对象
   */
  async load() {
    if (this.loaded && this.config) {
      return this.config;
    }

    try {
      // 1. 加载项目配置和全局配置
      const { projectConfig, globalConfig } = await this._loadProjectAndGlobalConfigs();

      // 2. 合并配置：项目配置 + 全局配置（根据platformType选择token）
      const mergedConfig = this._mergeProjectAndGlobalConfigs(projectConfig, globalConfig);

      // 3. 从CLI参数加载（如果有）
      const cliConfig = this._loadFromCliArgs();

      // 4. 合并CLI配置
      const finalConfig = ConfigValidator.mergeAndValidateConfigs(
        this.options.defaults,
        mergedConfig,
        cliConfig
      );

      // 5. 验证必要配置
      if (!ConfigValidator.isConfigComplete(finalConfig)) {
        const missingFields = ConfigValidator.getMissingFields(finalConfig);
        logger.warn(`配置不完整，缺失字段: ${missingFields.join(', ')}`);
      }

      this.config = finalConfig;
      this.loaded = true;

      logger.debug('配置加载完成', { hasToken: !!finalConfig.token });
      return this.config;
    } catch (error) {
      if (error instanceof ConfigError) {
        throw error;
      }
      throw new ConfigError(`配置加载失败: ${error.message}`, { originalError: error.message });
    }
  }

  /**
   * 加载项目配置和全局配置
   * @returns {Promise<Object>} { projectConfig, globalConfig }
   * @private
   */
  async _loadProjectAndGlobalConfigs() {
    const os = require('os');
    let projectConfig = {};
    let globalConfig = {};

    // 1. 尝试加载项目配置（使用旧的向上查找方法，避免被全局配置优先）
    const projectConfigPath = await this._findConfigFileLegacy(process.cwd(), '.aet/config.json');
    if (projectConfigPath) {
      logger.debug(`找到项目配置文件: ${projectConfigPath}`);
      projectConfig = await this._readAndParseConfig(projectConfigPath, 'project');
    }

    // 2. 尝试加载全局配置（用户主目录）
    const globalConfigPath = path.join(os.homedir(), '.aet', 'config.json');
    try {
      await fs.access(globalConfigPath);
      logger.debug(`找到全局配置文件: ${globalConfigPath}`);
      globalConfig = await this._readAndParseConfig(globalConfigPath, 'global');
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.debug('全局配置文件不存在');
      } else {
        throw error;
      }
    }

    return { projectConfig, globalConfig };
  }

  /**
   * 合并项目配置和全局配置
   * @param {Object} projectConfig - 项目配置
   * @param {Object} globalConfig - 全局配置
   * @returns {Object} 合并后的配置
   * @private
   */
  _mergeProjectAndGlobalConfigs(projectConfig, globalConfig) {
    const merged = { ...projectConfig };

    // 根据项目配置中的platformType，从全局配置中获取对应的平台凭证
    const platformType = projectConfig.platformType || 'gitcode';
    
    if (globalConfig.platforms && globalConfig.platforms[platformType]) {
      const platformConfig = globalConfig.platforms[platformType];
      
      // 从全局配置提取token和apiBaseUrl（项目配置中通常不存储这些）
      if (!merged.token && platformConfig.token) {
        merged.token = platformConfig.token;
        logger.debug(`从全局配置获取token (平台: ${platformType})`);
      }
      if (!merged.apiBaseUrl && platformConfig.apiBaseUrl) {
        merged.apiBaseUrl = platformConfig.apiBaseUrl;
        logger.debug(`从全局配置获取apiBaseUrl (平台: ${platformType})`);
      }
    }

    return merged;
  }



  /**
   * 向上查找配置文件
   * @param {string} startDir - 起始目录
   * @param {string} configFile - 配置文件名
   * @returns {Promise<string|null>} 找到的配置文件路径或null
   * @private
   */
  async _findConfigFile(startDir, configFile) {
    // 如果启用了新的路径解析器，使用它
    if (this.useNewPathResolver && this.pathResolver) {
      try {
        const result = await this.pathResolver.resolve(configFile, startDir);
        if (result && result.path) {
          logger.debug(`使用新的路径解析器找到配置文件: ${result.path}`, {
            strategy: result.metadata?.strategy,
            startDir
          });
          return result.path;
        }
        logger.debug(`新的路径解析器未找到配置文件: ${configFile}`, { startDir });
        return null;
      } catch (error) {
        // 如果是配置未找到错误，返回null（保持向后兼容）
        if (error instanceof ConfigNotFoundError) {
          logger.debug(`新的路径解析器未找到配置文件: ${configFile}`, {
            startDir,
            searchedPaths: error.searchedPaths
          });
          return null;
        }
        
        // 其他错误，记录警告并回退到旧方法
        logger.warn(`新的路径解析器执行失败，回退到旧方法: ${error.message}`, {
          startDir,
          configFile
        });
      }
    }

    // 回退到旧的向上查找方法
    logger.debug(`使用旧的向上查找方法: ${configFile}`, { startDir });
    return this._findConfigFileLegacy(startDir, configFile);
  }

  /**
   * 旧的向上查找配置文件方法（保持向后兼容）
   * @param {string} startDir - 起始目录
   * @param {string} configFile - 配置文件名
   * @returns {Promise<string|null>} 找到的配置文件路径或null
   * @private
   */
  async _findConfigFileLegacy(startDir, configFile) {
    let currentDir = path.resolve(startDir);
    const rootDir = path.parse(currentDir).root;

    while (currentDir !== rootDir) {
      const configPath = path.join(currentDir, configFile);
      try {
        await fs.access(configPath);
        logger.debug(`找到配置文件: ${configPath}`, { startDir, currentDir });
        return configPath;
      } catch (error) {
        // 继续向上查找
      }

      // 向上一级目录
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        break; // 到达根目录
      }
      currentDir = parentDir;
    }

    logger.debug(`未找到配置文件: ${configFile}`, { startDir });
    return null;
  }

  /**
   * 从配置文件加载配置
   * @returns {Promise<Object>}
   * @private
   */
  async _loadFromFile() {
    const configPath = this.options.configPath;

    try {
      // 检查文件是否存在
      await fs.access(configPath);
      logger.debug(`使用指定的配置文件: ${configPath}`);
      return this._readAndParseConfig(configPath);
    } catch (error) {
      // 文件不存在，尝试向上查找
      if (error.code === 'ENOENT') {
        logger.debug(`配置文件不存在: ${configPath}，尝试向上查找`);

        // 从当前工作目录向上查找配置文件
        const foundPath = await this._findConfigFile(process.cwd(), '.aet/config.json');
        if (foundPath) {
          logger.debug(`使用找到的配置文件: ${foundPath}`);
          return this._readAndParseConfig(foundPath);
        }

        // 文件不存在，记录详细的错误信息
        logger.warn('配置文件未找到，请检查以下事项:', {
          searchedFrom: process.cwd(),
          configFile: '.aet/config.json',
          suggestion: '请确保在当前项目根目录下运行命令，或使用 /aet-init 初始化配置'
        });
        
        // 返回空对象，让验证器处理缺失字段的错误
        return {};
      }

      throw error;
    }
  }

  /**
   * 读取并解析配置文件
   * @param {string} configPath - 配置文件路径
   * @param {string} configType - 配置类型 ('project' 或 'global')
   * @returns {Promise<Object>} 解析后的配置
   * @private
   */
  async _readAndParseConfig(configPath, configType = 'project') {
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(content);
      logger.debug(`从文件加载配置: ${configPath} (类型: ${configType})`);

      if (configType === 'global') {
        return this._extractGlobalConfig(config);
      }

      return this._extractProjectConfig(config);
    } catch (parseError) {
      throw new ConfigParseError(configPath, parseError);
    }
  }

  /**
   * 从全局配置提取关键信息
   * @param {Object} config - 原始全局配置
   * @returns {Object} 提取的配置
   * @private
   */
  _extractGlobalConfig(config) {
    const extracted = {};

    // 全局配置使用 codePlatform.platforms.{platformType} 结构
    if (config.codePlatform && config.codePlatform.platforms) {
      extracted.platforms = config.codePlatform.platforms;
      logger.debug('从全局配置提取platforms信息', {
        platformTypes: Object.keys(extracted.platforms)
      });
    }

    return extracted;
  }

  /**
   * 从项目配置提取关键信息
   * @param {Object} config - 原始项目配置
   * @returns {Object} 提取的配置
   * @private
   */
  _extractProjectConfig(config) {
    let extracted = {};

    // 项目配置使用 codePlatform 结构
    if (config.codePlatform) {
      logger.debug('检测到项目配置的codePlatform结构');

      // 提取 platform.type 作为 platformType
      if (config.codePlatform.platform && config.codePlatform.platform.type) {
        extracted.platformType = config.codePlatform.platform.type;
      }

      // 提取 upstream (owner/repository)
      if (config.codePlatform.upstream) {
        if (config.codePlatform.upstream.owner) {
          extracted.owner = config.codePlatform.upstream.owner;
        }
        if (config.codePlatform.upstream.repository) {
          extracted.repository = config.codePlatform.upstream.repository;
        }
      }

      // 提取 fork (forkOwner/forkRepo)
      if (config.codePlatform.fork) {
        if (config.codePlatform.fork.owner) {
          extracted.forkOwner = config.codePlatform.fork.owner;
        }
        if (config.codePlatform.fork.repository) {
          extracted.forkRepo = config.codePlatform.fork.repository;
        }
      }

      // 旧版兼容：如果 platform 下有直接的 upstream/fork/token
      if (config.codePlatform.platform) {
        const platform = config.codePlatform.platform;
        if (platform.token) {
          extracted.token = platform.token;
        }
        if (platform.apiBaseUrl) {
          extracted.apiBaseUrl = platform.apiBaseUrl;
        }
        if (platform.upstream && platform.upstream.owner) {
          extracted.owner = platform.upstream.owner;
        }
        if (platform.upstream && platform.upstream.repository) {
          extracted.repository = platform.upstream.repository;
        }
        if (platform.fork && platform.fork.owner) {
          extracted.forkOwner = platform.fork.owner;
        }
        if (platform.fork && platform.fork.repository) {
          extracted.forkRepo = platform.fork.repository;
        }
      }

      if (Object.keys(extracted).length > 0) {
        logger.debug('从项目配置提取字段', { extractedKeys: Object.keys(extracted) });
      }
    }

    // 如果没有提取任何配置，返回原始配置
    if (Object.keys(extracted).length === 0) {
      return config;
    }

    return extracted;
  }

  /**
   * 从CLI参数加载配置（占位符，实际由CLI模块填充）
   * @returns {Object}
   * @private
   */
  _loadFromCliArgs() {
    // CLI参数由commander.js解析后传入
    // 这里返回空对象，实际使用时通过setCliConfig方法设置
    return {};
  }

  /**
   * 设置CLI配置
   * @param {Object} cliConfig - CLI配置
   */
  setCliConfig(cliConfig) {
    if (cliConfig && typeof cliConfig === 'object') {
      this.cliConfig = ConfigValidator.validateCliConfig(cliConfig);

      // 如果已经加载了配置，重新合并
      if (this.loaded && this.config) {
        this.config = ConfigValidator.mergeAndValidateConfigs(
          this.config,
          this.cliConfig
        );
      }
    }
  }

  /**
   * 获取配置值
   * @param {string} key - 配置键名，支持点符号（如 'api.baseUrl'）
   * @param {any} defaultValue - 默认值
   * @returns {any}
   */
  get(key, defaultValue = undefined) {
    if (!this.loaded) {
      throw new ConfigError('配置未加载，请先调用load()方法');
    }

    if (!key) {
      return this.config;
    }

    // 支持点符号访问
    const keys = key.split('.');
    let value = this.config;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return defaultValue;
      }
    }

    return value !== undefined ? value : defaultValue;
  }

  /**
   * 设置配置值
   * @param {string} key - 配置键名
   * @param {any} value - 配置值
   */
  set(key, value) {
    if (!this.loaded) {
      throw new ConfigError('配置未加载，请先调用load()方法');
    }

    // 支持点符号访问
    const keys = key.split('.');
    let target = this.config;

    // 遍历到最后一个键的父对象
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in target) || typeof target[k] !== 'object') {
        target[k] = {};
      }
      target = target[k];
    }

    // 设置值
    target[keys[keys.length - 1]] = value;
  }

  /**
   * 保存配置到文件
   * @param {string} [filePath] - 文件路径，默认为加载时的路径
   * @returns {Promise<void>}
   */
  async save(filePath = this.options.configPath) {
    if (!this.loaded) {
      throw new ConfigError('配置未加载，请先调用load()方法');
    }

    try {
      // 确保目录存在
      const dir = path.dirname(filePath);
      await fsExtra.ensureDir(dir);

      // 只保存必要的配置字段
      const saveConfig = {
        token: this.config.token,
        owner: this.config.owner,
        repo: this.config.repo,
        mode: this.config.mode,
        platformType: this.config.platformType,
        targetBranch: this.config.targetBranch
      };

      // 写入文件
      await fs.writeFile(filePath, JSON.stringify(saveConfig, null, 2), 'utf-8');
      logger.debug(`配置保存到文件: ${filePath}`);
    } catch (error) {
      throw new ConfigError(`配置保存失败: ${error.message}`, { filePath, originalError: error.message });
    }
  }

  /**
   * 重新加载配置
   * @returns {Promise<Object>}
   */
  async reload() {
    this.loaded = false;
    this.config = null;
    return this.load();
  }

  /**
   * 检查配置是否有效
   * @returns {boolean}
   */
  isValid() {
    if (!this.loaded || !this.config) {
      return false;
    }

    return ConfigValidator.isConfigComplete(this.config);
  }

  /**
   * 获取配置缺失字段
   * @returns {string[]}
   */
  getMissingFields() {
    if (!this.loaded || !this.config) {
      return ConfigValidator.getMissingFields({});
    }

    return ConfigValidator.getMissingFields(this.config);
  }

  /**
   * 启用新的配置路径解析器
   * @param {Object} options - 解析器选项
   */
  enableNewPathResolver(options = {}) {
    this.useNewPathResolver = true;
    this.pathResolver = new ConfigPathResolver({
      logger,
      enableParallelSearch: true,
      cache: {
        maxSize: 50,
        maxAge: 300000
      },
      ...options
    });
    logger.debug('启用新的配置路径解析器');
  }

  /**
   * 禁用新的配置路径解析器
   */
  disableNewPathResolver() {
    this.useNewPathResolver = false;
    this.pathResolver = null;
    logger.debug('禁用新的配置路径解析器');
  }

  /**
   * 获取路径解析器统计信息
   * @returns {Object|null} 统计信息或null
   */
  getPathResolverStats() {
    if (!this.useNewPathResolver || !this.pathResolver) {
      return null;
    }
    return this.pathResolver.getCacheStats();
  }

  /**
   * 清空路径解析器缓存
   * @returns {Object|null} 清空前的统计信息或null
   */
  clearPathResolverCache() {
    if (!this.useNewPathResolver || !this.pathResolver) {
      return null;
    }
    return this.pathResolver.clearCache();
  }

  /**
   * 获取搜索策略信息
   * @returns {Array|null} 搜索策略信息或null
   */
  getSearchStrategyInfo() {
    if (!this.useNewPathResolver || !this.pathResolver) {
      return null;
    }
    return this.pathResolver.getStrategyInfo();
  }

  /**
   * 创建默认配置文件
   * @param {string} [filePath] - 文件路径
   * @param {Object} [overrides] - 覆盖的配置
   * @returns {Promise<void>}
   */
  static async createDefaultConfig(filePath = constants.PATHS.CONFIG_FILE, overrides = {}) {
    try {
      const dir = path.dirname(filePath);
      await fsExtra.ensureDir(dir);

      const defaultConfig = {
        ...constants.CONFIG_DEFAULTS,
        ...overrides
      };

      // 移除敏感信息的占位符
      const saveConfig = { ...defaultConfig };
      if (saveConfig.token === 'your-gitcode-token') {
        delete saveConfig.token;
      }
      if (saveConfig.owner === 'your-username') {
        delete saveConfig.owner;
      }
      if (saveConfig.repo === 'your-repository') {
        delete saveConfig.repo;
      }

      await fs.writeFile(filePath, JSON.stringify(saveConfig, null, 2), 'utf-8');
      logger.debug(`默认配置文件已创建: ${filePath}`);
    } catch (error) {
      throw new ConfigError(`创建默认配置文件失败: ${error.message}`, { filePath, originalError: error.message });
    }
  }
}

module.exports = ConfigManager;