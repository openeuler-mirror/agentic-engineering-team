/**
 * AET xiaoO Trace Enable Tool
 *
 * 与 opencode trace_enable (aet.js) 对齐：
 * 启用 LLM 请求/响应追踪日志，写入 ~/.aet/config.json
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
    const globalConfigPath = path.join(os.homedir(), '.aet', 'config.json');

    let config = {};
    if (fs.existsSync(globalConfigPath)) {
      config = JSON.parse(fs.readFileSync(globalConfigPath, 'utf8'));
    }
    config.trace = config.trace || {};
    config.trace.enabled = true;
    fs.mkdirSync(path.dirname(globalConfigPath), { recursive: true });
    fs.writeFileSync(globalConfigPath, JSON.stringify(config, null, 2));

    // Invalidate cached global config so next check picks up the change
    const configManager = new ConfigManager();
    configManager.invalidateGlobalConfig();

    outputResult({
      success: true,
      enabled: true,
      traceDir: TRACE_DIR,
      message: 'Trace logging enabled. LLM calls will be recorded to ~/.aet/log/trace/',
    });
  } catch (err) {
    outputError(`Failed to update global config: ${err.message}`);
  }
}

main();
