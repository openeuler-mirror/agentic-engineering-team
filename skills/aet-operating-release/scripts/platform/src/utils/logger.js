const winston = require('winston');
const path = require('path');

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

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

const shouldLogConsole = !(process.env.NODE_ENV === 'production' || process.env.LOG_DISABLE === 'true');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'gitcode-api' },
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
      silent: process.env.NODE_ENV === 'test' || !shouldLogConsole
    }),
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'gitcode-api-error.log'),
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'gitcode-api-combined.log'),
      maxsize: 5242880,
      maxFiles: 5
    })
  ]
});

logger.debug = function(message, meta) {
  this.log('debug', message, meta);
};

logger.verbose = function(message, meta) {
  this.log('verbose', message, meta);
};

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
    this.transports.forEach(transport => {
      transport.silent = true;
    });
  } else {
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

logger.shouldLog = function() {
  if (process.env.NODE_ENV === 'production' || process.env.LOG_DISABLE === 'true') {
    return false;
  }
  return true;
};

module.exports = logger;