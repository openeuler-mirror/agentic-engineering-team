/**
 * 日志工具
 */

const winston = require('winston');
const path = require('path');

// 创建日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// 创建控制台格式（开发环境）
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta, null, 2)}`;
    }
    return log;
  })
);

// 检查是否应该输出日志
const shouldLogConsole = !(process.env.NODE_ENV === 'production' || process.env.LOG_DISABLE === 'true');

// 创建日志记录器
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'gitcode-api' },
  transports: [
    // 控制台输出（开发环境）
    new winston.transports.Console({
      format: consoleFormat,
      silent: process.env.NODE_ENV === 'test' || !shouldLogConsole
    }),
    // 文件输出（生产环境）
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'gitcode-api-error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'gitcode-api-combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// 添加调试日志辅助函数
logger.debug = function(message, meta) {
  this.log('debug', message, meta);
};

// 添加详细日志辅助函数
logger.verbose = function(message, meta) {
  this.log('verbose', message, meta);
};

/**
 * 设置日志级别（静默版本，不产生日志输出）
 * @param {string} level - 日志级别 (error/warn/info/debug/verbose)
 * @param {boolean} silent - 是否静默设置（不产生日志）
 */
logger.setLogLevel = function(level, silent = false) {
  const validLevels = ['none', 'error', 'warn', 'info', 'debug', 'verbose'];
  if (!validLevels.includes(level)) {
    if (!silent) {
      this.warn(`无效的日志级别: ${level}，使用默认级别: info`);
    }
    level = 'info';
  }

  this.level = level;
  
  if (level === 'none') {
    // 'none' 级别完全禁用日志
    this.transports.forEach(transport => {
      transport.silent = true;
    });
  } else {
    // 其他级别正常设置
    this.transports.forEach(transport => {
      if (transport.level) {
        transport.level = level;
        transport.silent = false;
      }
    });
  }

  if (!silent && level !== 'none') {
    this.info(`日志级别设置为: ${level}`);
  }
};

/**
 * 完全禁用所有日志输出
 * @param {boolean} disable - 是否禁用日志
 */
logger.disableAll = function(disable = true) {
  if (disable) {
    this.transports.forEach(transport => {
      transport.silent = true;
    });
  } else {
    this.transports.forEach(transport => {
      transport.silent = false;
    });
  }
};

/**
 * 检查是否应该输出日志（用于环境变量控制）
 * @returns {boolean}
 */
logger.shouldLog = function() {
  // 环境变量控制：NODE_ENV=production 或 LOG_DISABLE=true 时禁用日志
  if (process.env.NODE_ENV === 'production' || process.env.LOG_DISABLE === 'true') {
    return false;
  }
  return true;
};

module.exports = logger;