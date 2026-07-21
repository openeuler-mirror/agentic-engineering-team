/**
 * 重试机制工具
 */

const logger = require('./logger');

/**
 * 重试配置
 * @typedef {Object} RetryConfig
 * @property {number} maxRetries - 最大重试次数
 * @property {number} initialDelay - 初始延迟时间(毫秒)
 * @property {number} maxDelay - 最大延迟时间(毫秒)
 * @property {function(number): number} [delayStrategy] - 延迟策略函数
 * @property {function(Error): boolean} [shouldRetry] - 判断是否需要重试的函数
 */

/**
 * 默认重试配置
 */
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  delayStrategy: (retryCount) => Math.min(1000 * Math.pow(2, retryCount), 10000),
  shouldRetry: (error) => {
    // 网络错误、超时、5xx服务器错误应该重试
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return true;
    }

    if (error.response) {
      const status = error.response.status;
      // 5xx服务器错误和429频率限制应该重试
      return status >= 500 || status === 429;
    }

    return false;
  }
};

/**
 * 延迟执行
 * @param {number} ms - 延迟毫秒数
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 带重试的异步操作
 * @template T
 * @param {function(): Promise<T>} operation - 需要重试的异步操作
 * @param {Partial<RetryConfig>} [userConfig] - 用户自定义配置
 * @returns {Promise<T>}
 */
async function withRetry(operation, userConfig = {}) {
  const config = { ...DEFAULT_RETRY_CONFIG, ...userConfig };
  let lastError;

  for (let retryCount = 0; retryCount <= config.maxRetries; retryCount++) {
    try {
      if (retryCount > 0) {
        const delayTime = config.delayStrategy(retryCount);
        logger.debug(`重试第${retryCount}次，等待${delayTime}ms后重试...`);
        await delay(delayTime);
      }

      return await operation();
    } catch (error) {
      lastError = error;

      if (retryCount === config.maxRetries) {
        logger.debug(`已达最大重试次数(${config.maxRetries})，停止重试`);
        break;
      }

      if (config.shouldRetry && !config.shouldRetry(error)) {
        logger.debug(`错误类型不支持重试: ${error.message}`);
        break;
      }

      logger.warn(`操作失败，准备重试 (${retryCount + 1}/${config.maxRetries}): ${error.message}`);
    }
  }

  throw lastError;
}

/**
 * 创建重试包装器
 * @param {Partial<RetryConfig>} config - 重试配置
 * @returns {function(function(): Promise<T>): Promise<T>}
 */
function createRetryWrapper(config = {}) {
  return (operation) => withRetry(operation, config);
}

module.exports = {
  withRetry,
  createRetryWrapper,
  DEFAULT_RETRY_CONFIG
};