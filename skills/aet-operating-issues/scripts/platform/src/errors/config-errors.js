/**
 * 配置相关错误
 */

const GitCodeError = require('./gitcode-error');

/**
 * 配置错误
 */
class ConfigError extends GitCodeError {
  constructor(message = '配置错误', metadata = {}) {
    super(message, metadata);
    this.name = 'ConfigError';
  }
}

/**
 * 配置文件未找到错误
 */
class ConfigFileNotFoundError extends ConfigError {
  constructor(configPath, metadata = {}) {
    super(`配置文件未找到: ${configPath}`, { configPath, ...metadata });
    this.name = 'ConfigFileNotFoundError';
  }
}

/**
 * 配置解析错误
 */
class ConfigParseError extends ConfigError {
  constructor(configPath, originalError, metadata = {}) {
    super(`配置文件解析失败: ${configPath}`, {
      configPath,
      originalError: originalError.message,
      ...metadata
    });
    this.name = 'ConfigParseError';
  }
}

/**
 * 配置验证错误
 */
class ConfigValidationError extends ConfigError {
  constructor(errors = [], metadata = {}) {
    const errorMessages = errors.join(', ');
    let message = `配置验证失败: ${errorMessages}`;
    
    // Add guidance for common validation errors
    if (errors.some(error => error.includes('token') || error.includes('必填字段缺失'))) {
      const cwd = process.cwd();
      const isInSkillDir = cwd.includes('/.config/opencode/') || cwd.includes('/.claude/skills/') || cwd.includes('/.agents/skills/');
      
      if (isInSkillDir) {
        message += '\n\n提示: 检测到您在技能安装目录中运行命令。';
        message += '\n请切换到项目根目录（包含 .aet/config.json 的目录）再运行命令。';
        message += '\n或者使用 /aet-init 命令初始化项目配置。';
      } else {
        message += '\n\n提示: 未找到配置文件 .aet/config.json 或配置不完整。';
        message += '\n请确保在当前项目根目录下运行命令，或使用 /aet-init 初始化配置。';
      }
    }
    
    super(message, { errors, ...metadata });
    this.name = 'ConfigValidationError';
  }
}

module.exports = {
  ConfigError,
  ConfigFileNotFoundError,
  ConfigParseError,
  ConfigValidationError
};