/**
 * AET xiaoO Trace Status Tool
 *
 * 与 opencode trace_status (aet.js) 对齐：
 * 查询当前 trace 日志状态
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { resolveProjectRoot, readStdinJson, outputResult, outputError, AET_ROOT } = require('../tool-utils');

const lib = (name) => require(path.join(AET_ROOT, '.platform/utils', name));

const { ConfigManager } = lib('config-manager');

const TRACE_DIR = path.join(os.homedir(), '.aet', 'log', 'trace');

async function main() {
  try {
    await readStdinJson();
    const projectRoot = resolveProjectRoot();
    const configManager = new ConfigManager();
    configManager.reloadConfig(projectRoot);

    const enabled = configManager.isTraceEnabled();
    const globalConfig = configManager.getGlobalConfig();
    const traceDirExists = fs.existsSync(TRACE_DIR);
    let sessionCount = 0;
    if (traceDirExists) {
      try {
        const entries = fs.readdirSync(TRACE_DIR);
        sessionCount = entries.filter(e => e.startsWith('ses_') && fs.statSync(path.join(TRACE_DIR, e)).isDirectory()).length;
      } catch { /* ignore */ }
    }

    outputResult({
      enabled,
      traceDir: TRACE_DIR,
      traceDirExists,
      recordedSessions: sessionCount,
      globalConfigTrace: globalConfig?.trace || null,
    });
  } catch (err) {
    outputError(err.message);
  }
}

main();
