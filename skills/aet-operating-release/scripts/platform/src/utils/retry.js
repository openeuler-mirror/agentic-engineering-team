const logger = require('./logger');

const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  delayStrategy: (retryCount) => Math.min(1000 * Math.pow(2, retryCount), 10000),
  shouldRetry: (error) => {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return true;
    }

    if (error.response) {
      const status = error.response.status;
      return status >= 500 || status === 429;
    }

    return false;
  }
};

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

function createRetryWrapper(config = {}) {
  return (operation) => withRetry(operation, config);
}

module.exports = {
  withRetry,
  createRetryWrapper,
  DEFAULT_RETRY_CONFIG
};