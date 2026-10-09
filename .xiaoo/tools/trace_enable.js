/**
 * AET xiaoO Trace Enable Tool
 *
 * 与 opencode trace_enable (aet.js) 对齐：
 * 启用 LLM 请求/响应追踪日志，写入 ~/.aet/config.json
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { resolveProjectRoot, readStdinJson, outputResult, outputError } from '../tool-utils.js';
import { ConfigManager } from '../../.platform/utils/config-manager.js';

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
