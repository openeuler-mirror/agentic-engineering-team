/**
 * 配置路径错误
 * 定义配置路径查找过程中可能出现的错误类型
 */

/**
 * 配置搜索错误基类
 */
class ConfigSearchError extends Error {
  /**
   * 创建配置搜索错误
   * @param {string} message - 错误消息
   * @param {Object} searchContext - 搜索上下文
   */
  constructor(message, searchContext = {}) {
    super(message);
    this.name = 'ConfigSearchError';
    this.searchContext = searchContext;
    this.timestamp = new Date().toISOString();
    
    // 保持正确的堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ConfigSearchError);
    }
  }
}

/**
 * 权限错误
 * 访问配置文件时权限不足
 */
class PermissionError extends ConfigSearchError {
  /**
   * 创建权限错误
   * @param {string} filePath - 文件路径
   * @param {Object} searchContext - 搜索上下文
   */
  constructor(filePath, searchContext = {}) {
    super(`权限不足，无法访问配置文件: ${filePath}`, searchContext);
    this.name = 'PermissionError';
    this.filePath = filePath;
  }
}

/**
 * 配置未找到错误
 * 在所有搜索策略中都未找到配置文件
 */
class ConfigNotFoundError extends ConfigSearchError {
  /**
   * 创建配置未找到错误
   * @param {string} configName - 配置文件名
   * @param {Object} searchContext - 搜索上下文
   */
  constructor(configName, searchContext = {}) {
    super(`配置文件未找到: ${configName}`, searchContext);
    this.name = 'ConfigNotFoundError';
    this.configName = configName;
    this.searchedPaths = searchContext.searchedPaths || [];
  }
}

/**
 * 配置解析错误
 * 找到配置文件但无法解析
 */
class ConfigParseError extends ConfigSearchError {
  /**
   * 创建配置解析错误
   * @param {string} filePath - 文件路径
   * @param {Error} originalError - 原始错误
   * @param {Object} searchContext - 搜索上下文
   */
  constructor(filePath, originalError, searchContext = {}) {
    super(`配置文件解析失败: ${filePath} - ${originalError.message}`, searchContext);
    this.name = 'ConfigParseError';
    this.filePath = filePath;
    this.originalError = originalError;
  }
}

/**
 * 搜索策略错误
 * 搜索策略执行过程中发生错误
 */
class SearchStrategyError extends ConfigSearchError {
  /**
   * 创建搜索策略错误
   * @param {string} strategyName - 策略名称
   * @param {Error} originalError - 原始错误
   * @param {Object} searchContext - 搜索上下文
   */
  constructor(strategyName, originalError, searchContext = {}) {
    super(`搜索策略执行失败: ${strategyName} - ${originalError.message}`, searchContext);
    this.name = 'SearchStrategyError';
    this.strategyName = strategyName;
    this.originalError = originalError;
  }
}

/**
 * 缓存错误
 * 缓存操作过程中发生错误
 */
class CacheError extends ConfigSearchError {
  /**
   * 创建缓存错误
   * @param {string} message - 错误消息
   * @param {Error} originalError - 原始错误
   * @param {Object} searchContext - 搜索上下文
   */
  constructor(message, originalError, searchContext = {}) {
    super(`缓存操作失败: ${message}`, searchContext);
    this.name = 'CacheError';
    this.originalError = originalError;
  }
}

module.exports = {
  ConfigSearchError,
  PermissionError,
  ConfigNotFoundError,
  ConfigParseError,
  SearchStrategyError,
  CacheError
};