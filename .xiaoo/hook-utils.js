/**
 * AET xiaoO Hook Utilities
 *
 * Shared utilities for Chat/Session hooks.
 * 命令文件加载由 xiaoO 自身处理（payload.body 已是模板展开后的内容），
 * 本文件仅提供 checkpoint/workflow 操作和基础 IO 工具。
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const AET_ROOT = path.join(os.homedir(), '.xiaoo', 'aet');
const lib = (name) => require(path.join(AET_ROOT, '.platform/utils', name));
const { StateStore } = require('./state-store');

/**
 * 确认提示模板（统一管理，避免硬编码重复）
 * - step before=confirm: 开始执行 step 前需用户确认
 * - step after=confirm: step 完成后需用户确认
 * - stage after=confirm: stage 完成后需用户确认进入下一阶段
 */
const confirmPrompt = {
  stepBefore: (stepName) =>
    `即将执行的 Step: **${stepName}**\n\n**If user approves, please call step_handover to continue.**`,
  stepAfter: (stepName, nextStepName) =>
    `Step **${stepName}** completed.\n\n` +
    (nextStepName
      ? `**If user approves, please call step_handover to advance to the next step: ${nextStepName}. Do NOT call agent_handover.**`
      : `**If user approves, please call step_handover to complete the current stage. Do NOT call agent_handover.**`),
  stepAfterSuffix: (nextStepName) =>
    nextStepName
      ? `\n\nNext Step: **${nextStepName}**\n\n**If user approves, please call step_handover to advance to the next step. Do NOT call agent_handover.**`
      : `\n\n**If user approves, please call step_handover to complete the current stage. Do NOT call agent_handover.**`,
  stageAfter: (stageName, nextAgentId) =>
    `Stage **${stageName}** completed.\n\n**If user approves, please call agent_handover to advance to the next stage.**\n- target_agent: "${nextAgentId}"\n- context: "Continue workflow"`,
  resumeInstruction: (agentId) =>
    `请按以下步骤处理，在用户确认之前不要开始执行任何步骤：\n`
    + `1. 对照「本次任务」，判断它是否是上述某条任务的延续。\n`
    + `2. 用 question 工具向用户确认：是恢复其中某一条（指出编号/描述），还是作为新任务开始。\n`
    + `3. 根据用户选择执行（均在当前会话内继续，不会另开会话）：\n`
    + `   - 恢复：调用 checkpoint_resume({ checkpoint_id: "用户确认的ID" })，从其当前步骤继续；\n`
    + `   - 新任务：调用 workflow_start({ name: "${agentId}", context: "本次任务描述" })，从第一步开始。`,
};

/**
 * 生成 step 执行指令（统一入口，含 per-step 完成指令）
 */
function formatStepPrompt(stepConfig, context) {
  let text = `## Please continue executing this step:\nStep name:\n${stepConfig.name}\nTask:\n${stepConfig.description}`;
  text += '\n\n## Constraint\n- Do NOT mention the next step, next phase, or any confirmation wording in your output.\n- Upon completion, provide a brief summary and terminate immediately.\n- The system will automatically handle step transitions and confirmation prompts.';
  return text;
}

// 命令名 → 对应 agent（约定映射，与 commands/*.md frontmatter agent: 字段一致）
const COMMAND_AGENT_MAP = {
  '/aet-auto': 'aet-router',
  '/aet-init': null,
  '/aet-design': 'aet-design',
  '/aet-implement': 'aet-implement',
  '/aet-bugfix': 'aet-bugfix',
  '/aet-doc': 'aet-doc',
  '/aet-prd': 'aet-prd',
  '/aet-release': 'aet-release',
  '/aet-pr': null,
  '/aet-issue': null,
};

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

function readPayload() {
  try {
    return JSON.parse(fs.readFileSync('/dev/stdin', 'utf-8'));
  } catch (e) {
    return null;
  }
}

function writeResult(result) {
  process.stdout.write(JSON.stringify(result) + '\n');
}

function asText(val) {
  if (val == null) return '';
  if (typeof val === 'string') return val;
  try { return JSON.stringify(val, null, 2); } catch (_) { return String(val); }
}

/**
 * 判断是否是 AET 命令，返回对应 agentId
 * xiaoO 的 command_before payload.command 格式如 "aet-auto"（无 / 前缀）
 */
