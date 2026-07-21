/**
 * 常量定义
 */

module.exports = {
  // API相关常量
  API: {
    BASE_URL: 'https://api.atomgit.com/api/v5',
    TIMEOUT: 30000, // 30秒
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000, // 1秒
    RETRY_MULTIPLIER: 2,
    RATE_LIMIT_WINDOW: 60 * 1000, // 1分钟
    RATE_LIMIT_MAX_REQUESTS: 60
  },

  // HTTP状态码
  HTTP_STATUS: {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_SERVER_ERROR: 500,
    SERVICE_UNAVAILABLE: 503
  },

  // Issue状态
  ISSUE_STATE: {
    OPEN: 'open',
    CLOSED: 'closed'
  },

  // PR状态
  PR_STATE: {
    OPEN: 'open',
    CLOSED: 'closed',
    MERGED: 'merged'
  },

  // 配置默认值
  CONFIG_DEFAULTS: {
    MODE: 'issue',
    PLATFORM_TYPE: 'gitcode',
    TARGET_BRANCH: 'main'
  },

  // 日志级别
  LOG_LEVELS: {
    ERROR: 'error',
    WARN: 'warn',
    INFO: 'info',
    DEBUG: 'debug',
    VERBOSE: 'verbose'
  },

  // 文件路径
  PATHS: {
    CONFIG_FILE: '.aet/config.json',
    LOG_DIR: 'logs'
  }
};
