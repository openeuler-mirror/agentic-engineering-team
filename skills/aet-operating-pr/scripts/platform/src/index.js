/**
 * Platform API Script Main Entry - Supports GitHub, GitCode, GitLab, etc.
 */

const fs = require('fs');
const path = require('path');

function findConfigFileSync(startDir, relativePath) {
  let currentDir = path.resolve(startDir);
  const rootDir = path.parse(currentDir).root;
  while (true) {
    const candidate = path.join(currentDir, relativePath);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    if (currentDir === rootDir) return null;
    const parent = path.dirname(currentDir);
    if (parent === currentDir) return null;
    currentDir = parent;
  }
}

/**
 * Mirror of bin/pr-api.js#configureForGitLab so library callers see the same
 * SSL behavior as CLI callers.
 */
function detectGitLabPlatform() {
  try {
    const projectConfigPath = findConfigFileSync(process.cwd(), '.aet/config.json');
    if (projectConfigPath) {
      const cfg = JSON.parse(fs.readFileSync(projectConfigPath, 'utf-8'));
      if (cfg.codePlatform && cfg.codePlatform.platform &&
          cfg.codePlatform.platform.type === 'gitlab') {
        return true;
      }
      return false;
    }
    const os = require('os');
    const globalConfigPath = path.join(os.homedir(), '.aet', 'config.json');
    if (fs.existsSync(globalConfigPath)) {
      const cfg = JSON.parse(fs.readFileSync(globalConfigPath, 'utf-8'));
      if (cfg.codePlatform && cfg.codePlatform.platforms &&
          cfg.codePlatform.platforms.gitlab) {
        return true;
      }
    }
  } catch (_error) {
    // Best-effort detection.
  }
  return false;
}

if (detectGitLabPlatform()) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const { program } = require('./cli/commander');
const logger = require('./utils/logger');
const configManager = require('./config/manager');

/**
 * 主函数
 */
async function main() {
  try {
    // 配置全局异常处理
    setupErrorHandling();

    // 解析命令行参数获取选项
    program.parseOptions(process.argv.slice(2));
    const opts = program.opts();

    // 设置日志级别（静默模式，不产生日志）
    // 只有在verbose或debug模式下才记录命令行选项
    if (opts.verbose || opts.debug) {
      logger.info('命令行选项', { opts, argv: process.argv.slice(2) });
    }
    
    if (opts.logLevel) {
      logger.setLogLevel(opts.logLevel, true); // 静默设置
    } else if (opts.debug) {
      logger.setLogLevel('debug', true);
    } else if (opts.verbose) {
      logger.setLogLevel('verbose', true);
    } else if (opts.silent) {
      logger.setLogLevel('error', true);
    } else {
      // 默认info级别，静默设置
      logger.setLogLevel('info', true);
    }

    // 解析命令
    program.parse(process.argv);

    // 如果没有提供命令，显示帮助
    if (process.argv.length <= 2) {
      program.help();
    }
  } catch (error) {
    logger.error('程序执行失败', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

/**
 * 设置错误处理
 */
function setupErrorHandling() {
  process.on('uncaughtException', (error) => {
    logger.error('未捕获的异常', { error: error.message, stack: error.stack });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('未处理的Promise拒绝', { reason: reason?.message || reason });
  });
}

// 导出主函数供测试使用
module.exports = { main };

// 如果是直接执行，运行主函数
if (require.main === module) {
  main().catch((error) => {
    console.error('致命错误:', error.message);
    if (process.env.NODE_ENV === 'development') {
      console.error(error.stack);
    }
    process.exit(1);
  });
}