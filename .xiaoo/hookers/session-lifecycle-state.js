/**
 * AET xiaoO *.Session.lifecycle.state Hook
 *
 * 与 opencode event(session.status) 对齐
 *
 * 职责：
 * 1. 检测 session idle
 * 2. step 推进：idle 时触发 after hook（与 opencode triggerStepAfterHook 对齐）
 * 3. stage 推进：所有 step 完成后处理 stage handover
 *
 * 重要设计决策（与 opencode 对齐）：
 * - step pending → 注入 step 指令 + pending→in_progress（send_prompt）
 * - step in_progress + idle → 触发 after hook
 *   - after: 'confirm' → send_prompt 确认消息，等 LLM 调 step_handover
 *   - after: 'auto' / null → 自动推进到下一个 step + send_prompt 下一步指令
 * - 所有 step 完成 → 处理 stage 推进
 *
 * xiaoO 协议：
 * - send_prompt 字段名: text（不是 prompt），见 plugins.md
 * - stage 交接在当前 session 内进行，仅 send_prompt 注入下一阶段指令
 * - send_prompt 必须排在 actions 数组最后
 * - 仅 remote 模式生效，local 模式 send_prompt 被丢弃
 *
 * Input: { stage: "session_state", session_id, state: "idle", outcome }
 * Output: { result: "ack" } | { result: "ack", actions: [{kind, ...}] }
 */

'use strict';

const path = require('path');
const {
  AET_ROOT,
  resolveProjectRoot,
  readPayload,
  writeResult,
  asText,
  confirmPrompt,
  formatStepPrompt,
} = require('../hook-utils');

const lib = (name) => require(path.join(AET_ROOT, '.platform/utils', name));

const { ConfigManager } = lib('config-manager');
const { CheckpointManager } = lib('checkpoint-manager');
const { WorkflowEngine } = lib('workflow-engine');
const { StateStore } = require('../state-store');

