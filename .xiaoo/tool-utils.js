/**
 * AET xiaoO Tool Utils - 公共辅助函数
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const AET_ROOT = path.join(os.homedir(), '.xiaoo', 'aet');

function resolveProjectRoot() {
  // 从 config.toml 的 [[agents.list]] 中读取 workspace（install.sh 设置的项目目录）
  try {
    const configPath = path.join(os.homedir(), '.config', 'xiaoo', 'config.toml');
    const configContent = fs.readFileSync(configPath, 'utf-8');
    const lines = configContent.split('\n');
    let inAgentList = false;
    for (const line of lines) {
      if (/^\[\[agents\.list\]\]/.test(line)) {
        inAgentList = true;
        continue;
      }
      if (/^\[/.test(line)) {
        inAgentList = false;
        continue;
      }
      if (inAgentList && /^workspace\s*=\s*"/.test(line)) {
        const workspace = line.match(/workspace\s*=\s*"([^"]+)"/)?.[1];
        if (workspace && fs.existsSync(path.join(workspace, '.aet'))) {
          return workspace;
        }
      }
    }
  } catch (_) { /* config.toml unavailable */ }

  return null;
}

function readStdinJson() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(new Error(`Failed to parse stdin JSON: ${e.message}`));
      }
    });
    process.stdin.on('error', reject);
  });
}

function outputResult(result) {
  process.stdout.write(JSON.stringify(result) + '\n');
}

function outputError(message) {
  process.stdout.write(JSON.stringify({ success: false, error: message }) + '\n');
}

function asText(val) {
  if (val == null) return '';
  if (typeof val === 'string') return val;
  try { return JSON.stringify(val, null, 2); } catch (_) { return String(val); }
}

/** 与 opencode sendStepPrompt (aet.js L382-396) 格式一致 */
function formatStepPrompt(stepConfig, context) {
  let text = `## Please continue executing this step:\nStep name:\n${stepConfig.name}\nTask:\n${stepConfig.description}`;
  return text;
}

module.exports = {
  AET_ROOT,
  resolveProjectRoot,
  readStdinJson,
  outputResult,
  outputError,
  asText,
  formatStepPrompt,
};
