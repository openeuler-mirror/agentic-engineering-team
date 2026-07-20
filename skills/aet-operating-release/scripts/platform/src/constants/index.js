module.exports = {
  API: {
    BASE_URL: 'https://api.atomgit.com/api/v5',
    TIMEOUT: 30000,
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000,
    RETRY_MULTIPLIER: 2,
    RATE_LIMIT_WINDOW: 60 * 1000,
    RATE_LIMIT_MAX_REQUESTS: 60
  },

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

  RELEASE_STATE: {
    OPEN: 'open',
    CLOSED: 'closed'
  },

  CONFIG_DEFAULTS: {
    MODE: 'release',
    PLATFORM_TYPE: 'gitcode',
    TARGET_BRANCH: 'main'
  },

  LOG_LEVELS: {
    ERROR: 'error',
    WARN: 'warn',
    INFO: 'info',
    DEBUG: 'debug',
    VERBOSE: 'verbose'
  },

  PATHS: {
    CONFIG_FILE: '.aet/config.json',
    LOG_DIR: 'logs'
  }
};