/**
 * AET xiaoO Step Handover Tool
 *
 * 与 opencode step_handover (aet.js L1276-1330) 对齐：
 * - context 必传，描述当前步骤的工作成果
 * - step 可选，默认推进到下一步
 * - step 不存在时返回可用列表
 * - checkpoint_id 可选，未传时回退到 current-checkpoint.json
 */

'use strict';

const path = require('path');
const { resolveProjectRoot, readStdinJson, outputResult, outputError, AET_ROOT } = require('../tool-utils');

const lib = (name) => require(path.join(AET_ROOT, '.platform/utils', name));

const { ConfigManager } = lib('config-manager');
const { CheckpointManager } = lib('checkpoint-manager');

async function main() {
  try {
    const input = await readStdinJson();
    const { context, step, checkpoint_id } = input.args || input;
    const projectRoot = resolveProjectRoot();

    // context 必传（与 opencode aet.js L1285 对齐）
    if (!context || (typeof context === 'string' && context.trim().length === 0)) {
      outputError('context 必传，请提供当前步骤的工作成果摘要。');
      return;
    }

    // checkpoint_id 可选，未传时回退到 current-checkpoint.json
    let resolvedCheckpointId = checkpoint_id;
    if (!resolvedCheckpointId) {
      const { StateStore } = require('../state-store');
      const stateStore = new StateStore(projectRoot);
      resolvedCheckpointId = stateStore.getCurrentCheckpointID(projectRoot);
    }

    if (!resolvedCheckpointId) {
      outputError('缺少 checkpoint_id 参数，且无活跃 checkpoint。');
      return;
    }

    const checkpointManager = new CheckpointManager(projectRoot);
    const configManager = new ConfigManager();
    configManager.reloadConfig(projectRoot);

    const checkpoint = checkpointManager.getCheckpoint(resolvedCheckpointId);
    if (!checkpoint) {
      outputError(`Checkpoint "${resolvedCheckpointId}" 不存在`);
      return;
    }

    const currentStage = checkpoint.workflow.currentStage;
    if (!currentStage) {
      outputError('当前无活跃阶段');
      return;
    }

    const execution = checkpointManager.getCurrentExecution(checkpoint, currentStage);
    if (!execution) {
      outputError('当前无活跃执行');
      return;
    }

    const agentConfig = configManager.getAgentConfig(execution.agentId);
    if (!agentConfig?.workflow || agentConfig.workflow.length === 0) {
      outputError('当前 Agent 没有配置工作流步骤，无需调用 step_handover。');
      return;
    }

    const stepConfigs = agentConfig.workflow;

    // after:confirm 检查：当前 step 配置了 after:confirm 且尚未发送确认提示词时，
    // 拒绝调用，让 LLM 等待 idle handler 发送确认 prompt 后再调用 step_handover。
    if (execution.currentStep && execution.steps[execution.currentStep]) {
      const currentStepState = execution.steps[execution.currentStep];
      const currentStepConfig = stepConfigs.find(s => (s.step_id || s.name) === execution.currentStep);
      if (currentStepConfig?.after === 'confirm' && !currentStepState.confirmSent) {
        outputError(
          `当前步骤 "${currentStepConfig.name}" 配置了 after:confirm，需要等待系统发送确认提示词后再调用 step_handover。` +
          `请立即结束当前回复，等待系统确认提示。`
        );
        return;
      }
    }

    // 与 opencode 对齐：result/context 为 { summary } 对象
    const stepResult = typeof context === 'object' ? context : { summary: context };

    // 与 opencode advanceToNextStep (aet.js L290-340) 对齐：
    // 确定目标 step
    let targetStepConfig;
    if (step) {
      // 指定了目标 step → 校验存在性（与 opencode aet.js L1311-1315 对齐）
      targetStepConfig = stepConfigs.find(s => (s.step_id || s.name) === step);
      if (!targetStepConfig) {
        const avail = stepConfigs.map(s => s.step_id || s.name).join(', ');
        outputError(`step "${step}" 不存在。可用步骤: ${avail}`);
        return;
      }

      // 校验顺序：禁止跳步，只能推进到下一步（防止 LLM 跳过中间步骤）
      const currentStepInfo = checkpointManager.getCurrentStep(resolvedCheckpointId, currentStage);
      if (currentStepInfo) {
        const currentIdx = stepConfigs.findIndex(s => (s.step_id || s.name) === currentStepInfo.stepId);
        const targetIdx = stepConfigs.findIndex(s => (s.step_id || s.name) === step);
        if (targetIdx !== currentIdx + 1) {
          const nextStepConfig = stepConfigs[currentIdx + 1];
          const nextStepId = nextStepConfig ? (nextStepConfig.step_id || nextStepConfig.name) : null;
          outputError(`禁止跳步：当前步骤 "${currentStepInfo.stepId}" 的下一步是 "${nextStepId}"，不能直接跳到 "${step}"。请按顺序执行。`);
          return;
        }
      }
    } else {
      // 未指定 step → 自动推进到下一步（与 opencode aet.js L302-303 对齐）
      const currentStepInfo = checkpointManager.getCurrentStep(resolvedCheckpointId, currentStage);
      if (!currentStepInfo) {
        // 没有当前 step → 完成所有 step（与 opencode 分步调用对齐）
        // completeExecution 先于 completeAllSteps 执行，确保 currentStep 未被置空时设置 step.result
        checkpointManager.completeExecution(resolvedCheckpointId, currentStage, stepResult);
        checkpointManager.completeAllSteps(resolvedCheckpointId, currentStage);
        outputResult({
          success: true,
          done: true,
          checkpointID: resolvedCheckpointId,
          stage: currentStage,
          message: '所有步骤已完成。请立即结束当前回复，不要调用 agent_handover 或自行推进到下一阶段，等待系统确认后再进行阶段交接。',
        });
        return;
      }
      const currentIdx = stepConfigs.findIndex(s => (s.step_id || s.name) === currentStepInfo.stepId);
      targetStepConfig = stepConfigs[currentIdx + 1];
      if (!targetStepConfig) {
        // 已是最后一步 → 完成执行（含 step.result）+ 完成所有 step
        // completeExecution 先于 completeAllSteps 执行，确保 currentStep 未被置空时设置 step.result
        checkpointManager.completeExecution(resolvedCheckpointId, currentStage, stepResult);
        checkpointManager.completeAllSteps(resolvedCheckpointId, currentStage);
        outputResult({
          success: true,
          done: true,
          checkpointID: resolvedCheckpointId,
          stage: currentStage,
          message: 'All steps completed',
        });
        return;
      }
    }

    const nextStepId = targetStepConfig.step_id || targetStepConfig.name;

    // 推进到目标 step
    const advanced = checkpointManager.advanceStep(resolvedCheckpointId, currentStage, nextStepId, stepResult, { idleDriven: true });
    if (!advanced) {
      const validSteps = Object.keys(execution.steps);
      outputError(`无法推进到步骤 "${nextStepId}"。可用步骤: ${validSteps.join(', ')}`);
      return;
    }
    

    // idle 驱动模式：推进后下一步为 pending，由 idle handler 在下次 idle 时
    // 注入下一步指令（pending→in_progress + send_prompt）。
    outputResult({
      success: true,
      checkpointID: resolvedCheckpointId,
      stage: currentStage,
      nextStep: nextStepId,
      steps: stepConfigs.map(s => ({ step_id: s.step_id || s.name, name: s.name })),
      message: `步骤已推进到：${nextStepId}。请立即结束当前session到idle状态，系统将idle时会自动注入step prompt。`,
    });
  } catch (e) {
    outputError(e.message);
  }
}

main();
