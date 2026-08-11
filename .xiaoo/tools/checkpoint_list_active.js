/**
 * AET xiaoO Checkpoint List Active Tool - 列出活跃和可恢复的工作流检查点
 */

'use strict';

const path = require('path');
const { resolveProjectRoot, readStdinJson, outputResult, outputError, AET_ROOT } = require('../tool-utils');

const { CheckpointManager } = require(path.join(AET_ROOT, '.platform/utils/checkpoint-manager'));

async function main() {
  try {
    await readStdinJson();
    const projectRoot = resolveProjectRoot();
    const checkpointManager = new CheckpointManager(projectRoot);

    const active = checkpointManager.getActiveCheckpoints();
    const interrupted = checkpointManager.getInterruptedCheckpoints();
    const resumable = checkpointManager.getResumableCheckpoints();

    if (resumable.length === 0) {
      outputResult({
        success: true,
        active: [],
        interrupted: [],
        message: '暂无活跃的检查点。请使用 /aet-init 或 /aet-auto 启动新工作流。',
      });
      return;
    }

    outputResult({
      success: true,
      active,
      interrupted,
      message: `活跃检查点：\n${active.map(c => `- [活跃] ${c.checkpointID}: ${c.workflow} (${c.stage || '初始'})`).join('\n')}\n${interrupted.map(c => `- [中断] ${c.checkpointID}: ${c.workflow} (${c.stage || '初始'})`).join('\n')}`,
    });
  } catch (e) {
    outputError(e.message);
  }
}

main();