function isAETCommand(commandName) {
  const normalized = commandName.startsWith('/') ? commandName : `/${commandName}`;
  return COMMAND_AGENT_MAP[normalized] !== undefined
    ? { command: normalized, agentId: COMMAND_AGENT_MAP[normalized] }
    : null;
}

/**
 * pending→in_progress 转换（与 opencode takeCurrentStepText 对齐）
 */
function transitionStepToInProgress(checkpointManager, checkpoint, currentStage, stepId) {
  const execution = checkpointManager.getCurrentExecution(checkpoint, currentStage);
  if (!execution || !execution.steps[stepId]) return;
  const stepState = execution.steps[stepId];
  if (stepState.status !== 'pending') return;
  // If step context is null, inject from execution context (for first step of new stage)
  const stepContext = stepState.context || execution.context || null;
  execution.steps[stepId] = {
    ...stepState,
    status: 'in_progress',
    startedAt: new Date().toISOString(),
    context: stepContext,
  };
  checkpoint.history.push({
    ts: new Date().toISOString(),
    event: 'step_started',
    stage: currentStage,
    executionId: execution.executionId,
    step: stepId,
  });
  checkpointManager.saveCheckpoint(checkpoint);
}

/**
 * 启动工作流并返回首步骤指令（与 opencode bootstrapAgentCheckpoint + takeCurrentStepText 对齐）
 */
function startWorkflowAndGetStepInstruction(projectRoot, agentId, context, sessionID) {
  const { ConfigManager } = lib('config-manager');
  const configManager = new ConfigManager();
  configManager.reloadConfig(projectRoot);
  const { CheckpointManager } = lib('checkpoint-manager');
  const checkpointManager = new CheckpointManager(projectRoot);
  const { WorkflowEngine } = lib('workflow-engine');
  const workflowEngine = new WorkflowEngine(configManager, checkpointManager);
  const stateStore = new StateStore(projectRoot);

  const result = workflowEngine.startScenario(agentId, context);
  if (!result.success) {
    return { error: result.error, checkpointID: null, instruction: null };
  }

  const firstStage = result.firstStage;
  const stageAgentId = firstStage?.agent_id || firstStage?.stage_id || agentId;
  const checkpointID = result.checkpointID;

  // 创建 execution（与 bootstrapAgentCheckpoint 对齐）
  // xiaoO 中 message-received 直接注入首步指令，LLM 不会先调 agent_handover，
  // 必须在此处创建 execution，否则 idle handler 找不到 execution，流程无法推进。
  // startExecution 内部会设置 checkpoint.workflow.currentStage = stage。
  checkpointManager.startExecution(
    checkpointID,
    stageAgentId,
    sessionID || `aet-${stageAgentId}-${Date.now()}`,
    stageAgentId,
    context || null
  );

  const agentConfig = configManager.getAgentConfig(stageAgentId);

  let stepInstruction = null;
  if (agentConfig?.workflow?.length > 0) {
    checkpointManager.initSteps(checkpointID, stageAgentId, agentConfig.workflow);

    const firstStep = agentConfig.workflow[0];
    const firstStepId = firstStep.step_id || firstStep.name;
    const before = firstStep.before || null;

    if (before === 'confirm') {
      stepInstruction = confirmPrompt.stepBefore(firstStep.name);
    } else {
      stepInstruction = formatStepPrompt(firstStep, context);
    }

    // 首步 pending → in_progress + step_started 事件（与 bootstrapAgentCheckpoint 对齐）
    const cp = checkpointManager.getCheckpoint(checkpointID);
    const cpExecution = checkpointManager.getCurrentExecution(cp, stageAgentId);
    if (cpExecution && cpExecution.steps[firstStepId]?.status === 'pending') {
      const now = new Date().toISOString();
      const stepCtx = cpExecution.steps[firstStepId].context || cpExecution.context || null;
      cpExecution.steps[firstStepId] = {
        ...cpExecution.steps[firstStepId],
        status: 'in_progress',
        startedAt: now,
        context: stepCtx,
      };
      cp.history.push({
        ts: now,
        event: 'step_started',
        stage: stageAgentId,
        executionId: cpExecution.executionId,
        step: firstStepId,
      });
      checkpointManager.saveCheckpoint(cp);
    }
  } else {
    stepInstruction = context ? `## Context:\n${asText(context)}` : null;
  }

  stateStore.setCurrentCheckpointID(projectRoot, checkpointID);

  return {
    error: null,
    checkpointID,
    instruction: stepInstruction,
    agentId: stageAgentId,
  };
}

