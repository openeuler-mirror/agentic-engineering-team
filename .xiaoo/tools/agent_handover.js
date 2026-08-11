/**
 * AET xiaoO Agent Handover Tool
 *
 * 与 opencode executeStageHandover (aet.js L427+) 对齐：
 * - 完成当前阶段 execution
 * - 启动新阶段 execution
 * - 初始化新阶段的 steps
 * - 返回 subagent_role_id
 * - 必须传 checkpoint_id，无全局兜底
 */

'use strict';

const path = require('path');
const { resolveProjectRoot, readStdinJson, outputResult, outputError, asText, AET_ROOT } = require('../tool-utils');

const lib = (name) => require(path.join(AET_ROOT, '.platform/utils', name));

const { ConfigManager } = lib('config-manager');
const { CheckpointManager } = lib('checkpoint-manager');
const { StateStore } = require('../state-store');

async function main() {
  try {
    const input = await readStdinJson();
    const { target_agent, context, checkpoint_id } = input.args || input;
    const projectRoot = resolveProjectRoot();
    const stateStore = new StateStore(projectRoot);

    if (!checkpoint_id) {
      outputError('缺少 checkpoint_id 参数，无法执行阶段移交。');
      return;
    }

    if (!target_agent) {
      outputError('缺少 target_agent 参数');
      return;
    }

    const checkpointManager = new CheckpointManager(projectRoot);
    const configManager = new ConfigManager();
    configManager.reloadConfig(projectRoot);

    const checkpoint = checkpointManager.getCheckpoint(checkpoint_id);
    if (!checkpoint) {
      outputError(`Checkpoint "${checkpoint_id}" 不存在`);
      return;
    }

    // 校验并纠正 target_agent：LLM 可能传简写名（如 "implement"），需匹配完整 agent_id
    let resolvedAgent = target_agent;
    let agentConfig = configManager.getAgentConfig(resolvedAgent);
    if (!agentConfig) {
      // 尝试从 scenario workflow 中查找匹配的 agent_id
      const { WorkflowEngine } = lib('workflow-engine');
      const workflowEngine = new WorkflowEngine(configManager, checkpointManager);
      const stages = workflowEngine.getScenarioWorkflow(checkpoint.workflow.name);
      const matched = stages.find(s =>
        s.agent_id === target_agent ||
        s.agent_id === `aet-${target_agent}` ||
        s.stage_id === target_agent
      );
      if (matched) {
        resolvedAgent = matched.agent_id || matched.stage_id;
        agentConfig = configManager.getAgentConfig(resolvedAgent);
      }
    }
    if (!agentConfig) {
      outputError(`Agent "${target_agent}" 不存在。可用的 agents: ${Object.keys(configManager.getAllAgents()).join(', ')}`);
      return;
    }

    // 完成当前阶段（与 opencode completeExecution 对齐）
    const currentStage = checkpoint.workflow.currentStage;
    if (currentStage) {
      const currentExecution = checkpointManager.getCurrentExecution(checkpoint, currentStage);

      // after:confirm 检查：当前 step 配置了 after:confirm 且尚未发送确认提示词时，
      // 拒绝调用，让 LLM 等待 idle handler 发送确认 prompt 后再推进。
      const currentAgentConfig = configManager.getAgentConfig(currentStage);
      if (currentAgentConfig?.workflow?.length > 0 && currentExecution?.currentStep) {
        const currentStepState = currentExecution.steps[currentExecution.currentStep];
        const currentStepConfig = currentAgentConfig.workflow.find(
          s => (s.step_id || s.name) === currentExecution.currentStep
        );
        if (currentStepConfig?.after === 'confirm' && !currentStepState?.confirmSent) {
          outputError(
            `当前步骤 "${currentStepConfig.name}" 配置了 after:confirm，需要等待系统发送确认提示词后再进行阶段移交。` +
            `请立即结束当前回复，等待系统确认提示。`
          );
          return;
        }

        // 防跳步守卫：当前 step 不是最后一步时，拒绝 agent_handover，要求使用 step_handover
        const stepConfigs = currentAgentConfig.workflow;
        const currentIdx = stepConfigs.findIndex(s => (s.step_id || s.name) === currentExecution.currentStep);
        if (currentIdx >= 0 && currentIdx < stepConfigs.length - 1) {
          const nextStepConfig = stepConfigs[currentIdx + 1];
          const nextStepName = nextStepConfig?.name || nextStepConfig?.step_id;
          outputError(
            `当前步骤 "${currentStepConfig.name}" 不是最后一步，下一步是 "${nextStepName}"。` +
            `请使用 step_handover 推进到下一步，不要调用 agent_handover。`
          );
          return;
        }
      }

      if (currentExecution?.status !== 'completed') {
        const stepResult = typeof context === 'object' ? context : { summary: context };
        checkpointManager.completeExecution(checkpoint_id, currentStage, stepResult);
      }
    }

    // 启动新阶段（与 opencode startExecution 对齐）
    // sessionID：从 StateStore 读取真实 xiaoO session_id
    const realSessionID = stateStore.getCurrentSessionID(projectRoot);
    const sessionID = realSessionID || `aet-${resolvedAgent}-${Date.now()}`;
    checkpointManager.startExecution(
      checkpoint_id,
      resolvedAgent,
      sessionID,
      resolvedAgent,
      context
    );

    if (agentConfig.workflow?.length > 0) {
      checkpointManager.initSteps(checkpoint_id, resolvedAgent, agentConfig.workflow);
    }
    stateStore.setCurrentCheckpointID(projectRoot, checkpoint_id);

    outputResult({
      success: true,
      checkpointID: checkpoint_id,
      fromStage: currentStage,
      toStage: resolvedAgent,
      subagent_role_id: resolvedAgent,
      task_goal: `Execute the ${resolvedAgent} phase of the AET workflow. Checkpoint ID: ${checkpoint_id}.`,
      task_context: typeof context === 'string' ? context : asText(context),
      message: `阶段移交完成：${currentStage || '起始'} → ${resolvedAgent}。请立即结束当前session到idle状态，系统将idle时会自动注入step prompt。`,
    });
  } catch (e) {
    outputError(e.message);
  }
}

main();
