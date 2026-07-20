/**
 * Base Command Class - Multi-platform support
 */

const chalk = require('chalk');
const logger = require('../../utils/logger');
const { ConfigManager } = require('../../config');
const { createApiService } = require('../../api');
const { createPlatformClient, validatePlatformConfig } = require('../../api/platform-factory');

/**
 * 命令基类
 */
class BaseCommand {
  /**
   * 创建命令实例
   * @param {Object} options - 命令选项
   */
  constructor(options = {}) {
    this.options = options;
    this.configManager = null;
    this.api = null;
    this.initialized = false;
  }

  /**
   * Initialize command
   * @returns {Promise<void>}
   */
  async init() {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize configuration manager
      this.configManager = new ConfigManager({
        configPath: this.options.config
      });

      // Load configuration
      const config = await this.configManager.load();

      // Override config with CLI options if provided
      const platformConfig = this._mergeConfigWithOptions(config);

      // Set CLI configuration
      this.configManager.setCliConfig({
        verbose: this.options.verbose,
        debug: this.options.debug,
        silent: this.options.silent,
        quiet: this.options.quiet,
        output: this.options.output,
        format: this.options.format
      });

      // 在quiet模式下，设置日志级别为error以上，这样error日志就不会被记录
      if (this.options.quiet) {
        logger.setLogLevel('none', true);
      } else {
        // 非quiet模式下，恢复日志级别
        logger.setLogLevel(this.options.logLevel || 'info', true);
      }

      // Validate platform configuration
      const validation = validatePlatformConfig(platformConfig);
      if (!validation.isValid) {
        // Check if config file was found by checking if config is mostly empty
        const hasConfigFile = Object.keys(config).length > 0;
        let errorMessage = `Platform configuration invalid: ${validation.errors.join(', ')}`;
        
        // Add guidance if config appears to be missing (empty or only has defaults)
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

      // Initialize API service with platform configuration
      this.api = createApiService(platformConfig);

      // Check if configuration is complete
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

  /**
   * Merge configuration with CLI options
   * @param {Object} config - Base configuration from ConfigManager
   * @returns {Object} Merged configuration for platform factory
   * @private
   */
  _mergeConfigWithOptions(config) {
    // ConfigManager已经将配置提取为扁平格式
    // 直接使用这些字段
    const merged = { ...config };
    
    // Override with CLI options
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
    
    // Ensure platform type is set
    if (!merged.platformType) {
      merged.platformType = 'gitcode'; // Default
    }
    
    // 默认使用upstream配置（主仓库）
    // 只有在明确指定fork时才使用fork配置
    const effectiveOwner = merged.owner;
    const effectiveRepo = merged.repository;
    
    // Return the structure expected by platform factory
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

  /**
   * Execute command
   * @param {...any} args - Command arguments
   * @returns {Promise<any>}
   */
  async execute(...args) {
    throw new Error('Subclass must implement execute method');
  }

  /**
   * 格式化输出
   * @param {any} data - 输出数据
   * @param {Object} [options] - 输出选项
   * @returns {string}
   */
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

  /**
   * 格式化为文本
   * @param {any} data - 数据
   * @param {Object} [options] - 选项
   * @returns {string}
   * @private
   */
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
          lines.push(chalk.bold(`${index + 1}. ${item.title || item.name || item.id}`));
          for (const [key, value] of Object.entries(item)) {
            if (key !== 'title' && key !== 'name' && key !== 'id') {
              let displayValue = value;
              if (key === 'labels' && Array.isArray(value)) {
                // 提取标签名称
                displayValue = value.map(label => 
                  typeof label === 'string' ? label : (label.name || label)
                ).join(', ');
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

  /**
   * 格式化为表格
   * @param {any} data - 数据
   * @param {Object} [options] - 选项
   * @returns {string}
   * @private
   */
  _formatAsTable(data, options = {}) {
    // 简化实现，实际可以使用 console.table 或其他库
    return this._formatAsText(data, options);
  }

  /**
   * 格式化为简洁文本（适合模型读取）
   * @param {any} data - 数据
   * @param {Object} [options] - 选项
   * @returns {string}
   * @private
   */
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
          return this._formatIssueConcise(item);
        }
        return `${index + 1}. ${item}`;
      }).join('\n\n');
    }

    if (typeof data === 'object' && data !== null) {
      // 如果是issue对象，使用专门的格式化
      if (data.number !== undefined || data.issue_id !== undefined) {
        return this._formatIssueConcise(data);
      }
      
      // 其他对象，简化输出
      const lines = [];
      for (const [key, value] of Object.entries(data)) {
        if (['number', 'title', 'state', 'created_at', 'updated_at', 'labels', 'html_url'].includes(key)) {
          if (Array.isArray(value)) {
            lines.push(`${key}: ${value.join(', ')}`);
          } else if (typeof value === 'object' && value !== null) {
            // 简化对象输出
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

  /**
   * 格式化issue为简洁文本
   * @param {Object} issue - issue对象
   * @returns {string}
   * @private
   */
  _formatIssueConcise(issue) {
    const lines = [];
    
    // 标题行
    const issueNumber = issue.number || issue.id || issue.issue_id || 'N/A';
    const title = issue.title || issue.name || 'Untitled';
    lines.push(`#${issueNumber}: ${title}`);
    
    // 状态和日期行
    const state = issue.state || issue.issue_state || 'unknown';
    const createdAt = issue.created_at ? new Date(issue.created_at).toISOString().split('T')[0] : 'N/A';
    const updatedAt = issue.updated_at ? new Date(issue.updated_at).toISOString().split('T')[0] : 'N/A';
    lines.push(`状态: ${state} | 创建: ${createdAt} | 更新: ${updatedAt}`);
    
    // 标签行
    const labels = issue.labels || [];
    if (labels.length > 0) {
      // 提取标签名称
      const labelNames = labels.map(label => 
        typeof label === 'string' ? label : (label.name || label)
      );
      const labelText = labelNames.join(', ');
      lines.push(`标签: ${labelText}`);
    }
    
    // URL行（如果有）
    if (issue.html_url) {
      lines.push(`链接: ${issue.html_url}`);
    }
    
    // 简短描述（如果有且不长）
    if (issue.body && issue.body.length < 200) {
      lines.push(`描述: ${issue.body.substring(0, 150)}${issue.body.length > 150 ? '...' : ''}`);
    }
    
    return lines.join('\n');
  }

  /**
   * 打印成功消息
   * @param {string} message - 消息
   * @param {Object} [data] - 附加数据
   */
  success(message, data = null) {
    // 在quiet模式下不输出成功消息，除非有数据需要输出
    if (this.options.quiet && !data) {
      return;
    }
    
    if (!this.options.quiet) {
      console.log(chalk.green('✓'), message);
    }
    
      if (data) {
        // 在quiet模式下，只输出数据，不输出消息前缀
        // 子命令的format选项优先于全局的output选项
        const format = this.options.format || this.options.output || 'text';
        // 调试信息：输出当前format值
        if (this.options.debug) {
          console.error(`DEBUG: format=${format}, this.options.output=${this.options.output}, this.options.format=${this.options.format}`);
        }
        const output = this.formatOutput(data, { format });
        console.log(output);
      }
  }

  /**
   * 打印错误消息
   * @param {string} message - 消息
   * @param {Error} [error] - 错误对象
   */
  error(message, error = null) {
    // 在quiet模式下，简化错误输出
    if (this.options.quiet) {
      if (error && error.message) {
        // 提取简洁的错误信息
        const errorMsg = error.message;
        // 移除冗余前缀
        const cleanError = errorMsg.replace(/^API错误: /, '').replace(/^错误: /, '');
        
        // 根据输出格式决定错误输出格式
        // 子命令的format选项优先于全局的output选项
        const format = this.options.format || this.options.output || 'text';
        // 调试信息
        if (this.options.debug) {
          console.error(`DEBUG error: format=${format}, output=${this.options.output}, this.options.format=${this.options.format}`);
        }
        if (format === 'json') {
          // JSON格式输出错误
          // 尝试从错误消息中提取状态码
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
          // 文本格式输出错误
          console.error(`错误: ${cleanError}`);
        }
      } else {
        // 简化消息
        const cleanMessage = message.replace(/^Failed to /, '').replace(/^✗ /, '');
        
        // 根据输出格式决定错误输出格式
        // 子命令的format选项优先于全局的output选项
        const format = this.options.format || this.options.output || 'text';
        if (format === 'json') {
          // JSON格式输出错误
          const errorObj = {
            error: true,
            message: cleanMessage
          };
          console.error(JSON.stringify(errorObj, null, 2));
        } else {
          // 文本格式输出错误
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

  /**
   * 打印警告消息
   * @param {string} message - 消息
   * @param {Object} [data] - 附加数据
   */
  warn(message, data = null) {
    // 在quiet模式下不输出警告
    if (this.options.quiet) {
      return;
    }
    
    console.warn(chalk.yellow('⚠'), message);
    if (data && this.options.verbose) {
      console.log(this.formatOutput(data));
    }
  }

  /**
   * 打印信息消息
   * @param {string} message - 消息
   * @param {Object} [data] - 附加数据
   */
  info(message, data = null) {
    // 在quiet模式下不输出信息消息
    if (this.options.quiet) {
      return;
    }
    
    console.log(chalk.blue('ℹ'), message);
    if (data && this.options.verbose) {
      console.log(this.formatOutput(data));
    }
  }

  /**
   * 解析逗号分隔的字符串为数组
   * @param {string} str - 逗号分隔的字符串
   * @returns {Array<string>}
   */
  parseCommaSeparated(str) {
    if (!str || typeof str !== 'string') {
      return [];
    }
    return str.split(',').map(s => s.trim()).filter(s => s.length > 0);
  }
}

module.exports = BaseCommand;