/**
 * Bootstrap a single agent checkpoint (for /design, /implement commands)
 * 与 opencode bootstrapAgentCheckpoint 对齐
 */
function bootstrapAgentCheckpoint(projectRoot, agentId, description, sessionID) {
  const { ConfigManager } = lib('config-manager');
  const configManager = new ConfigManager();
  configManager.reloadConfig(projectRoot);
  const { CheckpointManager } = lib('checkpoint-manager');
  const checkpointManager = new CheckpointManager(projectRoot);
  const stateStore = new StateStore(projectRoot);

  const agentConfig = configManager.getAgentConfig(agentId);
  if (!agentConfig?.workflow || agentConfig.workflow.length === 0) return null;

  const checkpointID = checkpointManager.createCheckpoint(agentId, description || `Direct ${agentId} session`);
  checkpointManager.startExecution(checkpointID, agentId, sessionID || `aet-${agentId}-${Date.now()}`, agentId, description || null);

  if (agentConfig.workflow && agentConfig.workflow.length > 0) {
    checkpointManager.initSteps(checkpointID, agentId, agentConfig.workflow, null);

    // 首步 pending → in_progress + 设置 startedAt（与 agent_handover.js 对齐）
    const cp = checkpointManager.getCheckpoint(checkpointID);
    const cpExecution = checkpointManager.getCurrentExecution(cp, agentId);
    const firstStepId = agentConfig.workflow[0].step_id || agentConfig.workflow[0].name;
    if (cpExecution && cpExecution.steps[firstStepId]?.status === 'pending') {
      const now = new Date().toISOString();
      const stepCtx = cpExecution.steps[firstStepId].context || cpExecution.context || null;
      cpExecution.steps[firstStepId] = {
        ...cpExecution.steps[firstStepId],
        status: 'in_progress',
        startedAt: now,
        context: stepCtx,
      };
      cp.history.push({
        ts: now,
        event: 'step_started',
        stage: agentId,
        executionId: cpExecution.executionId,
        step: firstStepId,
      });
      checkpointManager.saveCheckpoint(cp);
    }
  }

  stateStore.setCurrentCheckpointID(projectRoot, checkpointID);
  return checkpointID;
}

/**
 * List resumable checkpoints for a specific agent
 * 与 opencode listAgentResumableCheckpoints 对齐
 */
