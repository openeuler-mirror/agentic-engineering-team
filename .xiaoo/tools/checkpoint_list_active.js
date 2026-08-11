/**
 * AET xiaoO Checkpoint List Active Tool - 列出活跃和可恢复的工作流检查点
 *
 * 与 opencode checkpoint_list_active (aet.js) 对齐：
 * - scope 过滤：'scenario' / 'agent' / 'all'（默认）
 * - scenario：仅 workflow_start 起的多阶段场景
 * - agent：仅单 agent 直入任务
 */

'use strict';

const path = require('path');
const { resolveProjectRoot, readStdinJson, outputResult, outputError, AET_ROOT } = require('../tool-utils');

const lib = (name) => require(path.join(AET_ROOT, '.platform/utils', name));

const { CheckpointManager } = lib('checkpoint-manager');
const { ConfigManager } = lib('config-manager');
const { WorkflowEngine } = lib('workflow-engine');

async function main() {
  try {
    const input = await readStdinJson();
    const { scope } = input.args || input;
    const projectRoot = resolveProjectRoot();
    const checkpointManager = new CheckpointManager(projectRoot);

    const index = checkpointManager.loadIndex();

    // scope 过滤（与 opencode aet.js checkpoint_list_active 对齐）
    const filterByScope = (scope && scope !== 'all') ? scope : null;
    if (filterByScope) {
      const configManager = new ConfigManager();
      configManager.reloadConfig(projectRoot);
      const workflowEngine = new WorkflowEngine(configManager, checkpointManager);
      // workflow.name 是 scenario 名 → 场景类；否则（= agentId）→ 单 agent 直入任务
      const isScenario = (name) => !!workflowEngine.getScenarioConfig(name);
      const keep = (e) => filterByScope === 'scenario' ? isScenario(e.workflow) : !isScenario(e.workflow);
      const filtered = {
        ...index,
        active: (index.active || []).filter(keep),
        interrupted: (index.interrupted || []).filter(keep),
        recentCompleted: (index.recentCompleted || []).filter(keep),
      };
      outputResult(filtered);
      return;
    }

    outputResult(index);
  } catch (e) {
    outputError(e.message);
  }
}

main();
