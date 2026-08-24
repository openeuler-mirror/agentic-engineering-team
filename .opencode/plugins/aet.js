/**
 * AET Plugin for OpenCode
 *
 * Provides workflow-based agent execution with configurable steps.
 * Agents are loaded from the agents directory and configured via config.json.
 *
 * 状态管理使用 CheckpointManager，存储在项目 .aet/checkpoint/ 目录下
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { tool } from "@opencode-ai/plugin";

import { ConfigManager } from '../../.platform/utils/config-manager.js';
import { CheckpointManager } from '../../.platform/utils/checkpoint-manager.js';
import { WorkflowEngine } from '../../.platform/utils/workflow-engine.js';
import { TraceLogger, TRACE_DIR } from '../../.platform/utils/trace-logger.js';
import {
  ensureStringPath,
  detectProjectAnalysisFolder,
  formatProjectAnalysis,
} from '../../.platform/utils/project-analysis.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================
// Config Loading
// ============================================

const configManager = new ConfigManager();

// CheckpointManager 实例（延迟初始化，因为需要 projectRoot）
let checkpointManager = null;

// ============================================
// Agent Loading
// ============================================

function getAgentsDir() {
  return path.join(os.homedir(), '.config', 'opencode', 'aet', 'agents');
}

function getProjectAgentsDir(projectRoot) {
  return projectRoot ? path.join(ensureStringPath(projectRoot), 'agents') : null;
}

function toFileUrl(filePath) {
  if (!filePath) return null;
  const resolved = path.resolve(filePath);
  if (process.platform === 'win32') {
    return 'file:///' + resolved.replace(/\\/g, '/');
  }
  return 'file://' + resolved;
}

async function loadAgentDefinitions(agentsDir) {
  const agents = {};
  if (!agentsDir || !fs.existsSync(agentsDir)) {
    return agents;
  }
  for (const entry of fs.readdirSync(agentsDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const indexPath = path.join(agentsDir, entry.name, 'index.js');
      if (fs.existsSync(indexPath)) {
        try {
          const fileUrl = toFileUrl(indexPath);
          const mod = await import(fileUrl);
          for (const [key, value] of Object.entries(mod)) {
            if (key.endsWith('Definition') && value?.name) {
              agents[value.name] = value;
            }
          }
        } catch (e) {
          console.error(`[AET] Agent load error: ${entry.name}`, e.message);
        }
      }
    }
  }
  return agents;
}

const agentHandoverAgents = new Set();

function buildAgentHandoverParam(agentId) {
  if (!agentHandoverAgents.has(agentId)) {
    return {};
  }
  return { tools: { agent_handover: true } };
}

// ============================================
// Workflow Engine (适配 CheckpointManager)
// ============================================

const SessionCheckpointState = {
  RUNNING: 'running',
  PENDING_IDLE: 'pending_idle',
  INTERRUPTED: 'interrupted',
  COMPLETED: 'completed',
};

// 当前活跃的 checkpointID（内存缓存，方便快速访问）
let currentCheckpointID = null;

// workflowEngine 延迟初始化（需要 checkpointManager，在 aetPlugin 中创建）
let workflowEngine = null;

// ============================================
// Trace Logging — LLM request/response recording
// ============================================

// traceLogger 延迟初始化（需要 configManager 和 checkpointManager，在 aetPlugin 中创建）
let traceLogger = null;


// ============================================
// Session Run State Machine（单次执行生命周期）
// ============================================

const sessionCheckpoints = new Map();
let sessionCheckpointCounter = 0;
const IDLE_SETTLE_MS = 300;

// 确保 workflow 状态为 in_progress（用于中断后恢复）
// 同时重置 execution 和 step 的 interrupted 状态
function ensureCheckpointRunning(checkpointID) {
  if (!checkpointID || !checkpointManager) return;
  const checkpoint = checkpointManager.getCheckpoint(checkpointID);
  if (checkpoint && checkpoint.workflow.status === 'interrupted') {
    checkpoint.workflow.status = 'in_progress';
    checkpoint.interruptedAt = null;

    // 重置当前 execution 的 interrupted 状态
    const currentStage = checkpoint.workflow.currentStage;
    if (currentStage && checkpoint.executions[currentStage]) {
      const execution = checkpointManager.getCurrentExecution(checkpoint, currentStage);
      if (execution && execution.status === 'interrupted') {
        execution.status = 'in_progress';
        execution.completedAt = null;
        execution.result = null;

        // 重置当前 step 的 interrupted 状态
        if (execution.currentStep && execution.steps[execution.currentStep]) {
          const stepState = execution.steps[execution.currentStep];
          if (stepState.status === 'interrupted') {
            stepState.status = 'pending';
            stepState.completedAt = null;
          }
        }
      }
    }

    checkpoint.history.push({
      ts: new Date().toISOString(),
      event: 'workflow_resumed',
    });
    checkpointManager.saveCheckpoint(checkpoint);

    // 更新 index
    const index = checkpointManager.loadIndex();
    index.active = index.active.filter(e => e.checkpointID !== checkpointID);
    index.interrupted = index.interrupted.filter(e => e.checkpointID !== checkpointID);
    index.active.push({
      checkpointID,
      workflow: checkpoint.workflow.name,
      description: checkpoint.workflow.description,
      stage: checkpoint.workflow.currentStage,
      step: checkpointManager.getCurrentStepId(checkpoint),
      startedAt: checkpoint.startedAt,
      updatedAt: checkpoint.updatedAt,
    });
    checkpointManager.saveIndex(index);
  }
}

function startSessionCheckpoint(sessionID) {
  const checkpointID = ++sessionCheckpointCounter;
  sessionCheckpoints.set(sessionID, {
    checkpointID,
    state: SessionCheckpointState.RUNNING,
    startedAt: Date.now(),
  });
  return checkpointID;
}

function getCurrentSessionCheckpoint(sessionID) {
  return sessionCheckpoints.get(sessionID);
}

function markSessionCheckpointInterrupted(sessionID) {
  const sessionCheckpoint = sessionCheckpoints.get(sessionID);
  if (sessionCheckpoint && (sessionCheckpoint.state === SessionCheckpointState.RUNNING || sessionCheckpoint.state === SessionCheckpointState.PENDING_IDLE)) {
    sessionCheckpoint.state = SessionCheckpointState.INTERRUPTED;
  }
}

function closeSessionCheckpoint(sessionID) {
  sessionCheckpoints.delete(sessionID);
}

async function shouldSkipAfterHook(sessionID, expectedCheckpointID) {
  const currentSessionCheckpoint = getCurrentSessionCheckpoint(sessionID);
  if (!currentSessionCheckpoint || currentSessionCheckpoint.checkpointID !== expectedCheckpointID || currentSessionCheckpoint.state === SessionCheckpointState.INTERRUPTED) {
    return true;
  }
  try {
    const msgs = await pluginClient.session.messages({ path: { id: sessionID } });
    const msgsData = msgs.data || [];
    const lastMsg = msgsData[msgsData.length - 1];
    return lastMsg?.info?.error?.name === 'MessageAbortedError';
  } catch (e) {
    return false;
  }
}

// ============================================
// Store client reference
// ============================================

let pluginClient = null;
let pluginDirectory = null;
let rootSessionID = null;

// ============================================
// Hook Handling
// ============================================

function isAutomationMode(checkpointID) {
  if (!checkpointID || !checkpointManager) return false;
  const cp = checkpointManager.getCheckpoint(checkpointID);
  if (!cp?.workflow?.name) return false;
  const scenario = configManager.getScenarioConfig(cp.workflow.name);
  return scenario?.automation === true;
}

async function triggerAfterHook(sessionID, stage, checkpointID) {
  if (!stage || !stage.after) {
    return;
  }

  if (stage.after === 'auto') {
    // 自动推进到下一阶段
    const workflowName = checkpointManager.getCheckpoint(checkpointID)?.workflow.name;
    const stages = workflowEngine.getScenarioWorkflow(workflowName);
    const currentIdx = stages.findIndex(s => (s.stage_id || s.agent_id) === stage.stage_id || stage.agent_id);
    const nextStage = stages[currentIdx + 1];
    if (nextStage) {
      await executeStageHandover(nextStage, null, checkpointID);
    }
    return;
  }

  // Automation short-circuit: confirm === auto when automation mode.
  // Skip the user-facing session.prompt call and advance directly.
  if (stage.after === 'confirm' && isAutomationMode(checkpointID)) {
    const workflowName = checkpointManager.getCheckpoint(checkpointID)?.workflow.name;
    const stages = workflowEngine.getScenarioWorkflow(workflowName);
    const currentIdx = stages.findIndex(s => (s.stage_id || s.agent_id) === stage.stage_id || stage.agent_id);
    const nextStage = stages[currentIdx + 1];
    if (nextStage) {
      await executeStageHandover(nextStage, null, checkpointID);
    } else {
      // Last stage: complete the checkpoint (the existing `auto` branch
      // omits this case — automation must terminate cleanly when there
      // is no next stage).
      checkpointManager.completeCheckpoint(checkpointID);
    }
    return;
  }

  const hookConfig = workflowEngine.getHookConfig(stage.after);
  if (hookConfig && hookConfig.options && hookConfig.options.length > 0) {
    const description = hookConfig.description || 'Please confirm';
    const optionsText = hookConfig.options.map(opt => `- ${opt.label}`).join('\n');
    const template = hookConfig.promptTemplate || 'Question: "{description}"\n{options}';
    let userPrompt = template.replace('{description}', description).replace('{options}', optionsText);
    if (stage.after === 'confirm') {
      userPrompt += '\n\n**If user approves, please call agent_handover to advance to the next stage.**';
    }
    startSessionCheckpoint(sessionID);
    try {
      await pluginClient.session.prompt({
        path: { id: sessionID },
        body: {
          agent: stage.agent_id,
          noReply: false,
          parts: [{ type: 'text', text: userPrompt }],
          ...buildAgentHandoverParam(stage.agent_id),
        },
      });
    } catch (err) {
      console.error('[AET] After hook error:', err.message);
    }
  }
}

async function triggerStepAfterHook(sessionID, agentId, agentConfig, checkpointID, stage) {
  const currentStepInfo = checkpointManager.getCurrentStep(checkpointID, stage);
  if (!currentStepInfo) {
    return;
  }

  const stepConfig = agentConfig.workflow?.find(s => (s.step_id || s.name) === currentStepInfo.stepId);
  if (!stepConfig || !stepConfig.after) {
    return;
  }

  if (stepConfig.after === 'auto') {
    await advanceToNextStep(sessionID, agentId, agentConfig, checkpointID, stage, null);
    return;
  }

  // Automation short-circuit: confirm === auto when automation mode.
  // Skip the user-facing session.prompt call and advance directly.
  if (stepConfig.after === 'confirm' && isAutomationMode(checkpointID)) {
    await advanceToNextStep(sessionID, agentId, agentConfig, checkpointID, stage, null);
    return;
  }

  const hookConfig = workflowEngine.getHookConfig(stepConfig.after);
  if (hookConfig && hookConfig.options && hookConfig.options.length > 0) {
    const description = hookConfig.description || 'Confirm before proceeding to next step';
    const optionsText = hookConfig.options.map(opt => `- ${opt.label}`).join('\n');
    const template = hookConfig.promptTemplate || 'Question: "{description}"\n{options}';
    let userPrompt = template.replace('{description}', description).replace('{options}', optionsText);
    userPrompt += `\n\nCurrent Step: **${stepConfig.name}**`;
    if (stepConfig.after === 'confirm') {
      userPrompt += '\n\n**If user approves, please call step_handover to advance to the next step.**';
    }
    startSessionCheckpoint(sessionID);
    try {
      await pluginClient.session.prompt({
        path: { id: sessionID },
        body: {
          agent: agentId,
          noReply: false,
          parts: [{ type: 'text', text: userPrompt }],
        },
      });
    } catch (err) {
      console.error('[AET] Step after hook error:', err.message);
    }
  }
}

async function advanceToNextStep(sessionID, agentId, agentConfig, checkpointID, stage, context, targetStepId = null) {
  if (!checkpointManager || !checkpointID) {
    return;
  }

  const currentStepInfo = checkpointManager.getCurrentStep(checkpointID, stage);
  if (!currentStepInfo) {
    return;
  }

  const stepConfigs = agentConfig.workflow || [];
  let nextStepConfig;
  if (targetStepId) {
    // 跳转到指定 step（前跳=跳过中间步骤，回跳=重做）
    nextStepConfig = stepConfigs.find(s => (s.step_id || s.name) === targetStepId);
  } else {
    const currentIdx = stepConfigs.findIndex(s => (s.step_id || s.name) === currentStepInfo.stepId);
    nextStepConfig = stepConfigs[currentIdx + 1];
  }

  if (!nextStepConfig) {
    // 没有目标 / 已是最后一步 → 所有步骤完成
    checkpointManager.completeAllSteps(checkpointID, stage);
    return;
  }

  const nextStepId = nextStepConfig.step_id || nextStepConfig.name;

  // 推进到下一步
  checkpointManager.advanceStep(checkpointID, stage, nextStepId, context);

  const shouldClear = nextStepConfig.clear === true;

  // 检查 before hook
  if (!nextStepConfig.before || nextStepConfig.before === 'auto' ||
      (nextStepConfig.before === 'confirm' && isAutomationMode(checkpointID))) {
    if (shouldClear) {
      sendStepPromptWithNewSession(sessionID, agentId, checkpointID, stage, nextStepConfig);
    } else {
      sendStepPrompt(sessionID, agentId, checkpointID, stage, nextStepConfig);
    }
    return;
  }

  const hookConfig = workflowEngine.getHookConfig(nextStepConfig.before);
  if (hookConfig && hookConfig.options && hookConfig.options.length > 0) {
    const description = hookConfig.description || 'Confirm before starting next step';
    const optionsText = hookConfig.options.map(opt => `- ${opt.label}`).join('\n');
    const template = hookConfig.promptTemplate || 'Question: "{description}"\n{options}';
    let userPrompt = template.replace('{description}', description).replace('{options}', optionsText);
    userPrompt += `\n\n即将执行的 Step: **${nextStepConfig.name}**`;
    if (nextStepConfig.before === 'confirm') {
      userPrompt += '\n\n**If user approves, please call step_handover to continue.**';
    }
    if (shouldClear) {
      const hookSessionID = await createSessionForClearIfNeeded(sessionID, agentId, checkpointID, stage, true);
      startSessionCheckpoint(hookSessionID);
      try {
        await pluginClient.session.prompt({
          path: { id: hookSessionID },
          body: {
            agent: agentId,
            noReply: false,
            parts: [{ type: 'text', text: userPrompt }],
          },
        });
      } catch (err) {
        console.error('[AET] Step before hook error:', err.message);
      }
    } else {
      startSessionCheckpoint(sessionID);
      try {
        await pluginClient.session.prompt({
          path: { id: sessionID },
          body: {
            agent: agentId,
            noReply: false,
            parts: [{ type: 'text', text: userPrompt }],
          },
        });
      } catch (err) {
        console.error('[AET] Step before hook error:', err.message);
      }
    }
    return;
  }

  if (shouldClear) {
    sendStepPromptWithNewSession(sessionID, agentId, checkpointID, stage, nextStepConfig);
  } else {
    sendStepPrompt(sessionID, agentId, checkpointID, stage, nextStepConfig);
  }
}

async function createSessionForClearIfNeeded(oldSessionID, agentId, checkpointID, stage, updateCheckpoint = true) {
  if (!pluginClient || !pluginDirectory) return oldSessionID;

  try {
    const createResult = await pluginClient.session.create({
      body: { title: `${agentId} - ${stage} Stage (context cleared)` },
      query: { directory: pluginDirectory },
    });
    const newSessionID = createResult.data?.id;
    if (!newSessionID) {
      console.error('[AET] Failed to create new session for clear=true');
      return oldSessionID;
    }

    try {
      await pluginClient.tui.publish({
        body: {
          type: 'tui.session.select',
          properties: { sessionID: newSessionID },
        },
      });
    } catch (tuiErr) {
      // Ignore TUI errors
    }

    if (updateCheckpoint) {
      const checkpoint = checkpointManager.getCheckpoint(checkpointID);
      if (checkpoint) {
        const execution = checkpointManager.getCurrentExecution(checkpoint, stage);
        if (execution) {
          execution.sessionID = newSessionID;
          checkpointManager.saveCheckpoint(checkpoint);
          checkpointManager.updateIndexEntry(checkpointID, checkpoint);
        }
      }
    }

    return newSessionID;
  } catch (err) {
    console.error('[AET] Create session for clear error:', err.message);
    return oldSessionID;
  }
}

async function sendStepPrompt(sessionID, agentId, checkpointID, stage, stepConfig) {
  if (!checkpointManager || !checkpointID) return;

  let promptText = `## Please continue executing this step:\n`;
  promptText += `Step name:\n${stepConfig.name}\n`;
  promptText += `Task:\n${stepConfig.description}`;

  startSessionCheckpoint(sessionID);
  try {
    await pluginClient.session.prompt({
      path: { id: sessionID },
      body: {
        agent: agentId,
        noReply: false,
        parts: [{ type: 'text', text: promptText }],
      },
    });
  } catch (err) {
    console.error('[AET] Send step prompt error:', err.message);
  }
}

async function sendStepPromptWithNewSession(oldSessionID, agentId, checkpointID, stage, stepConfig) {
  if (!pluginClient || !pluginDirectory) return;

  let promptText = `## Please continue executing this step:\n`;
  promptText += `Step name:\n${stepConfig.name}\n`;
  promptText += `Task:\n${stepConfig.description}`;

  const newSessionID = await createSessionForClearIfNeeded(oldSessionID, agentId, checkpointID, stage);
  if (newSessionID === oldSessionID) return;

  startSessionCheckpoint(newSessionID);
  try {
    await pluginClient.session.prompt({
      path: { id: newSessionID },
      body: {
        agent: agentId,
        noReply: false,
        parts: [{ type: 'text', text: promptText }],
      },
    });
  } catch (err) {
    console.error('[AET] Send step prompt with new session error:', err.message);
  }
}

async function settleIdleRun(sessionID, expectedCheckpointID, stage, workflowRunID) {
  await new Promise(resolve => setTimeout(resolve, IDLE_SETTLE_MS));

  const currentSessionCheckpoint = getCurrentSessionCheckpoint(sessionID);
  if (!currentSessionCheckpoint || currentSessionCheckpoint.checkpointID !== expectedCheckpointID || currentSessionCheckpoint.state !== SessionCheckpointState.PENDING_IDLE) {
    return;
  }

  if (await shouldSkipAfterHook(sessionID, expectedCheckpointID)) {
    closeSessionCheckpoint(sessionID);
    return;
  }

  currentSessionCheckpoint.state = SessionCheckpointState.COMPLETED;
  closeSessionCheckpoint(sessionID);
  await triggerAfterHook(sessionID, stage, workflowRunID);
}

async function settleStepIdleRun(sessionID, expectedCheckpointID, agentId, agentConfig, workflowRunID, stage) {
  await new Promise(resolve => setTimeout(resolve, IDLE_SETTLE_MS));

  const currentSessionCheckpoint = getCurrentSessionCheckpoint(sessionID);
  if (!currentSessionCheckpoint || currentSessionCheckpoint.checkpointID !== expectedCheckpointID || currentSessionCheckpoint.state !== SessionCheckpointState.PENDING_IDLE) {
    return;
  }

  if (await shouldSkipAfterHook(sessionID, expectedCheckpointID)) {
    closeSessionCheckpoint(sessionID);
    return;
  }

  currentSessionCheckpoint.state = SessionCheckpointState.COMPLETED;
  closeSessionCheckpoint(sessionID);
  await triggerStepAfterHook(sessionID, agentId, agentConfig, workflowRunID, stage);
}

function resolveSessionAgent(sessionID, fallbackAgent = null) {
  if (!checkpointManager || !sessionID) {
    return fallbackAgent;
  }
  const agentId = checkpointManager.findAgentBySessionID(sessionID);
  return agentId || fallbackAgent;
}

// ============================================
// Stage Handover
// ============================================

async function executeStageHandover(stage, context, checkpointID, promptForAgent = null) {
  // promptForAgent: 发送给 agent 的 prompt（resume 时用 resumePrompt）
  // context: 保存到 execution 的 context（保持原始值，不应被 resumePrompt 覆盖）
  // 如果没有 promptForAgent，用 context 作为 prompt
  const actualPrompt = promptForAgent || context || `Please continue working on ${stage.agent_id}.`;

  if (!pluginClient || !pluginDirectory) {
    return;
  }

  try {
    const createResult = await pluginClient.session.create({
      body: { title: `${stage.agent_id} - ${stage.agent_id.toUpperCase().replace('-AGENT', '')} Stage` },
      query: { directory: pluginDirectory },
    });
    const newSessionID = createResult.data?.id;

    if (newSessionID) {
      if (!rootSessionID) {
        rootSessionID = newSessionID;
      }

      try {
        await pluginClient.tui.publish({
          body: {
            type: 'tui.session.select',
            properties: { sessionID: newSessionID },
          },
        });
      } catch (tuiErr) {
        // Ignore TUI errors
      }

      // 在 CheckpointManager 中记录 execution（resume 和非 resume 都创建新 execution）
      const stageName = stage.stage_id || stage.agent_id;

      // 一次性读取 checkpoint：后续 startExecution / initSteps / 恢复 全部在这个对象上进行，
      // 末尾只 saveCheckpoint 一次。避免中途反复 getCheckpoint（每次都从磁盘读出新副本），
      // 否则在某个副本上做的修改会被随后保存的另一份副本覆盖（last-write-wins）。
      const checkpoint = checkpointManager.getCheckpoint(checkpointID);

      // 获取当前阶段的 execution（用于 resume 同阶段的情况）
      const currentStageExecution = checkpointManager.getCurrentExecution(checkpoint, checkpoint.workflow.currentStage);
      const currentStageSteps = currentStageExecution?.steps || null;
      const currentStageCurrentStep = currentStageExecution?.currentStep || null;

      // 获取目标阶段的 execution（用于 resume 目标阶段的情况）
      const targetStageExecution = checkpointManager.getCurrentExecution(checkpoint, stageName);
      const targetStageSteps = targetStageExecution?.steps || null;
      const targetStageCurrentStep = targetStageExecution?.currentStep || null;

      // 确定 context：优先用传入的 context（agent_handover 传递），其次用目标阶段的 context
      const executionContext = context || targetStageExecution?.context || currentStageExecution?.context;

      // 确定 steps：如果是同一个阶段（resume），用当前阶段的 steps；如果是新阶段，用目标阶段的 steps（如果有）
      const isSameStage = checkpoint.workflow.currentStage === stageName;
      const previousSteps = isSameStage ? currentStageSteps : targetStageSteps;
      const previousCurrentStep = isSameStage ? currentStageCurrentStep : targetStageCurrentStep;

      // 创建新 execution（在同一对象上操作，不落盘）；newExecution 即写入 records 的那个对象引用
      const newExecution = checkpointManager.startExecutionOn(checkpoint, stageName, newSessionID, stage.agent_id, executionContext);

      // 初始化 steps（同一对象，不落盘）
      const agentConfig = configManager.getAgentConfig(stage.agent_id);
      if (agentConfig?.workflow && agentConfig.workflow.length > 0) {
        // 根据配置初始化所有 steps
        checkpointManager.initStepsOn(checkpoint, stageName, agentConfig.workflow, null);

        // Resume 时，恢复之前的 steps 状态（直接修改 newExecution，它就在 checkpoint 对象里）
        if (newExecution && previousSteps && Object.keys(previousSteps).length > 0) {
          // 合并之前的 steps 状态（保留 completed/pending 状态和 context）
          for (const [stepId, stepState] of Object.entries(previousSteps)) {
            if (newExecution.steps[stepId]) {
              newExecution.steps[stepId] = {
                ...newExecution.steps[stepId],
                ...stepState,
              };
            }
          }
          // 设置 currentStep 回到真正的断点
          newExecution.currentStep = previousCurrentStep;
          // 重置当前 step 的 status 为 pending，让 chat.message hook 能正确注入
          if (previousCurrentStep && newExecution.steps[previousCurrentStep]) {
            newExecution.steps[previousCurrentStep] = {
              ...newExecution.steps[previousCurrentStep],
              status: 'pending',
              startedAt: null,
            };
          }
        }
      }

      // 整个恢复段结束后，一次性落盘 + 更新索引
      checkpointManager.saveCheckpoint(checkpoint);
      checkpointManager.updateIndexEntry(checkpointID, checkpoint);

      // 检查 stage.before hook
      if (stage.before) {
        const hookConfig = workflowEngine.getHookConfig(stage.before);
        if (hookConfig && hookConfig.options && hookConfig.options.length > 0) {
          const description = hookConfig.description || 'Please confirm';
          const optionsText = hookConfig.options.map(opt => `- ${opt.label}`).join('\n');
          const template = hookConfig.promptTemplate || 'Question: "{description}"\n{options}';
          let userPrompt = template.replace('{description}', description).replace('{options}', optionsText);
          if (context) {
            userPrompt += `\n\nTask context:\n${context}`;
          }
          if (stage.before === 'confirm') {
            userPrompt += '\n\nIf user approves, please call agent_handover to begin this stage.';
          }

          startSessionCheckpoint(newSessionID);
          await pluginClient.session.prompt({
            path: { id: newSessionID },
            body: {
              agent: stage.agent_id,
              noReply: false,
              parts: [{ type: 'text', text: userPrompt }],
            },
          });
          return;
        }
      }

      // 直接执行，发送 prompt 给 agent
      startSessionCheckpoint(newSessionID);
      await pluginClient.session.prompt({
        path: { id: newSessionID },
        body: {
          agent: stage.agent_id,
          noReply: false,
          parts: [{ type: 'text', text: actualPrompt }],
        },
      });
    }
  } catch (e) {
    console.error('[AET] executeStageHandover error:', e.message);
  }
}

// ============================================
// 命令直入 + Checkpoint 复用（/design、/implement）
// ============================================

// 命令名（去掉命名空间后的最后一段）-> agent。
// 命令通过 frontmatter `agent:` 直接切到该 primary agent，这里登记需要「就地接入 checkpoint」的命令。
const CHECKPOINT_COMMAND_AGENTS = {
  design: 'aet-design',
  implement: 'aet-implement',
};

// command.execute.before 把命令会话记到这里，chat.message 首条消息时消费
const pendingCheckpointCmd = new Map(); // sessionID -> { command, agentId, arguments }

// 兼容 `aet:design` / `aet/design` / `aet-design` / `design` 等命名空间形式。
// 安装脚本（install.sh）会把命令文件链接成 `aet-<name>.md`，因此实际命令名带 `aet-` 前缀，
// 这里去掉命名空间分隔符和 `aet-` 前缀后再查表。
function resolveCommandAgent(command) {
  if (!command) return null;
  const name = String(command).split(/[:/]/).pop();
  if (CHECKPOINT_COMMAND_AGENTS[name]) return CHECKPOINT_COMMAND_AGENTS[name];
  if (name.startsWith('aet-')) {
    const stripped = name.slice(4);
    if (CHECKPOINT_COMMAND_AGENTS[stripped]) return CHECKPOINT_COMMAND_AGENTS[stripped];
  }
  return null;
}

function asText(v) {
  return typeof v === 'string' ? v : JSON.stringify(v, null, 2);
}

function appendText(output, text) {
  if (output?.parts && Array.isArray(output.parts)) {
    for (const part of output.parts) {
      if (part.type === 'text') {
        part.text += text;
        return true;
      }
    }
  }
  return false;
}

// 从描述里抽取稳定任务标识（key:xxx / issue 链接 / #编号），用于精确匹配可恢复 checkpoint
// 无历史时：就地为命令切入的 agent 创建并绑定一个 checkpoint（绑定当前 session，不新建 session）
function bootstrapAgentCheckpoint(sessionID, agentId, description) {
  const agentConfig = configManager.getAgentConfig(agentId);
  if (!agentConfig?.workflow || agentConfig.workflow.length === 0) return null;
  const checkpointID = checkpointManager.createCheckpoint(agentId, description || `Direct ${agentId} session`);
  checkpointManager.startExecution(checkpointID, agentId, sessionID, agentId, description || null);
  checkpointManager.initSteps(checkpointID, agentId, agentConfig.workflow, null);
  currentCheckpointID = checkpointID;
  return checkpointID;
}

// 列出「该 agent 自己历史执行过的、可恢复的」checkpoint
// 只保留 workflow.name === agentId（即该 agent 单独跑出来的记录），排除其它 scenario workflow 与已完成项
function listAgentResumableCheckpoints(agentId) {
  return checkpointManager.getResumableCheckpoints()
    .map(e => checkpointManager.getCheckpoint(e.checkpointID))
    .filter(cp => cp && cp.workflow.name === agentId && cp.workflow.status !== 'completed')
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

// 有历史时注入：本次任务 + 该 agent 全部可恢复历史记录，让模型自己判断、并最终找用户确认（仅在 candidates 非空时调用）
function buildCommandEntryPrompt(agentId, desc, candidates) {
  let p = `\n\n## 本次任务\n${desc || '(无描述)'}\n\n`;
  const list = candidates.map((cp, i) => {
    const ex = checkpointManager.getCurrentExecution(cp, cp.workflow.currentStage);
    return `${i + 1}. checkpointID=${cp.workflow.checkpointID}\n   当前步骤: ${ex?.currentStep || '—'}\n   更新于: ${cp.updatedAt}\n   描述: ${cp.workflow.description || '(无)'}`;
  }).join('\n');
  p += `## 该 agent 可恢复的历史任务（共 ${candidates.length} 个）\n${list}\n\n`
    + `请按以下步骤处理，在用户确认之前不要开始执行任何步骤：\n`
    + `1. 对照「本次任务」，判断它是否是上述某条任务的延续。\n`
    + `2. 用 question 工具向用户确认：是恢复其中某一条（指出编号/描述），还是作为新任务开始。\n`
    + `3. 根据用户选择执行（均在当前会话内继续，不会另开会话）：\n`
    + `   - 恢复：调用 checkpoint_resume({ checkpointID: "用户确认的ID" })，从其当前步骤继续；\n`
    + `   - 新任务：调用 workflow_start({ name: "${agentId}", context: "本次任务描述" })，从第一步开始。`;
  return p;
}

// 取出「当前 step 任务（+ 上一步 context）」文本，并把该 step 置 in_progress（幂等：仅 pending 时返回一次）。
// 返回的文本既可注入用户消息（首条消息场景），也可作为工具返回值交给模型（就地恢复/新建场景）。
function takeCurrentStepText(checkpointID) {
  const checkpoint = checkpointManager.getCheckpoint(checkpointID);
  if (!checkpoint) return null;
  const currentStage = checkpoint.workflow?.currentStage;
  const execution = checkpointManager.getCurrentExecution(checkpoint, currentStage);
  if (!execution) return null;
  const agentConfig = configManager.getAgentConfig(execution.agentId);

  // Agent 没有 workflow：返回 execution.context
  if (!agentConfig?.workflow || agentConfig.workflow.length === 0) {
    return execution.context ? `## Context from previous stage:\n${asText(execution.context)}` : null;
  }

  const currentStepId = execution.currentStep;
  const currentStepState = currentStepId ? execution.steps[currentStepId] : null;
  if (!currentStepState || currentStepState.status !== 'pending') return null; // 幂等
  const stepConfig = agentConfig.workflow.find(s => (s.step_id || s.name) === currentStepId);
  if (!stepConfig) return null;

  let text = `## Please continue executing this step:\nStep name:\n${stepConfig.name}\nTask:\n${stepConfig.description}`;
  if (currentStepState.context) {
    text += `\n\n## Context from previous steps:\n${asText(currentStepState.context)}`;
  }

  execution.steps[currentStepId] = {
    ...currentStepState,
    status: 'in_progress',
    startedAt: new Date().toISOString(),
  };
  checkpoint.history.push({
    ts: new Date().toISOString(),
    event: 'step_started',
    stage: currentStage,
    executionId: execution.executionId,
    step: currentStepId,
  });
  checkpointManager.saveCheckpoint(checkpoint);
  return text;
}

// 把当前 step 任务追加到用户消息上（首条消息注入场景）
function injectCurrentStep(checkpointID, output) {
  const text = takeCurrentStepText(checkpointID);
  if (text) appendText(output, `\n\n${text}`);
}

// 就地恢复一个 checkpoint 到「真正的断点 step」并绑定到当前 session（一次读、一次写）。
// 恢复后 currentStep 为 pending，由 takeCurrentStepText 取用。
function resumeAgentCheckpointInPlace(sessionID, checkpointID) {
  ensureCheckpointRunning(checkpointID);
  const cp = checkpointManager.getCheckpoint(checkpointID);
  if (!cp) return null;
  const stage = cp.workflow.currentStage;
  const prev = checkpointManager.getCurrentExecution(cp, stage);
  const prevSteps = prev?.steps || null;
  const prevStep = prev?.currentStep || null;
  const agentId = prev?.agentId || stage;
  const ctx = prev?.context || cp.workflow.description || null;

  const exec = checkpointManager.startExecutionOn(cp, stage, sessionID, agentId, ctx);
  const agentCfg = configManager.getAgentConfig(agentId);
  if (agentCfg?.workflow && agentCfg.workflow.length > 0) {
    checkpointManager.initStepsOn(cp, stage, agentCfg.workflow, null);
    if (exec && prevSteps && Object.keys(prevSteps).length > 0) {
      for (const [id, st] of Object.entries(prevSteps)) {
        if (exec.steps[id]) exec.steps[id] = { ...exec.steps[id], ...st };
      }
      exec.currentStep = prevStep;
      if (prevStep && exec.steps[prevStep]) {
        exec.steps[prevStep] = { ...exec.steps[prevStep], status: 'pending', startedAt: null };
      }
    }
  }
  checkpointManager.saveCheckpoint(cp);
  checkpointManager.updateIndexEntry(checkpointID, cp);
  currentCheckpointID = checkpointID;
  return checkpointID;
}

// ============================================
// AET Plugin Export
// ============================================

export const aetPlugin = async ({ client, directory }) => {
  pluginClient = client;
  pluginDirectory = directory;

  // 初始化 CheckpointManager
  checkpointManager = new CheckpointManager(directory);
  // 初始化 WorkflowEngine
  workflowEngine = new WorkflowEngine(configManager, checkpointManager);
  // 初始化 TraceLogger（拦截 globalThis.fetch）
  traceLogger = new TraceLogger(configManager, () => ({
    checkpointID: currentCheckpointID,
    checkpointManager,
  }));
  traceLogger.install();

  return {
    config: async (config) => {
      configManager.reloadConfig(pluginDirectory);

      // Load agent definitions from global install dir, with project fallback
      let agents = await loadAgentDefinitions(getAgentsDir());
      if (Object.keys(agents).length === 0) {
        const projectAgentsDir = getProjectAgentsDir(pluginDirectory);
        agents = await loadAgentDefinitions(projectAgentsDir);
        if (Object.keys(agents).length > 0) {
          console.log(`[AET] Loaded ${Object.keys(agents).length} agents from project directory`);
        }
      }

      const mappedAgents = {};
      agentHandoverAgents.clear();

      const allAgentConfigs = configManager.getAllAgents();
      if (Object.keys(allAgentConfigs).length === 0) {
        console.warn('[AET] No agent configs found in workflow template. Agents will not be registered.');
      }

      for (const [agentId, agentConfig] of Object.entries(allAgentConfigs)) {
        if (typeof agentConfig !== 'object' || agentConfig === null || !agentConfig.name) {
          continue;
        }

        const agentImplName = agentConfig.name;
        const agentImpl = agents[agentImplName];

        if (!agentImpl) {
          console.warn(`[AET] Agent "${agentImplName}" definition not found in agents directory. Skipping.`);
          continue;
        }

        let prompt = agentImpl.prompt;

        const finalPermissions = {
          question: 'allow',
          ...(agentImpl.permission || {}),
        };

        if (finalPermissions.agent_handover === 'allow') {
          agentHandoverAgents.add(agentId);
          finalPermissions.agent_handover = 'deny';
        }

        mappedAgents[agentId] = {
          name: agentId,
          description: agentImpl.description,
          mode: agentImpl.mode || 'primary',
          prompt,
          permission: finalPermissions,
          ...(agentImpl.hidden !== undefined && { hidden: agentImpl.hidden }),
          ...(agentImpl.color && { color: agentImpl.color }),
        };
      }

      config.agent = {
        ...(config.agent || {}),
        ...mappedAgents,
      };
    },

    "command.execute.before": async (input) => {
      // 标记「需要就地接入 checkpoint」的命令（/design、/implement），由 chat.message 首条消息消费
      const agentId = resolveCommandAgent(input?.command);
      if (agentId && input?.sessionID) {
        pendingCheckpointCmd.set(input.sessionID, {
          command: input.command,
          agentId,
          arguments: input.arguments || '',
        });
      }
    },

    "chat.message": async (input, output) => {
      if (input?.sessionID) {
        const sessionID = input.sessionID;
        const sessionAgent = input.agent || null;

        // 命令直入（/design、/implement）：最优先处理，避免被「上一个未清理的 currentCheckpointID」劫持。
        // 不在插件里替模型做决策——把该 agent 的全部可恢复历史记录注入 prompt，由模型自己判断、并最终找用户确认，
        // 然后由模型调用 checkpoint_resume / workflow_start（均在当前会话内就地继续）。
        if (checkpointManager && pendingCheckpointCmd.has(sessionID)) {
          const pending = pendingCheckpointCmd.get(sessionID);
          pendingCheckpointCmd.delete(sessionID);
          const agentId = pending.agentId;
          const agentConfig = configManager.getAgentConfig(agentId);
          const alreadyBound = checkpointManager.findCheckpointBySessionID(sessionID);
          if (!alreadyBound && agentConfig?.workflow && agentConfig.workflow.length > 0) {
            // 把消息钉到命令指定的 agent（覆盖任何残留的 workflow agent）
            if (output?.message) output.message.agent = agentId;
            try {
              const desc = (pending.arguments || '').trim();
              const candidates = listAgentResumableCheckpoints(agentId);
              if (candidates.length === 0) {
                // 无历史：插件直接就地建 checkpoint 并发第一步（确定性，不依赖模型再调工具）
                closeSessionCheckpoint(sessionID);
                startSessionCheckpoint(sessionID);
                const cid = bootstrapAgentCheckpoint(sessionID, agentId, desc);
                if (cid) injectCurrentStep(cid, output);
              } else {
                // 有历史：列出候选，让模型判断 + 找用户确认，再由模型调 checkpoint_resume / workflow_start
                appendText(output, buildCommandEntryPrompt(agentId, desc, candidates));
              }
            } catch (e) {
              console.error('[AET] command checkpoint entry error:', e.message);
            }
            return;
          }
        }

        // 获取 workflow 当前阶段的 agent，有就设置，没有就不设置
        let workflowAgent = null;
        if (checkpointManager && currentCheckpointID) {
          const checkpoint = checkpointManager.getCheckpoint(currentCheckpointID);
          if (checkpoint && checkpoint.workflow.status === 'in_progress') {
            const currentStage = checkpoint.workflow.currentStage;
            const execution = checkpointManager.getCurrentExecution(checkpoint, currentStage);
            workflowAgent = execution?.agentId;
          }
        }

        if (workflowAgent && output?.message) {
          output.message.agent = workflowAgent;
        }

        // 正常处理消息
        closeSessionCheckpoint(sessionID);
        startSessionCheckpoint(sessionID);

        // 检查是否从中断恢复
        let targetCheckpointID = currentCheckpointID;
        if (!targetCheckpointID && checkpointManager) {
          targetCheckpointID = checkpointManager.findCheckpointBySessionID(sessionID);
          if (targetCheckpointID) {
            currentCheckpointID = targetCheckpointID;
          }
        }
        if (targetCheckpointID) {
          ensureCheckpointRunning(targetCheckpointID);
        }

        // 使用路由后的 agent
        const finalAgent = output?.message?.agent || sessionAgent;

        try {
          const msgs = await pluginClient.session.messages({ path: { id: sessionID } });
          const msgCount = msgs.data?.length || 0;

          // 如果是第一条消息且有 active checkpoint，注入当前 step 信息（含上一步 context）
          if (msgCount <= 1 && finalAgent && targetCheckpointID) {
            injectCurrentStep(targetCheckpointID, output);
          }
        } catch (err) {
          console.error('[AET] chat.message error:', err.message);
        }
      }
    },

    event: async ({ event }) => {
      if (event.type === 'message.updated') {
        const { sessionID, info } = event.properties;
        if (info?.role === 'assistant' && info?.error?.name === 'MessageAbortedError') {
          markSessionCheckpointInterrupted(sessionID);
          // 同时标记 workflow checkpoint 为中断
          if (currentCheckpointID && checkpointManager) {
            checkpointManager.interruptCheckpoint(currentCheckpointID, 'User aborted execution');
          }
        }
        return;
      }

      else if (event.type === 'session.status') {
        const { sessionID, status } = event.properties;
        const sessionAgent = resolveSessionAgent(sessionID, null);
        const sessionCheckpoint = getCurrentSessionCheckpoint(sessionID);

        if (status.type === 'idle') {
          if (sessionCheckpoint?.state === SessionCheckpointState.INTERRUPTED) {
            closeSessionCheckpoint(sessionID);
            return;
          }

          // 检查 workflow 是否被中断（文件持久化状态，跨进程有效）
          if (currentCheckpointID && checkpointManager) {
            const checkpoint = checkpointManager.getCheckpoint(currentCheckpointID);
            if (checkpoint?.workflow?.status === 'interrupted') {
              closeSessionCheckpoint(sessionID);
              return;
            }
            // 检查当前 execution 是否被中断
            const execution = checkpointManager.getCurrentExecution(checkpoint, checkpoint.workflow.currentStage);
            if (execution?.status === 'interrupted') {
              closeSessionCheckpoint(sessionID);
              return;
            }
          }

          // 检查是否在 workflow 中执行
          if (currentCheckpointID && checkpointManager) {
            const checkpoint = checkpointManager.getCheckpoint(currentCheckpointID);
            if (checkpoint && checkpoint.workflow.currentStage) {
              const execution = checkpointManager.getCurrentExecution(checkpoint, checkpoint.workflow.currentStage);
              if (execution && execution.sessionID === sessionID) {
                const agentConfig = configManager.getAgentConfig(sessionAgent);
                const hasSteps = agentConfig?.workflow && agentConfig.workflow.length > 0;
                const currentStepInfo = checkpointManager.getCurrentStep(currentCheckpointID, checkpoint.workflow.currentStage);

                // 检查是否还有更多步骤
                const hasMoreSteps = currentStepInfo && agentConfig.workflow.findIndex(s => (s.step_id || s.name) === currentStepInfo.stepId) < agentConfig.workflow.length - 1;

                if (sessionCheckpoint?.state === SessionCheckpointState.RUNNING) {
                  sessionCheckpoint.state = SessionCheckpointState.PENDING_IDLE;
                  const expectedCheckpointID = sessionCheckpoint.checkpointID;
                  if (hasSteps && hasMoreSteps) {
                    void settleStepIdleRun(sessionID, expectedCheckpointID, sessionAgent, agentConfig, currentCheckpointID, checkpoint.workflow.currentStage);
                  } else {
                    // 阶段完成
                    checkpointManager.completeExecution(currentCheckpointID, checkpoint.workflow.currentStage, 'Stage completed');
                    // 获取完整的 stage 配置
                    const stages = workflowEngine.getScenarioWorkflow(checkpoint.workflow.name);
                    const fullStageConfig = stages.find(s => (s.stage_id || s.agent_id) === checkpoint.workflow.currentStage);
                    void settleIdleRun(sessionID, expectedCheckpointID, fullStageConfig || { agent_id: sessionAgent, stage_id: checkpoint.workflow.currentStage }, currentCheckpointID);
                  }
                  return;
                }

                if (sessionCheckpoint?.state === SessionCheckpointState.PENDING_IDLE) {
                  const expectedCheckpointID = sessionCheckpoint.checkpointID;
                  if (await shouldSkipAfterHook(sessionID, expectedCheckpointID)) {
                    closeSessionCheckpoint(sessionID);
                    return;
                  }
                  sessionCheckpoint.state = SessionCheckpointState.COMPLETED;
                  closeSessionCheckpoint(sessionID);
                  if (hasSteps && hasMoreSteps) {
                    await triggerStepAfterHook(sessionID, sessionAgent, agentConfig, currentCheckpointID, checkpoint.workflow.currentStage);
                  } else {
                    // 获取完整的 stage 配置
                    const stages = workflowEngine.getScenarioWorkflow(checkpoint.workflow.name);
                    const fullStageConfig = stages.find(s => (s.stage_id || s.agent_id) === checkpoint.workflow.currentStage);
                    const currentIdx = stages.findIndex(s => (s.stage_id || s.agent_id) === checkpoint.workflow.currentStage);
                    const nextStage = stages[currentIdx + 1];
                    if (!nextStage) {
                      // 最后阶段，直接完成 workflow 并归档
                      checkpointManager.completeCheckpoint(currentCheckpointID);
                      currentCheckpointID = null;
                    } else {
                      await triggerAfterHook(sessionID, fullStageConfig || { agent_id: sessionAgent, stage_id: checkpoint.workflow.currentStage }, currentCheckpointID);
                    }
                  }
                }
                return;
              }
            }
          }

          // 不在 workflow 中，单独 agent 执行
          const agentConfig = configManager.getAgentConfig(sessionAgent);
          if (agentConfig?.workflow && agentConfig.workflow.length > 0) {
            // TODO: 处理单独 agent 的 step workflow
          }

          closeSessionCheckpoint(sessionID);
        }
        else if (status.type === 'busy') {
          if (sessionCheckpoint?.state === SessionCheckpointState.PENDING_IDLE) {
            sessionCheckpoint.state = SessionCheckpointState.RUNNING;
          }
        }
      }
    },

    // Workflow and status tools
    tool: {
      workflow_list: tool({
        description: 'List all available scenarios',
        args: {},
        async execute(args, context) {
          const scenarios = configManager.getScenarios();

          let lines = [
            '',
            '┌─────────────────────────────────────────────────────────────────────────────────────┐',
            '│                        Available Scenarios                                          │',
            '├─────────────────────────────────────────────────────────────────────────────────────┤',
          ];

          for (const [name, workflow] of Object.entries(scenarios)) {
            const desc = workflow.description || '';
            const agentWorkflow = workflow.workflow || [];
            const agents_list = agentWorkflow.map(s => s.agent_id).join(' → ');
            lines.push(`│  ${name.padEnd(12)} │ ${desc.padEnd(40)} │ ${agents_list.padEnd(25)} │`);
          }

          lines.push('└─────────────────────────────────────────────────────────────────────────────────────┘');
          lines.push('');
          lines.push('Use workflow_start({ name: "..." }) to start a capability scenario');
          lines.push('');

          return lines.join('\n');
        },
      }),

      checkpoint_list_active: tool({
        description: '查询当前正在执行和可恢复的任务状态。可选 scope 过滤："scenario"（仅 workflow_start 起的多阶段场景）、"agent"（仅单 agent 直入任务）、"all"（默认，全部）。',
        args: {
          scope: tool.schema.enum(['all', 'scenario', 'agent']).optional().describe('过滤范围："scenario" / "agent" / "all"（默认）'),
        },
        async execute(args, context) {
          if (!checkpointManager) {
            return JSON.stringify({ error: 'CheckpointManager not initialized' }, null, 2);
          }
          const index = checkpointManager.loadIndex();
          const scope = args.scope || 'all';
          if (scope === 'all') {
            return JSON.stringify(index, null, 2);
          }
          // workflow.name 是 scenario 名 → 场景类；否则（= agentId）→ 单 agent 直入任务
          const isScenario = (name) => !!workflowEngine.getScenarioConfig(name);
          const keep = (e) => scope === 'scenario' ? isScenario(e.workflow) : !isScenario(e.workflow);
          const filtered = {
            ...index,
            active: (index.active || []).filter(keep),
            interrupted: (index.interrupted || []).filter(keep),
            recentCompleted: (index.recentCompleted || []).filter(keep),
          };
          return JSON.stringify(filtered, null, 2);
        },
      }),

      workflow_start: tool({
        description: 'Start a capability scenario OR a single agent\'s task. `name` can be a scenario (e.g. "feature") or an agent with steps (e.g. "aet-design"). If the current session agent equals the target agent, it runs IN THE CURRENT session (and returns the first step to execute); otherwise a new session is created. Example: workflow_start({ name: "feature", context: "..." }) or workflow_start({ name: "aet-design", context: "..." })',
        args: {
          name: tool.schema.string().min(1).describe('Required. Scenario name, or an agent id that has steps.'),
          context: tool.schema.any().describe('Required. Task/context for the (first) stage agent. String or object (objects are serialized). Can include newlines.'),
        },
        async execute(args, context) {
          const { name } = args;
          // context 可能是字符串或对象（对象序列化为字符串）
          const rawDesc = args.context;
          const desc = typeof rawDesc === 'string' ? rawDesc : (rawDesc != null ? JSON.stringify(rawDesc) : '');
          if (!name || name.trim().length === 0) {
            return JSON.stringify({ success: false, error: 'name is required' }, null, 2);
          }
          if (!desc || desc.trim().length === 0) {
            return JSON.stringify({ success: false, error: 'context is required' }, null, 2);
          }

          // name 解析为 scenario 或单 agent
          const scenario = workflowEngine.getScenarioConfig(name);
          const isScenario = !!scenario;
          const agentCfg = isScenario ? null : configManager.getAgentConfig(name);
          if (!isScenario && (!agentCfg?.workflow || agentCfg.workflow.length === 0)) {
            return JSON.stringify({ success: false, error: `"${name}" is not a scenario, nor an agent with steps` }, null, 2);
          }

          // 目标首阶段及其 agent
          let firstStage = null;
          let targetAgent;
          if (isScenario) {
            const stages = workflowEngine.getScenarioWorkflow(name);
            if (!stages || stages.length === 0) {
              return JSON.stringify({ success: false, error: 'Scenario has no stages' }, null, 2);
            }
            firstStage = stages[0];
            targetAgent = firstStage.agent_id;
          } else {
            targetAgent = name;
          }

          const sessionID = context?.sessionID;
          // 单 agent 且当前会话 agent 与目标一致 → 就地复用当前会话；否则新建 session
          const inPlace = !isScenario && sessionID && context?.agent === targetAgent;

          if (inPlace) {
            const checkpointID = bootstrapAgentCheckpoint(sessionID, targetAgent, desc);
            startSessionCheckpoint(sessionID);
            const instruction = takeCurrentStepText(checkpointID);
            return JSON.stringify({ success: true, mode: 'in-place', checkpointID, agentId: targetAgent, instruction }, null, 2);
          }

          // 新建 session：scenario 起首阶段，或单 agent（调用方 agent 与目标不一致）
          const checkpointID = checkpointManager.createCheckpoint(name, desc);
          currentCheckpointID = checkpointID;
          const stageToStart = isScenario ? firstStage : { agent_id: targetAgent, stage_id: targetAgent };
          await executeStageHandover(stageToStart, desc, checkpointID);
          return JSON.stringify({ success: true, mode: 'new-session', checkpointID, stage: stageToStart.stage_id || stageToStart.agent_id }, null, 2);
        },
      }),

      checkpoint_resume: tool({
        description: '恢复指定的 workflow checkpoint',
        args: {
          checkpointID: tool.schema.string().optional().describe('要恢复的 checkpoint ID'),
          stage: tool.schema.string().optional().describe('恢复到指定阶段（可选）'),
          step: tool.schema.string().optional().describe('恢复到指定步骤（可选）'),
        },
        async execute(args, context) {
          if (!checkpointManager) {
            return JSON.stringify({ success: false, error: 'CheckpointManager not initialized' }, null, 2);
          }

          // 如果没有指定 checkpointID，尝试从 interrupted 列表中找最新的
          let targetCheckpointID = args.checkpointID;
          if (!targetCheckpointID) {
            const index = checkpointManager.loadIndex();
            if (index.interrupted.length > 0) {
              targetCheckpointID = index.interrupted[0].checkpointID;
            } else if (index.active.length > 0) {
              targetCheckpointID = index.active[0].checkpointID;
            }
          }

          if (!targetCheckpointID) {
            return JSON.stringify({ success: false, error: 'No checkpoint to resume' }, null, 2);
          }

          const checkpoint = checkpointManager.getCheckpoint(targetCheckpointID);
          if (!checkpoint) {
            return JSON.stringify({ success: false, error: `Checkpoint ${targetCheckpointID} not found` }, null, 2);
          }

          if (checkpoint.workflow.status === 'completed') {
            return JSON.stringify({ success: false, error: 'Checkpoint already completed' }, null, 2);
          }

          const targetStage = args.stage || checkpoint.workflow.currentStage;
          const execution = checkpointManager.getCurrentExecution(checkpoint, targetStage);
          const targetAgent = execution?.agentId || targetStage;

          // 当前会话 agent 与 checkpoint 目标 agent 一致 → 就地恢复，复用当前 session（命令直入场景）
          if (context?.sessionID && context?.agent && context.agent === targetAgent) {
            resumeAgentCheckpointInPlace(context.sessionID, targetCheckpointID);
            startSessionCheckpoint(context.sessionID);
            const instruction = takeCurrentStepText(targetCheckpointID);
            const cp = checkpointManager.getCheckpoint(targetCheckpointID);
            const ex = checkpointManager.getCurrentExecution(cp, cp.workflow.currentStage);
            return JSON.stringify({
              success: true,
              mode: 'in-place',
              checkpointID: targetCheckpointID,
              stage: cp.workflow.currentStage,
              step: ex?.currentStep || null,
              instruction,
            }, null, 2);
          }

          // 否则新建 session 恢复（router 等：当前会话 agent 与目标不一致）
          currentCheckpointID = targetCheckpointID;
          checkpointManager.updateCheckpoint(targetCheckpointID, {
            interruptedAt: null,
            workflow: { status: 'in_progress' },
          });
          const resumePrompt = checkpointManager.getResumePrompt(targetCheckpointID, args.stage, args.step);
          const originalContext = execution?.context;

          if (execution) {
            await executeStageHandover(
              { agent_id: execution.agentId, stage_id: targetStage },
              originalContext,
              targetCheckpointID,
              resumePrompt
            );
          } else {
            const stages = workflowEngine.getScenarioWorkflow(checkpoint.workflow.name);
            const stageConfig = stages.find(s => (s.stage_id || s.agent_id) === targetStage);
            if (stageConfig) {
              await executeStageHandover(stageConfig, originalContext, targetCheckpointID, resumePrompt);
            }
          }

          return JSON.stringify({
            success: true,
            mode: 'new-session',
            checkpointID: targetCheckpointID,
            stage: targetStage,
            step: args.step || checkpointManager.getCurrentStepId(checkpoint),
          }, null, 2);
        },
      }),

      agent_handover: tool({
        description: 'Advance to the next agent stage, or jump to a specific stage. Example: agent_handover({ context: "Summary: completed design.\nNext: implement the feature based on design." }) or agent_handover({ context: "...", stage: "aet-implement" })',
        args: {
          context: tool.schema.string().min(1).describe('Required. Summary of current stage + task for next stage.'),
          stage: tool.schema.string().optional().describe('Optional. Target stage_id/agent_id to jump to (instead of the immediate next stage). Defaults to the next stage.'),
        },
        async execute(args, context) {
          const { context: ctx } = args;
          if (!ctx || ctx.trim().length === 0) {
            return JSON.stringify({
              success: false,
              error: 'context is required. Please provide: 1) Summary of current stage work. 2) Task for next stage.'
            }, null, 2);
          }

          if (!currentCheckpointID || !checkpointManager) {
            return JSON.stringify({ success: false, error: 'No active workflow' }, null, 2);
          }

          // 如果是从中断恢复，清除中断状态
          ensureCheckpointRunning(currentCheckpointID);

          const checkpoint = checkpointManager.getCheckpoint(currentCheckpointID);
          if (!checkpoint) {
            return JSON.stringify({ success: false, error: 'No active checkpoint' }, null, 2);
          }

          // 标记当前阶段完成
          if (checkpoint.workflow.currentStage) {
            checkpointManager.completeExecution(currentCheckpointID, checkpoint.workflow.currentStage, ctx);
          }

          // 确定目标阶段：指定 stage 则跳转，否则取下一阶段
          const stages = workflowEngine.getScenarioWorkflow(checkpoint.workflow.name);
          let nextStage;
          if (args.stage) {
            nextStage = stages.find(s => (s.stage_id || s.agent_id) === args.stage);
            if (!nextStage) {
              const avail = stages.map(s => s.stage_id || s.agent_id).join(', ') || '(none)';
              return JSON.stringify({ success: false, error: `stage "${args.stage}" not found. Available: ${avail}` }, null, 2);
            }
          } else {
            const currentIdx = stages.findIndex(s => (s.stage_id || s.agent_id) === checkpoint.workflow.currentStage);
            nextStage = stages[currentIdx + 1];
          }

          if (!nextStage) {
            // Workflow 完成
            checkpointManager.completeCheckpoint(currentCheckpointID);
            currentCheckpointID = null;
            return JSON.stringify({ success: true, done: true, message: 'Workflow completed' }, null, 2);
          }

          await executeStageHandover(nextStage, ctx, currentCheckpointID);

          return JSON.stringify({ success: true, stage: nextStage.stage_id || nextStage.agent_id }, null, 2);
        },
      }),

      step_handover: tool({
        description: 'Hand over to the next step within the current agent, or jump to a specific step. Examples: step_handover({ context: "Completed analysis." }) | step_handover({ context: "...", step: "development_plan" }) | step_handover({ context: "Skipped optional step." })\n\n⚠️ WARNING: The `end` parameter TERMINATES THE ENTIRE WORKFLOW — all remaining steps and stages are permanently skipped, the checkpoint is archived, and the workflow cannot be resumed. ONLY use `end=true` when the user has EXPLICITLY and CLEARLY requested to abort/terminate the whole workflow. NEVER use it just to finish a step or mark a step as complete — use `step_handover({ context: "..." })` without `end` for that.',
        args: {
          context: tool.schema.string().min(1).describe('Required. Summary of current step work to pass to the next step, or final summary when ending early.'),
          step: tool.schema.string().optional().describe('Optional. Target step_id to jump to (forward to skip steps, or backward to redo). Defaults to the next step. Ignored when end=true.'),
          end: tool.schema.boolean().optional().describe('⚠️ DANGER — DO NOT use unless the user explicitly requests to terminate the ENTIRE workflow. This ends ALL remaining steps/stages permanently (skipped & archived, no resume). For completing a single step, just omit this parameter. Confusing "finish a step" with "end the workflow" is the #1 misuse of this parameter.'),
        },
        async execute(args, context) {
          const { context: ctx, end } = args;
          if (!ctx || ctx.trim().length === 0) {
            return JSON.stringify({
              success: false,
              error: 'context is required. Please provide a summary of the current step work.'
            }, null, 2);
          }

          if (!currentCheckpointID || !checkpointManager) {
            return JSON.stringify({ success: false, error: 'No active workflow' }, null, 2);
          }

          // 如果是从中断恢复，清除中断状态
          ensureCheckpointRunning(currentCheckpointID);

          const sessionID = context.sessionID;
          const sessionAgent = resolveSessionAgent(sessionID, null);

          const checkpoint = checkpointManager.getCheckpoint(currentCheckpointID);
          if (!checkpoint || !checkpoint.workflow.currentStage) {
            return JSON.stringify({ success: false, error: 'No active stage' }, null, 2);
          }

          const agentConfig = configManager.getAgentConfig(sessionAgent);
          if (!agentConfig?.workflow || agentConfig.workflow.length === 0) {
            return JSON.stringify({ success: false, error: 'Current agent has no steps configured' }, null, 2);
          }

          let handoverContext = {};
          try {
            handoverContext = JSON.parse(ctx);
          } catch {
            handoverContext = { summary: ctx };
          }

          // 提前结束工作流
          if (end) {
            checkpointManager.completeExecution(currentCheckpointID, checkpoint.workflow.currentStage, ctx);
            checkpointManager.skipRemainingSteps(currentCheckpointID, checkpoint.workflow.currentStage);
            checkpointManager.completeCheckpoint(currentCheckpointID);
            currentCheckpointID = null;
            return JSON.stringify({
              success: true,
              done: true,
              endedEarly: true,
              message: 'Workflow ended early. Remaining steps skipped and checkpoint archived.',
            }, null, 2);
          }

          // 校验跳转目标 step 存在
          if (args.step) {
            const exists = agentConfig.workflow.some(s => (s.step_id || s.name) === args.step);
            if (!exists) {
              const avail = agentConfig.workflow.map(s => s.step_id || s.name).join(', ');
              return JSON.stringify({ success: false, error: `step "${args.step}" not found. Available: ${avail}` }, null, 2);
            }
          }

          await advanceToNextStep(sessionID, sessionAgent, agentConfig, currentCheckpointID, checkpoint.workflow.currentStage, handoverContext, args.step || null);

          const currentStepInfo = checkpointManager.getCurrentStep(currentCheckpointID, checkpoint.workflow.currentStage);
          if (!currentStepInfo) {
            return JSON.stringify({
              success: true,
              done: true,
              message: 'All steps completed'
            }, null, 2);
          }

          return JSON.stringify({ success: true }, null, 2);
        },
      }),
      trace_enable: tool({
        description: 'Enable LLM request/response trace logging. Sets trace.enabled=true in ~/.aet/config.json. All future LLM calls will be recorded to ~/.aet/log/trace/',
        args: {},
        async execute(args, context) {
          const globalConfigPath = path.join(os.homedir(), '.aet', 'config.json');
          try {
            let config = {};
            if (fs.existsSync(globalConfigPath)) {
              config = JSON.parse(fs.readFileSync(globalConfigPath, 'utf8'));
            }
            config.trace = config.trace || {};
            config.trace.enabled = true;
            fs.mkdirSync(path.dirname(globalConfigPath), { recursive: true });
            fs.writeFileSync(globalConfigPath, JSON.stringify(config, null, 2));
            // Invalidate cached global config so next check picks up the change
            configManager.invalidateGlobalConfig();
            return JSON.stringify({
              success: true,
              enabled: true,
              traceDir: TRACE_DIR,
              message: 'Trace logging enabled. LLM calls will be recorded to ~/.aet/log/trace/',
            }, null, 2);
          } catch (err) {
            return JSON.stringify({
              success: false,
              error: `Failed to update global config: ${err.message}`,
            }, null, 2);
          }
        },
      }),
      trace_disable: tool({
        description: 'Disable LLM request/response trace logging. Sets trace.enabled=false in ~/.aet/config.json. No new LLM calls will be recorded.',
        args: {},
        async execute(args, context) {
          const globalConfigPath = path.join(os.homedir(), '.aet', 'config.json');
          try {
            let config = {};
            if (fs.existsSync(globalConfigPath)) {
              config = JSON.parse(fs.readFileSync(globalConfigPath, 'utf8'));
            }
            config.trace = config.trace || {};
            config.trace.enabled = false;
            fs.mkdirSync(path.dirname(globalConfigPath), { recursive: true });
            fs.writeFileSync(globalConfigPath, JSON.stringify(config, null, 2));
            // Invalidate cached global config so next check picks up the change
            configManager.invalidateGlobalConfig();
            return JSON.stringify({
              success: true,
              enabled: false,
              message: 'Trace logging disabled. No new LLM calls will be recorded.',
            }, null, 2);
          } catch (err) {
            return JSON.stringify({
              success: false,
              error: `Failed to update global config: ${err.message}`,
            }, null, 2);
          }
        },
      }),
      trace_status: tool({
        description: 'Check the current trace logging status. Shows whether trace is enabled/disabled and the trace directory location.',
        args: {},
        async execute(args, context) {
          const enabled = configManager.isTraceEnabled();
          const globalConfig = configManager.getGlobalConfig();
          const traceDirExists = fs.existsSync(TRACE_DIR);
          let sessionCount = 0;
          if (traceDirExists) {
            try {
              const entries = fs.readdirSync(TRACE_DIR);
              sessionCount = entries.filter(e => e.startsWith('ses_') && fs.statSync(path.join(TRACE_DIR, e)).isDirectory()).length;
            } catch { /* ignore */ }
          }
          return JSON.stringify({
            enabled,
            traceDir: TRACE_DIR,
            traceDirExists,
            recordedSessions: sessionCount,
            globalConfigTrace: globalConfig?.trace || null,
          }, null, 2);
        },
      }),
    },

    "experimental.chat.system.transform": async (input, output) => {
      const config = configManager.config;
      
      const enabled = config.projectAnalysis?.enabled !== false;
      
      if (!enabled) {
        return;
      }
      
      const hasProjectAnalysis = detectProjectAnalysisFolder(pluginDirectory);
      
      if (!hasProjectAnalysis) {
        return;
      }
      
      const projectAnalysisContent = formatProjectAnalysis(pluginDirectory);
      
      if (!projectAnalysisContent) {
        return;
      }
      
      output.system.push(projectAnalysisContent);

      // Automation mode directive injection (only when the active scenario
      // has automation=true). Real-time query — never cached, so resume
      // after workflow.json edits picks up the new value.
      const cp = currentCheckpointID ? checkpointManager.getCheckpoint(currentCheckpointID) : null;
      if (cp?.workflow?.name) {
        const scenario = configManager.getScenarioConfig(cp.workflow.name);
        if (scenario?.automation === true) {
          output.system.push(
            `<aet-run-mode>automation</aet-run-mode>
<aet-run-mode-directive>
本会话处于自动化模式。禁止调用 question 工具向用户提问。
- 凡需用户决策处：选 SKILL.md 中已声明的推荐项；若无明确推荐项，结合上下文（需求描述 / 代码库 / 已有交付物）推断最合理选项，并在交付物末尾「## 自动化决策记录」节追加一行：- 决策点：<交互点名称> | 推断选项：<选项> | 推断依据：<依据摘要>
- 凡标注为可选 review 的阶段（如 [S3] / [A4]）：直接跳过，不进入 review 流程
- 不影响必经的验证类门禁（lint / test / build）：仍需全部通过
</aet-run-mode-directive>`
          );
        }
      }
    },
  };
};

