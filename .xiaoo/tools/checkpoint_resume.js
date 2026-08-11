/**
 * AET xiaoO Checkpoint Resume Tool - 恢复中断的工作流检查点
 *
 * 与 opencode resumeAgentCheckpointInPlace 对齐：
 * 1. ensureCheckpointRunning — 重置 workflow/execution/step 的 interrupted 状态
 * 2. 创建新 execution 绑定当前 sessionID
 * 3. 合并旧 steps 状态到新 execution，currentStep 回退为 pending
 * 4. 更新 current-checkpoint.json
 */

'use strict';

const path = require('path');
const { resolveProjectRoot, readStdinJson, outputResult, outputError, formatStepPrompt, AET_ROOT } = require('../tool-utils');

const lib = (name) => require(path.join(AET_ROOT, '.platform/utils', name));

const { CheckpointManager } = lib('checkpoint-manager');
const { ConfigManager } = lib('config-manager');
const { StateStore } = require('../state-store');

async function main() {
  try {
    const input = await readStdinJson();
    const { checkpoint_id } = input.args || input;
    const projectRoot = resolveProjectRoot();

    const checkpointManager = new CheckpointManager(projectRoot);
    const configManager = new ConfigManager();
    configManager.reloadConfig(projectRoot);
    const stateStore = new StateStore(projectRoot);

    const checkpoint = checkpointManager.getCheckpoint(checkpoint_id);
    if (!checkpoint) {
      outputError(`Checkpoint "${checkpoint_id}" 不存在`);
      return;
    }

    // === 1. ensureCheckpointRunning（与 opencode 对齐） ===
    // 重置 workflow/execution/step 的 interrupted 状态
    if (checkpoint.workflow.status === 'interrupted') {
      checkpoint.workflow.status = 'in_progress';
      checkpoint.interruptedAt = null;

      const currentStage = checkpoint.workflow.currentStage;
      if (currentStage && checkpoint.executions[currentStage]) {
        const execution = checkpointManager.getCurrentExecution(checkpoint, currentStage);
        if (execution && execution.status === 'interrupted') {
          execution.status = 'in_progress';
          execution.completedAt = null;
          execution.result = null;
          if (execution.currentStep && execution.steps[execution.currentStep]) {
            const stepState = execution.steps[execution.currentStep];
            if (stepState.status === 'interrupted') {
              execution.steps[execution.currentStep] = {
                ...stepState,
                status: 'pending',
                completedAt: null,
              };
            }
          }
        }
      }
      checkpoint.history.push({
        ts: new Date().toISOString(),
        event: 'workflow_resumed',
      });
    }

    // === 2. resumeAgentCheckpointInPlace（与 opencode 对齐） ===
    // 在同一 checkpoint 上创建新 execution，绑定新 sessionID
    const stage = checkpoint.workflow.currentStage;
    const prev = checkpointManager.getCurrentExecution(checkpoint, stage);
    const prevSteps = prev?.steps || null;
    const prevStep = prev?.currentStep || null;
    const agentId = prev?.agentId || stage;
    const ctx = prev?.context || checkpoint.workflow.description || null;

    // 获取真实 sessionID（优先从 StateStore，否则生成描述性 ID）
    const realSessionID = stateStore.getCurrentSessionID(projectRoot);
    const sessionID = realSessionID || `aet-${agentId}-${Date.now()}`;

    const exec = checkpointManager.startExecutionOn(checkpoint, stage, sessionID, agentId, ctx);

    // 初始化新 execution 的 steps
    const agentCfg = configManager.getAgentConfig(agentId);
    if (agentCfg?.workflow && agentCfg.workflow.length > 0) {
      checkpointManager.initStepsOn(checkpoint, stage, agentCfg.workflow, null);

      // 合并旧 steps 状态到新 execution（与 opencode resumeAgentCheckpointInPlace 对齐）
      // 先用 ...st 完全覆盖（保留 completed 状态和 timestamps），再仅重置断点步骤为 pending
      if (exec && prevSteps && Object.keys(prevSteps).length > 0) {
        for (const [id, st] of Object.entries(prevSteps)) {
          if (exec.steps[id]) {
            exec.steps[id] = { ...exec.steps[id], ...st };
          }
        }
        exec.currentStep = prevStep;
        // 仅重置断点步骤为 pending（与 opencode 对齐：completed 步骤保持 completed）
        if (prevStep && exec.steps[prevStep]) {
          exec.steps[prevStep] = {
            ...exec.steps[prevStep],
            status: 'pending',
            startedAt: null,
          };
        }
      }

      // 恢复目标 step: 直接设为 in_progress + 写入 step_started 事件
      // 与 workflow_start.js 首步启动逻辑对齐，也与 opencode resume 后 takeCurrentStepText 对齐
      // 因为 checkpoint_resume 已返回 stepInstruction，LLM 会立即执行
      if (prevStep && exec.steps[prevStep]) {
        const now = new Date().toISOString();
        const stepCtx = exec.steps[prevStep].context || exec.context || null;
        exec.steps[prevStep] = {
          ...exec.steps[prevStep],
          status: 'in_progress',
          startedAt: now,
          completedAt: null,
          context: stepCtx,
        };
        checkpoint.history.push({
          ts: now,
          event: 'step_started',
          stage: stage,
          executionId: exec.executionId,
          step: prevStep,
        });
      }
    }

    // 一次性落盘
    checkpointManager.saveCheckpoint(checkpoint);
    checkpointManager.updateIndexEntry(checkpoint_id, checkpoint);

    // 更新 current-checkpoint.json
    stateStore.setCurrentCheckpointID(projectRoot, checkpoint_id);

    // 保存 session_id 供后续 hooks/tools 使用
    if (realSessionID) {
      stateStore.setCurrentSessionID(projectRoot, realSessionID);
    }

    // 获取恢复提示 + 当前步骤指令（与 opencode takeCurrentStepText 对齐）
    const resumePrompt = checkpointManager.getResumePrompt(checkpoint_id);
    const stepInstruction = (function() {
      if (!agentCfg?.workflow || agentCfg.workflow.length === 0) return null;
      const currentStepId = exec?.currentStep;
      const currentStepConfig = agentCfg.workflow.find(s => (s.step_id || s.name) === currentStepId);
      if (!currentStepConfig) return null;
      const currentStepState = currentStepId ? exec?.steps[currentStepId] : null;
      return formatStepPrompt(currentStepConfig, currentStepState?.context);
    })();

    outputResult({
      success: true,
      checkpointID: checkpoint_id,
      workflow: checkpoint.workflow.name,
      currentStage: stage,
      sessionID,
      agentId,
      resumePrompt,
      stepInstruction,
      subagent_role_id: agentId,
      message: `检查点 "${checkpoint_id}" 已恢复。Agent: ${agentId}, 当前步骤: ${prevStep || '—'}`,
    });
  } catch (e) {
    outputError(e.message);
  }
}

main();