function listAgentResumableCheckpoints(projectRoot, agentId) {
  const { CheckpointManager } = lib('checkpoint-manager');
  const checkpointManager = new CheckpointManager(projectRoot);
  return checkpointManager.getResumableCheckpoints()
    .map(e => checkpointManager.getCheckpoint(e.checkpointID))
    .filter(cp => cp && cp.workflow.status !== 'completed' && (
      // 单 agent workflow: workflow.name === agentId
      cp.workflow.name === agentId ||
      // scenario workflow: workflow.name 是 scenario 名，currentStage 是目标 agent
      cp.workflow.currentStage === agentId ||
      // scenario: 如 feature/bugfix 等
      cp.workflow.name === 'feature' || cp.workflow.name === 'bugfix'
    ))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

/**
 * Build command entry prompt with resumable candidates
 * 与 opencode buildCommandEntryPrompt 对齐
 */
function buildCommandEntryPrompt(agentId, desc, candidates) {
  const { CheckpointManager } = lib('checkpoint-manager');
  const projectRoot = resolveProjectRoot();
  if (!projectRoot) {
    return `\n\n## 本次任务\n${desc || '(无描述)'}\n`;
  }
  const checkpointManager = new CheckpointManager(projectRoot);
  let p = `\n\n## 本次任务\n${desc || '(无描述)'}\n\n`;
  const list = candidates.map((cp, i) => {
    const ex = checkpointManager.getCurrentExecution(cp, cp.workflow.currentStage);
    return `${i + 1}. checkpointID=${cp.workflow.checkpointID}\n   当前步骤: ${ex?.currentStep || '—'}\n   更新于: ${cp.updatedAt}\n   描述: ${cp.workflow.description || '(无)'}`;
  }).join('\n');
  p += `## 该 agent 可恢复的历史任务（共 ${candidates.length} 个）\n${list}\n\n`
    + confirmPrompt.resumeInstruction(agentId);
  return p;
}

/**
 * Build resumable command text with checkpoint candidates
 * 用于 scenario 中断 checkpoint 和 aet-router 可恢复 checkpoint 两条路径
 * @param {string} command - 命令名
 * @param {string} arguments_ - 用户参数
 * @param {Array} candidates - checkpoint 索引条目（来自 loadIndex / getResumableCheckpoints）
 * @param {object} cm - CheckpointManager 实例
 * @param {string} sectionTitle - 候选列表标题（如 "发现中断的工作流"、"发现可恢复的工作流"）
 * @param {string} agentId - 目标 agent ID
 */
function buildResumableCommandText(command, arguments_, candidates, cm, sectionTitle, agentId) {
  let text = `<aet-command>\n**Command**: ${command}`;
  if (arguments_) text += `\n**Arguments**: ${arguments_}`;
  text += `\n\n## 本次任务\n${arguments_ || '(无描述)'}`;
  text += `\n\n## ${sectionTitle}（共 ${candidates.length} 个）\n`;
  for (let i = 0; i < candidates.length; i++) {
    const e = candidates[i];
    const cp = cm.getCheckpoint(e.checkpointID);
    const execution = cp ? cm.getCurrentExecution(cp, cp.workflow.currentStage) : null;
    text += `${i + 1}. checkpointID=${e.checkpointID}\n   当前步骤: ${execution?.currentStep || '—'}\n   更新于: ${e.updatedAt || cp?.updatedAt}\n   描述: ${cp?.workflow?.description || '(无)'}`;
  }
  text += `\n\n${confirmPrompt.resumeInstruction(agentId)}`;
  text += `\n</aet-command>`;
  return text;
}

/**
 * Take current step text (pending→in_progress, return instruction)
 * 与 opencode takeCurrentStepText 对齐
 */
function takeCurrentStepText(projectRoot, checkpointID) {
  const { CheckpointManager } = lib('checkpoint-manager');
  const checkpointManager = new CheckpointManager(projectRoot);
  const checkpoint = checkpointManager.getCheckpoint(checkpointID);
  if (!checkpoint) return null;

  const currentStage = checkpoint.workflow?.currentStage;
  const execution = checkpointManager.getCurrentExecution(checkpoint, currentStage);
  if (!execution) return null;

  const { ConfigManager } = lib('config-manager');
  const configManager = new ConfigManager();
  configManager.reloadConfig(projectRoot);
  const agentConfig = configManager.getAgentConfig(execution.agentId);

  if (!agentConfig?.workflow || agentConfig.workflow.length === 0) {
    return execution.context ? `## Context from previous stage:\n${asText(execution.context)}` : null;
  }

  const currentStepId = execution.currentStep;
  const currentStepState = currentStepId ? execution.steps[currentStepId] : null;
  // 首步 initSteps 后可能已是 in_progress，仍需返回 step instruction
  if (!currentStepState || currentStepState.status === 'completed') return null;

  const stepConfig = agentConfig.workflow.find(s => (s.step_id || s.name) === currentStepId);
  if (!stepConfig) return null;

  let text = `## Please continue executing this step:\nStep name:\n${stepConfig.name}\nTask:\n${stepConfig.description}`;

  // 仅 pending → in_progress 需转换；in_progress 说明已在执行，直接返回 instruction
  if (currentStepState.status === 'pending') {
    transitionStepToInProgress(checkpointManager, checkpoint, currentStage, currentStepId);
  }
  return text;
}

/**
 * Ensure checkpoint is running (recover from interrupted state)
 * 与 opencode ensureCheckpointRunning 对齐
 */
function ensureCheckpointRunning(projectRoot, checkpointID) {
  if (!checkpointID) return;
  const { CheckpointManager } = lib('checkpoint-manager');
  const checkpointManager = new CheckpointManager(projectRoot);
  const checkpoint = checkpointManager.getCheckpoint(checkpointID);
  if (!checkpoint) return;

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
              ...stepState, status: 'pending', startedAt: null,
            };
          }
        }
      }
    }

    checkpoint.history.push({ ts: new Date().toISOString(), event: 'workflow_resumed' });
    checkpointManager.saveCheckpoint(checkpoint);
    checkpointManager.updateIndexEntry(checkpointID, checkpoint);
  }
}

module.exports = {
  AET_ROOT,
  confirmPrompt,
  formatStepPrompt,
  resolveProjectRoot,
  readPayload,
  writeResult,
  asText,
  isAETCommand,
  startWorkflowAndGetStepInstruction,
  bootstrapAgentCheckpoint,
  listAgentResumableCheckpoints,
  buildCommandEntryPrompt,
  buildResumableCommandText,
  takeCurrentStepText,
  ensureCheckpointRunning,
};