function main() {
  const payload = readPayload();

  if (!payload || payload.stage !== 'session_state') {
    writeResult({ result: 'ack' });
    return;
  }

  try {
    const sessionId = payload.session_id || '';
    const state = payload.state;
    const outcome = payload.outcome || null;
    const projectRoot = resolveProjectRoot();
    if (!projectRoot) {
      writeResult({ result: 'ack' });
      return;
    }
    const stateStore = new StateStore(projectRoot);
    const checkpointManager = new CheckpointManager(projectRoot);

    // xiaoO 用户正常中断通过 state='idle' + outcome='cancelled'，其他错误中断通过 state='failed'
    if (outcome === 'cancelled' && state === 'idle' || state === 'failed') {
      const commandInfo = stateStore.getCommandInfo(projectRoot, sessionId);
      let checkpointID = commandInfo?.checkpointID;

      if (!checkpointID) {
        checkpointID = stateStore.getCurrentCheckpointID(projectRoot);
      }

      if (checkpointID) {
        checkpointManager.interruptCheckpoint(checkpointID, 'User aborted execution');
        stateStore.clearCurrentCheckpointID(projectRoot);
        stateStore.clearCommandInfo(projectRoot, sessionId);
      }
      writeResult({ result: 'ack' });
      return;
    }

    if (state !== 'idle') {
      writeResult({ result: 'ack' });
      return;
    }

    const configManager = new ConfigManager();
    configManager.reloadConfig(projectRoot);
    const workflowEngine = new WorkflowEngine(configManager, checkpointManager);

    const idleCommandInfo = stateStore.getCommandInfo(projectRoot, sessionId);
    let checkpointID = idleCommandInfo?.checkpointID;
    if (!checkpointID) {
      checkpointID = stateStore.getCurrentCheckpointID(projectRoot);
    }
    if (!checkpointID) {
      writeResult({ result: 'ack' });
      return;
    }

    const checkpoint = checkpointManager.getCheckpoint(checkpointID);
    if (!checkpoint) {
      writeResult({ result: 'ack' });
      return;
    }

    // === interrupt 检测（与 opencode event.session.status 对齐） ===
    if (checkpoint.workflow.status !== 'in_progress') {
      writeResult({ result: 'ack' });
      return;
    }

    const currentStage = checkpoint.workflow.currentStage;
    const execution = currentStage
      ? checkpointManager.getCurrentExecution(checkpoint, currentStage)
      : null;

    if (!execution || execution.status === 'interrupted') {
      writeResult({ result: 'ack' });
      return;
    }

    const agentConfig = configManager.getAgentConfig(execution.agentId);
    const hasWorkflow = agentConfig?.workflow && agentConfig.workflow.length > 0;
    const actions = [];

    // === 与 opencode 对齐：idle handler 触发 step after hook ===
    if (hasWorkflow && execution.currentStep) {
      const currentStepId = execution.currentStep;
      const currentStepState = execution.steps[currentStepId];

      if (currentStepState?.status === 'pending') {
        // step pending → 注入 step 指令 + pending → in_progress
        const currentStepConfig = agentConfig.workflow.find(
          s => (s.step_id || s.name) === currentStepId
        );
        if (currentStepConfig) {
          let stepText;
          if (currentStepConfig.before === 'confirm') {
            stepText = confirmPrompt.stepBefore(currentStepConfig.name);
          } else {
            stepText = formatStepPrompt(currentStepConfig);
          }

          // pending → in_progress
          const cp = checkpointManager.getCheckpoint(checkpointID);
          const cpExecution = checkpointManager.getCurrentExecution(cp, currentStage);
          if (cpExecution && cpExecution.steps[currentStepId]?.status === 'pending') {
            const stepCtx = cpExecution.steps[currentStepId].context || cpExecution.context || null;
            cpExecution.steps[currentStepId] = {
              ...cpExecution.steps[currentStepId],
              status: 'in_progress',
              startedAt: new Date().toISOString(),
              context: stepCtx,
            };
            cp.history.push({
              ts: new Date().toISOString(),
              event: 'step_started',
              stage: currentStage,
              executionId: cpExecution.executionId,
              step: currentStepId,
            });
            checkpointManager.saveCheckpoint(cp);
          }

          actions.push({
            kind: 'send_prompt',
            session_id: sessionId,
            text: stepText,
          });
        }
      } else if (currentStepState?.status === 'in_progress') {
        // step in_progress + idle → 触发 after hook（与 opencode triggerStepAfterHook 对齐）
        const currentStepConfig = agentConfig.workflow.find(
          s => (s.step_id || s.name) === currentStepId
        );
        if (currentStepConfig) {
          const after = currentStepConfig.after || null;

          if (after === 'confirm') {
            // after:confirm → 发确认 prompt，等用户确认后 LLM 调 step_handover
            // 防止重复发送：已发送过 confirmSent 的跳过
            if (currentStepState.confirmSent) {
              // 已发送过确认提示词，LLM 尚未调用 step_handover，不做任何操作
            } else {
              // 计算下一步信息（在提示词中明确下一步名称，防止 LLM 误调 agent_handover）
              const stepConfigs = agentConfig.workflow;
              const currentIdx = stepConfigs.findIndex(s => (s.step_id || s.name) === currentStepId);
              const nextStepConfig = stepConfigs[currentIdx + 1];
              const nextStepName = nextStepConfig?.name || null;

              const hookConfig = workflowEngine.getHookConfig(after);
              if (hookConfig?.promptTemplate) {
                const description = hookConfig.description || 'Confirm before proceeding to next step';
                const optionsText = hookConfig.options?.map(opt => `- ${opt.label}`).join('\n') || '';
                let userText = hookConfig.promptTemplate
                  .replace('{description}', description)
                  .replace('{options}', optionsText);
                userText += `\n\nCurrent Step: **${currentStepConfig.name}**`;
                userText += confirmPrompt.stepAfterSuffix(nextStepName);
                actions.push({
                  kind: 'send_prompt',
                  session_id: sessionId,
                  text: userText,
                });
              } else {
                // 无 hookConfig → 默认确认 prompt
                const defaultText = confirmPrompt.stepAfter(currentStepConfig.name, nextStepName);
                actions.push({
                  kind: 'send_prompt',
                  session_id: sessionId,
                  text: defaultText,
                });
              }
              // 标记 confirmSent，防止重复发送，同时允许 step_handover/agent_handover 通过
              const cp = checkpointManager.getCheckpoint(checkpointID);
              const cpExec = checkpointManager.getCurrentExecution(cp, currentStage);
              if (cpExec && cpExec.steps[currentStepId]) {
                cpExec.steps[currentStepId] = {
                  ...cpExec.steps[currentStepId],
                  confirmSent: true,
                };
                checkpointManager.saveCheckpoint(cp);
              }
            }
          } else {
            // after:auto / after:null → 自动推进到下一个 step（与 opencode advanceToNextStep 对齐）
            const stepConfigs = agentConfig.workflow;
            const currentIdx = stepConfigs.findIndex(s => (s.step_id || s.name) === currentStepId);
            const nextStepConfig = stepConfigs[currentIdx + 1];

            if (!nextStepConfig) {
              // 当前 stage 最后一个 step 完成 → 收尾 execution 并调用 stage handover。
              const execResult = currentStepState?.context;
              checkpointManager.completeExecution(checkpointID, currentStage, execResult);
              checkpointManager.completeAllSteps(checkpointID, currentStage)
              const stages = workflowEngine.getScenarioWorkflow(checkpoint.workflow.name);
              const stageIdx = stages.findIndex(s => (s.stage_id || s.agent_id) === currentStage);
              const nextStage = stageIdx >= 0 ? stages[stageIdx + 1] : undefined;

              if (!nextStage) {
                // 最后阶段 → 完成 workflow + 发送完成消息
                checkpointManager.completeCheckpoint(checkpointID);
                stateStore.clearCurrentCheckpointID(projectRoot);
                stateStore.clearCommandInfo(projectRoot, sessionId);
                const completionText = `All steps completed`;
                actions.push({ kind: 'send_prompt', session_id: sessionId, text: completionText });
              } else {
                const nextAgentId = nextStage.agent_id || nextStage.stage_id;
                const nextAgentConfig = configManager.getAgentConfig(nextAgentId);
                const stageAfter = stages[stageIdx]?.after || null;

                if (stageAfter === 'confirm') {
                  const confirmText = confirmPrompt.stageAfter(currentStage, nextAgentId);
                  actions.push({ kind: 'send_prompt', session_id: sessionId, text: confirmText });
                } else {
                  checkpointManager.startExecution(
                    checkpointID,
                    nextAgentId,
                    sessionId,
                    nextAgentId,
                    execResult || execution.context || checkpoint.workflow.description
                  );

                  if (nextAgentConfig?.workflow?.length > 0) {
                    checkpointManager.initSteps(checkpointID, nextAgentId, nextAgentConfig.workflow);
                  }

                  let stageText;
                  if (nextAgentConfig?.workflow?.length > 0) {
                    const firstStep = nextAgentConfig.workflow[0];
                    const before = firstStep.before || null;
                    if (before === 'confirm') {
                      stageText = confirmPrompt.stepBefore(firstStep.name);
                    } else {
                      stageText = formatStepPrompt(firstStep);
                    }

                    // pending → in_progress
                    const cp = checkpointManager.getCheckpoint(checkpointID);
                    const cpExecution = checkpointManager.getCurrentExecution(cp, nextAgentId);
                    const firstStepId = firstStep.step_id || firstStep.name;
                    if (cpExecution && cpExecution.steps[firstStepId]?.status === 'pending') {
                      const stepCtx = cpExecution.steps[firstStepId].context || cpExecution.context || null;
                      cpExecution.steps[firstStepId] = {
                        ...cpExecution.steps[firstStepId],
                        status: 'in_progress',
                        startedAt: new Date().toISOString(),
                        context: stepCtx,
                      };
                      cp.history.push({
                        ts: new Date().toISOString(),
                        event: 'step_started',
                        stage: nextAgentId,
                        executionId: cpExecution.executionId,
                        step: firstStepId,
                      });
                      checkpointManager.saveCheckpoint(cp);
                    }
                  } else {
                    stageText = (execResult || execution.context)
                      ? `## Context from previous stage:\n${asText(execResult || execution.context)}`
                      : `Continue workflow stage: ${nextAgentId}`;
                  }

                  actions.push({ kind: 'send_prompt', session_id: sessionId, text: stageText });
                }
              }
            } else {
              const nextStepId = nextStepConfig.step_id || nextStepConfig.name;

              // 推进 checkpoint：当前 step completed + 下一个 step pending
              checkpointManager.advanceStep(checkpointID, currentStage, nextStepId, { summary: `Step ${currentStepConfig.name} completed` }, { idleDriven: true });

              // 检查 next step 的 before 配置
              if (!nextStepConfig.before || nextStepConfig.before === 'auto') {
                // before:auto/null → 注入下一步指令 + pending→in_progress
                const stepText = formatStepPrompt(nextStepConfig);

                // pending → in_progress
                const cp = checkpointManager.getCheckpoint(checkpointID);
                const cpExecution = checkpointManager.getCurrentExecution(cp, currentStage);
                if (cpExecution && cpExecution.steps[nextStepId]?.status === 'pending') {
                  const stepCtx = cpExecution.steps[nextStepId].context || null;
                  cpExecution.steps[nextStepId] = {
                    ...cpExecution.steps[nextStepId],
                    status: 'in_progress',
                    startedAt: new Date().toISOString(),
                    context: stepCtx,
                  };
                  cp.history.push({
                    ts: new Date().toISOString(),
                    event: 'step_started',
                    stage: currentStage,
                    executionId: cpExecution.executionId,
                    step: nextStepId,
                  });
                  checkpointManager.saveCheckpoint(cp);
                }

                actions.push({
                  kind: 'send_prompt',
                  session_id: sessionId,
                  text: stepText,
                });
              } else if (nextStepConfig.before === 'confirm') {
                // before:confirm → 发确认 prompt，等 LLM 调 step_handover
                const confirmText = confirmPrompt.stepBefore(nextStepConfig.name);
                actions.push({
                  kind: 'send_prompt',
                  session_id: sessionId,
                  text: confirmText,
                });
              }
            }
          }
        }
      }
    } else {
      // stage 级推进
      // - hasWorkflow && !currentStep：所有 step 已完成（step_handover 已调 completeExecution）
      // - !hasWorkflow：无 step，整个 stage 为一个整体
      // 仅当 execution 尚未完成时调用 completeExecution（避免重复调用）
      if (execution.status !== 'completed') {
        checkpointManager.completeExecution(checkpointID, currentStage, 'Stage completed');
      }

      const stages = workflowEngine.getScenarioWorkflow(checkpoint.workflow.name);
      const stageIdx = stages.findIndex(s => (s.stage_id || s.agent_id) === currentStage);
      const nextStage = stageIdx >= 0 ? stages[stageIdx + 1] : undefined;

      if (!nextStage) {
        // 最后阶段 → 完成 workflow + 发送完成消息
        checkpointManager.completeCheckpoint(checkpointID);
        stateStore.clearCurrentCheckpointID(projectRoot);
        stateStore.clearCommandInfo(projectRoot, sessionId);
        const completionText = `All steps completed`;
        actions.push({ kind: 'send_prompt', session_id: sessionId, text: completionText });
      } else {
        const nextAgentId = nextStage.agent_id || nextStage.stage_id;
        const nextAgentConfig = configManager.getAgentConfig(nextAgentId);
        const stageAfter = stages[stageIdx]?.after || null;

        if (stageAfter === 'confirm') {
          // stage after:confirm → 需要用户确认后推进
          const confirmText = confirmPrompt.stageAfter(currentStage, nextAgentId);
          actions.push({
            kind: 'send_prompt',
            session_id: sessionId,
            text: confirmText,
          });
        } else {
          // stage after:auto → 在当前 session 内推进到下一阶段
          checkpointManager.startExecution(
            checkpointID,
            nextAgentId,
            sessionId,
            nextAgentId,
            execution.context || checkpoint.workflow.description
          );

          // 初始化新阶段 steps
          if (nextAgentConfig?.workflow?.length > 0) {
            checkpointManager.initSteps(checkpointID, nextAgentId, nextAgentConfig.workflow);
          }

          // 构造新阶段 prompt
          let stageText;
          if (nextAgentConfig?.workflow?.length > 0) {
            const firstStep = nextAgentConfig.workflow[0];
            const before = firstStep.before || null;
            if (before === 'confirm') {
              stageText = confirmPrompt.stepBefore(firstStep.name);
            } else {
              stageText = formatStepPrompt(firstStep);
            }

            // pending → in_progress
            const cp = checkpointManager.getCheckpoint(checkpointID);
            const cpExecution = checkpointManager.getCurrentExecution(cp, nextAgentId);
            const firstStepId = firstStep.step_id || firstStep.name;
            if (cpExecution && cpExecution.steps[firstStepId]?.status === 'pending') {
              const stepCtx = cpExecution.steps[firstStepId].context || cpExecution.context || null;
              cpExecution.steps[firstStepId] = {
                ...cpExecution.steps[firstStepId],
                status: 'in_progress',
                startedAt: new Date().toISOString(),
                context: stepCtx,
              };
              cp.history.push({
                ts: new Date().toISOString(),
                event: 'step_started',
                stage: nextAgentId,
                executionId: cpExecution.executionId,
                step: firstStepId,
              });
              checkpointManager.saveCheckpoint(cp);
            }
          } else {
            stageText = execution.context
              ? `## Context from previous stage:\n${asText(execution.context)}`
              : `Continue workflow stage: ${nextAgentId}`;
          }

          actions.push({
            kind: 'send_prompt',
            session_id: sessionId,
            text: stageText,
          });
        }
      }
    }

    if (actions.length > 0) {
      writeResult({ result: 'ack', actions });
    } else {
      writeResult({ result: 'ack' });
    }
  } catch (e) {
    writeResult({ result: 'ack' });
  }
}

main();
