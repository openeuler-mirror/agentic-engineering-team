/**
 * AET xiaoO Workflow List Tool - 列出所有可用的工作流场景
 */

'use strict';

const path = require('path');
const { resolveProjectRoot, readStdinJson, outputResult, outputError, AET_ROOT } = require('../tool-utils');

const { ConfigManager } = require(path.join(AET_ROOT, '.platform/utils/config-manager'));

async function main() {
  try {
    await readStdinJson();
    const projectRoot = resolveProjectRoot();
    const configManager = new ConfigManager();
    configManager.reloadConfig(projectRoot);
    const scenarios = configManager.getScenarios();

    if (Object.keys(scenarios).length === 0) {
      outputResult({
        success: true,
        scenarios: [],
        message: '暂无可用工作流。请先运行 /aet-init 初始化项目。',
      });
      return;
    }

    const list = Object.entries(scenarios)
      .filter(([name]) => !name.startsWith('_'))
      .map(([name, scenario]) => ({
        name,
        description: scenario.description || scenario.name || name,
        stages: (scenario.workflow || []).map(s => s.agent_id || s.stage_id),
      }));

    outputResult({
      success: true,
      scenarios: list,
      message: `可用工作流：\n${list.map(s => `- ${s.name}: ${s.description} (${s.stages.join(' → ')})`).join('\n')}`,
    });
  } catch (e) {
    outputError(e.message);
  }
}

main();
