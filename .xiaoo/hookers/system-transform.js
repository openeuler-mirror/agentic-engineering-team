/**
 * AET xiaoO *.Chat.system.transform Hook
 *
 * 职责：注入项目分析信息
 *
 *
 * xiaoO 协议：
 * - Input: { stage: "system_transform", session_id, system: [...], model }
 * - Output: { result: "allow" } | { result: "transform", system: [...] }
 */

'use strict';

const path = require('path');
const {
  AET_ROOT,
  resolveProjectRoot,
  readPayload,
  writeResult,
} = require('../hook-utils');

const lib = (name) => require(path.join(AET_ROOT, '.platform/utils', name));

const { ConfigManager } = lib('config-manager');
const { formatProjectAnalysis } = lib('project-analysis');

function main() {
  const payload = readPayload();

  if (!payload || payload.stage !== 'system_transform') {
    writeResult({ result: 'allow' });
    return;
  }

  try {
    const system = payload.system || [];
    const projectRoot = resolveProjectRoot();
    const configManager = new ConfigManager();
    configManager.reloadConfig(projectRoot);

    // 配置检查
    const enabled = configManager.config?.projectAnalysis?.enabled !== false;

    let contextInjection = '';

    // === 注入项目分析信息 ===
    if (enabled) {
      const projectAnalysis = formatProjectAnalysis(projectRoot);
      if (projectAnalysis && projectAnalysis.trim()) {
        contextInjection += '\n\n' + projectAnalysis;
      }
    }

    if (!contextInjection.trim()) {
      writeResult({ result: 'allow' });
      return;
    }

    // Transform system：追加到现有 system 数组
    const newSystem = [...system, contextInjection.trim()];
    writeResult({ result: 'transform', system: newSystem });
  } catch (e) {
    writeResult({ result: 'allow' });
  }
}

main();
