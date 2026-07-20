const fs = require('fs').promises;
const path = require('path');
const fsExtra = require('fs-extra');
const ConfigValidator = require('./validator');
const { ConfigError, ConfigFileNotFoundError, ConfigParseError } = require('../errors/config-errors');
const constants = require('../constants');
const logger = require('../utils/logger');

class ConfigManager {
  constructor(options = {}) {
    const configPath = options.configPath || constants.PATHS.CONFIG_FILE;
    const resolvedConfigPath = path.isAbsolute(configPath)
      ? configPath
      : path.resolve(process.cwd(), configPath);

    this.options = {
      configPath: resolvedConfigPath,
      defaults: options.defaults || constants.CONFIG_DEFAULTS,
      ...options
    };

    this.cliConfig = null;
    this.config = null;
    this.loaded = false;

    logger.debug('ConfigManager初始化', {
      inputPath: configPath,
      resolvedPath: this.options.configPath,
      cwd: process.cwd()
    });
  }

  async load() {
    if (this.loaded && this.config) {
      return this.config;
    }

    try {
      const { projectConfig, globalConfig } = await this._loadProjectAndGlobalConfigs();
      const mergedConfig = this._mergeProjectAndGlobalConfigs(projectConfig, globalConfig);
      const cliConfig = this.cliConfig || {};
      
      const finalConfig = ConfigValidator.mergeAndValidateConfigs(
        this.options.defaults,
        mergedConfig,
        cliConfig
      );

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

  async _loadProjectAndGlobalConfigs() {
    const os = require('os');
    let projectConfig = {};
    let globalConfig = {};

    const projectConfigPath = await this._findConfigFileLegacy(process.cwd(), '.aet/config.json');
    if (projectConfigPath) {
      logger.debug(`找到项目配置文件: ${projectConfigPath}`);
      projectConfig = await this._readAndParseConfig(projectConfigPath, 'project');
    }

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

  _mergeProjectAndGlobalConfigs(projectConfig, globalConfig) {
    const merged = { ...projectConfig };
    const platformType = projectConfig.platformType || 'gitcode';
    
    if (globalConfig.platforms && globalConfig.platforms[platformType]) {
      const platformConfig = globalConfig.platforms[platformType];
      
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
      }

      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        break;
      }
      currentDir = parentDir;
    }

    logger.debug(`未找到配置文件: ${configFile}`, { startDir });
    return null;
  }

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

  _extractGlobalConfig(config) {
    const extracted = {};

    if (config.codePlatform && config.codePlatform.platforms) {
      extracted.platforms = config.codePlatform.platforms;
      logger.debug('从全局配置提取platforms信息', {
        platformTypes: Object.keys(extracted.platforms)
      });
    }

    return extracted;
  }

  _extractProjectConfig(config) {
    let extracted = {};

    if (config.codePlatform) {
      logger.debug('检测到项目配置的codePlatform结构');

      if (config.codePlatform.platform && config.codePlatform.platform.type) {
        extracted.platformType = config.codePlatform.platform.type;
      }

      if (config.codePlatform.upstream) {
        if (config.codePlatform.upstream.owner) {
          extracted.owner = config.codePlatform.upstream.owner;
        }
        if (config.codePlatform.upstream.repository) {
          extracted.repository = config.codePlatform.upstream.repository;
        }
      }

      if (config.codePlatform.fork) {
        if (config.codePlatform.fork.owner) {
          extracted.forkOwner = config.codePlatform.fork.owner;
        }
        if (config.codePlatform.fork.repository) {
          extracted.forkRepo = config.codePlatform.fork.repository;
        }
      }

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

    if (Object.keys(extracted).length === 0) {
      return config;
    }

    return extracted;
  }

  getCliConfig() {
    return this.cliConfig || {};
  }

  setCliConfig(config) {
    if (config && typeof config === 'object') {
      this.cliConfig = ConfigValidator.validateCliConfig(config);

      if (this.loaded && this.config) {
        this.config = ConfigValidator.mergeAndValidateConfigs(
          this.config,
          this.cliConfig
        );
      }
    }
  }

  get(key, defaultValue = undefined) {
    if (!this.loaded) {
      throw new ConfigError('配置未加载，请先调用load()方法');
    }

    if (!key) {
      return this.config;
    }

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

  set(key, value) {
    if (!this.loaded) {
      throw new ConfigError('配置未加载，请先调用load()方法');
    }

    const keys = key.split('.');
    let target = this.config;

    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in target) || typeof target[k] !== 'object') {
        target[k] = {};
      }
      target = target[k];
    }

    target[keys[keys.length - 1]] = value;
  }

  async save(filePath = this.options.configPath) {
    if (!this.loaded) {
      throw new ConfigError('配置未加载，请先调用load()方法');
    }

    try {
      const dir = path.dirname(filePath);
      await fsExtra.ensureDir(dir);

      const saveConfig = {
        token: this.config.token,
        owner: this.config.owner,
        repo: this.config.repo,
        mode: this.config.mode,
        platformType: this.config.platformType,
        targetBranch: this.config.targetBranch
      };

      await fs.writeFile(filePath, JSON.stringify(saveConfig, null, 2), 'utf-8');
      logger.debug(`配置保存到文件: ${filePath}`);
    } catch (error) {
      throw new ConfigError(`配置保存失败: ${error.message}`, { filePath, originalError: error.message });
    }
  }

  async reload() {
    this.loaded = false;
    this.config = null;
    return this.load();
  }

  isValid() {
    if (!this.loaded || !this.config) {
      return false;
    }

    return ConfigValidator.isConfigComplete(this.config);
  }

  getMissingFields() {
    if (!this.loaded || !this.config) {
      return ConfigValidator.getMissingFields({});
    }

    return ConfigValidator.getMissingFields(this.config);
  }

  static async createDefaultConfig(filePath = constants.PATHS.CONFIG_FILE, overrides = {}) {
    try {
      const dir = path.dirname(filePath);
      await fsExtra.ensureDir(dir);

      const defaultConfig = {
        ...constants.CONFIG_DEFAULTS,
        ...overrides
      };

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