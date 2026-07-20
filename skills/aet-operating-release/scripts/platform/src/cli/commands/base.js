/**
 * Base Command Class - Multi-platform support
 */

const chalk = require('chalk');
const logger = require('../../utils/logger');
const { ConfigManager } = require('../../config');
const { createApiService } = require('../../api');
const { validatePlatformConfig } = require('../../api/platform-factory');

class BaseCommand {
  constructor(options = {}) {
    this.options = options;
    this.configManager = null;
    this.api = null;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) {
      return;
    }

    try {
      this.configManager = new ConfigManager({
        configPath: this.options.config
      });

      const config = await this.configManager.load();

      const platformConfig = this._mergeConfigWithOptions(config);

      this.configManager.setCliConfig({
        verbose: this.options.verbose,
        output: this.options.output,
        format: this.options.format
      });

      if (this.options.quiet) {
        logger.setLogLevel('none', true);
      } else {
        logger.setLogLevel(this.options.logLevel || 'info', true);
      }

      const validation = validatePlatformConfig(platformConfig);
      if (!validation.isValid) {
        const hasConfigFile = Object.keys(config).length > 0;
        let errorMessage = `Platform configuration invalid: ${validation.errors.join(', ')}`;
        
        if (!hasConfigFile || (!platformConfig.token && !platformConfig.owner && !platformConfig.repository)) {
          const cwd = process.cwd();
          const isInSkillDir = cwd.includes('/.config/opencode/skills/') || cwd.includes('/.claude/skills/');
          
          if (isInSkillDir) {
            errorMessage += '\n\n提示: 检测到您在技能安装目录中运行命令。';
            errorMessage += '\n请切换到项目根目录（包含 .aet/config.json 的目录）再运行命令。';
            errorMessage += '\n或者使用 /aet-init 命令初始化项目配置。';
          } else {
            errorMessage += '\n\n提示: 未找到配置文件 .aet/config.json。';
            errorMessage += '\n请确保在当前项目根目录下运行命令，或使用 /aet-init 初始化配置。';
          }
        }
        
        throw new Error(errorMessage);
      }

      this.api = createApiService(platformConfig);

      if (!this.configManager.isValid()) {
        const missingFields = this.configManager.getMissingFields();
        logger.warn(`Configuration incomplete, missing fields: ${missingFields.join(', ')}`);
        logger.warn('Please set missing fields or use --help for configuration instructions');
      }

      this.initialized = true;
      logger.debug('Command initialization complete', {
        platform: platformConfig.platform,
        owner: platformConfig.owner,
        repository: platformConfig.repository,
        clientConfig: JSON.stringify(this.api.client.config)
      });
    } catch (error) {
      logger.error('Command initialization failed:', error);
      throw error;
    }
  }

  _mergeConfigWithOptions(config) {
    const merged = { ...config };
    
    if (this.options.platform) {
      merged.platformType = this.options.platform;
    }
    
    if (this.options.token) {
      merged.token = this.options.token;
    }
    
    if (this.options.owner) {
      merged.owner = this.options.owner;
    }
    
    if (this.options.repo) {
      merged.repository = this.options.repo;
    }
    
    if (!merged.platformType) {
      merged.platformType = 'gitcode';
    }
    
    const effectiveOwner = merged.owner;
    const effectiveRepo = merged.repository;
    
    return {
      platform: merged.platformType,
      token: merged.token,
      owner: effectiveOwner,
      repository: effectiveRepo,
      forkOwner: merged.forkOwner,
      forkRepository: merged.forkRepo,
      apiBaseUrl: merged.apiBaseUrl
    };
  }

  async execute(...args) {
    throw new Error('Subclass must implement execute method');
  }

  formatOutput(data, options = {}) {
    const format = options.format || this.options.format || 'text';

    switch (format) {
      case 'json':
        return JSON.stringify(data, null, 2);
      case 'text':
        return this._formatAsText(data, options);
      case 'table':
        return this._formatAsTable(data, options);
      case 'concise':
      case 'minimal':
        return this._formatAsConcise(data, options);
      default:
        return this._formatAsText(data, options);
    }
  }

  _formatAsText(data, options = {}) {
    if (typeof data === 'string') {
      return data;
    }

    if (Array.isArray(data)) {
      if (data.length === 0) {
        return 'No data';
      }

      return data.map((item, index) => {
        if (typeof item === 'object') {
          const lines = [];
          lines.push(chalk.bold(`${index + 1}. ${item.name || item.tag_name || item.id}`));
          for (const [key, value] of Object.entries(item)) {
            if (key !== 'name' && key !== 'tag_name' && key !== 'id') {
              let displayValue = value;
              if (key === 'body' && value && value.length > 100) {
                displayValue = value.substring(0, 100) + '...';
              }
              lines.push(`  ${key}: ${displayValue}`);
            }
          }
          return lines.join('\n');
        }
        return `${index + 1}. ${item}`;
      }).join('\n\n');
    }

    if (typeof data === 'object' && data !== null) {
      const lines = [];
      for (const [key, value] of Object.entries(data)) {
        if (Array.isArray(value)) {
          lines.push(`${key}: [${value.join(', ')}]`);
        } else if (typeof value === 'object' && value !== null) {
          lines.push(`${key}: ${JSON.stringify(value)}`);
        } else {
          lines.push(`${key}: ${value}`);
        }
      }
      return lines.join('\n');
    }

    return String(data);
  }

  _formatAsTable(data, options = {}) {
    return this._formatAsText(data, options);
  }

  _formatAsConcise(data, options = {}) {
    if (typeof data === 'string') {
      return data;
    }

    if (Array.isArray(data)) {
      if (data.length === 0) {
        return 'No data';
      }

      return data.map((item, index) => {
        if (typeof item === 'object') {
          return this._formatReleaseConcise(item);
        }
        return `${index + 1}. ${item}`;
      }).join('\n\n');
    }

    if (typeof data === 'object' && data !== null) {
      if (data.tag_name !== undefined || data.id !== undefined) {
        return this._formatReleaseConcise(data);
      }
      
      const lines = [];
      for (const [key, value] of Object.entries(data)) {
        if (['id', 'tag_name', 'name', 'draft', 'prerelease', 'created_at', 'published_at', 'html_url'].includes(key)) {
          if (Array.isArray(value)) {
            lines.push(`${key}: ${value.join(', ')}`);
          } else if (typeof value === 'object' && value !== null) {
            lines.push(`${key}: ${JSON.stringify(value).substring(0, 50)}...`);
          } else {
            lines.push(`${key}: ${value}`);
          }
        }
      }
      return lines.join('\n');
    }

    return String(data);
  }

  _formatReleaseConcise(release) {
    const lines = [];
    
    const tagName = release.tag_name || 'N/A';
    const name = release.name || 'Untitled';
    lines.push(`${tagName}: ${name}`);
    
    const id = release.id || 'N/A';
    const draft = release.draft ? 'draft' : '';
    const prerelease = release.prerelease ? 'prerelease' : '';
    const status = [draft, prerelease].filter(s => s).join(', ') || 'published';
    const createdAt = release.created_at ? new Date(release.created_at).toISOString().split('T')[0] : 'N/A';
    const publishedAt = release.published_at ? new Date(release.published_at).toISOString().split('T')[0] : 'N/A';
    lines.push(`ID: ${id} | 状态: ${status} | 创建: ${createdAt} | 发布: ${publishedAt}`);
    
    if (release.html_url) {
      lines.push(`链接: ${release.html_url}`);
    }
    
    if (release.body && release.body.length < 200) {
      lines.push(`描述: ${release.body.substring(0, 150)}${release.body.length > 150 ? '...' : ''}`);
    }
    
    return lines.join('\n');
  }

  success(message, data = null) {
    if (this.options.quiet && !data) {
      return;
    }
    
    if (!this.options.quiet) {
      console.log(chalk.green('✓'), message);
    }
    
    if (data) {
      const format = this.options.format || this.options.output || 'text';
      const output = this.formatOutput(data, { format });
      console.log(output);
    }
  }

  error(message, error = null) {
    if (this.options.quiet) {
      if (error && error.message) {
        const errorMsg = error.message;
        const cleanError = errorMsg.replace(/^API错误: /, '').replace(/^错误: /, '');
        
        const format = this.options.format || this.options.output || 'text';
        if (format === 'json') {
          let code = 500;
          const codeMatch = cleanError.match(/\(code: (\d+)\)/);
          if (codeMatch) {
            code = parseInt(codeMatch[1], 10);
          } else if (error.code) {
            code = error.code;
          } else if (error.status) {
            code = error.status;
          }
          
          const errorObj = {
            error: true,
            message: cleanError,
            code: code
          };
          console.error(JSON.stringify(errorObj, null, 2));
        } else {
          console.error(`错误: ${cleanError}`);
        }
      } else {
        const cleanMessage = message.replace(/^Failed to /, '').replace(/^✗ /, '');
        
        const format = this.options.format || this.options.output || 'text';
        if (format === 'json') {
          const errorObj = {
            error: true,
            message: cleanMessage
          };
          console.error(JSON.stringify(errorObj, null, 2));
        } else {
          console.error(`错误: ${cleanMessage}`);
        }
      }
      return;
    }
    
    console.error(chalk.red('✗'), message);
    if (error && this.options.verbose) {
      console.error(chalk.gray(error.stack || error.message));
    }
  }

  warn(message, data = null) {
    if (this.options.quiet) {
      return;
    }
    
    console.warn(chalk.yellow('⚠'), message);
    if (data && this.options.verbose) {
      console.log(this.formatOutput(data));
    }
  }

  info(message, data = null) {
    if (this.options.quiet) {
      return;
    }
    
    console.log(chalk.blue('ℹ'), message);
    if (data && this.options.verbose) {
      console.log(this.formatOutput(data));
    }
  }

  parseCommaSeparated(str) {
    if (!str || typeof str !== 'string') {
      return [];
    }
    return str.split(',').map(s => s.trim()).filter(s => s.length > 0);
  }
}

module.exports = BaseCommand;