/**
 * AET Plugin for OpenCode (V2 — Plugin.define)
 *
 * Provides workflow-based agent execution with configurable steps.
 * Agents are materialized to ~/.config/opencode/agents/<id>.md (D-006).
 *
 * 状态管理使用 CheckpointManager，存储在项目 .aet/core-checkpoint/ 目录下。
 *
 * V2 迁移要点 (T005+T006+T007)：
 *   - 入口：export default Plugin.define({ id, setup(ctx) }) 替代 V1 factory 导出
 *   - 工具：ctx.tool.transform(editor => editor.add({ name, description, input: JSON Schema, execute })) 替代 tool({ args: zod })
 *   - Hooks：prompt/context session hook、event subscribe({signal}) 替代 hooks 对象
 *   - Agent 注册：物化 ~/.config/opencode/agents/<id>.md 替代 config.agent 赋值（D-006）
 *   - 后端调用（.platform/utils/*）保持不变
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { Plugin } from "@opencode/plugin";

import { ConfigManager } from '../../.platform/utils/config-manager.js';
import { CheckpointManager } from '../../.platform/utils/checkpoint-manager.js';
import { WorkflowEngine } from '../../.platform/utils/workflow-engine.js';
import { TraceLogger, TRACE_DIR } from '../../.platform/utils/trace-logger.js';
import { AgentInsightClient, generateCollaborationId, generateEventId } from '../../.platform/utils/agent-insight-client.js';
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

// ============================================
// Agent Definition Loading (from global install dir, with project fallback)
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

// ============================================
// Session Run State Machine（单次执行生命周期）
// ============================================

const SessionCheckpointState = {
  RUNNING: 'running',
  PENDING_IDLE: 'pending_idle',
  INTERRUPTED: 'interrupted',
  COMPLETED: 'completed',
};

const IDLE_SETTLE_MS = 300;

// ============================================
// 命令直入 + Checkpoint 复用（/design、/implement）
// ============================================

// 命令名（去掉命名空间后的最后一段）-> agent。
const CHECKPOINT_COMMAND_AGENTS = {
  design: 'aet-design',
  implement: 'aet-implement',
};

// 兼容 `aet:design` / `aet/design` / `aet-design` / `design` 等命名空间形式。
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

// 从用户输入文本中解析斜杠命令（/design、/implement、/aet-design 等），
// 返回匹配到的 agentId，未匹配返回 null。
function resolveSlashCommandAgent(promptText) {
  if (!promptText || typeof promptText !== 'string') return null;
  const m = promptText.match(/^\s*\/(aet:)?([a-zA-Z0-9_-]+)/);
  if (!m) return null;
  // m[1] 是可选的 aet: 命名空间，m[2] 是命令名
  const cmd = m[2];
  // 直接匹配 design/implement
  if (CHECKPOINT_COMMAND_AGENTS[cmd]) return CHECKPOINT_COMMAND_AGENTS[cmd];
  // 匹配 aet-design 等
  if (cmd.startsWith('aet-')) {
    const stripped = cmd.slice(4);
    if (CHECKPOINT_COMMAND_AGENTS[stripped]) return CHECKPOINT_COMMAND_AGENTS[stripped];
  }
  return null;
}

function asText(v) {
  return typeof v === 'string' ? v : JSON.stringify(v, null, 2);
}

// ============================================
// Agent Materialization (D-006)
// 物化 AET agent 定义到 ~/.config/opencode/agents/<id>.md
// ============================================

const AET_AGENT_PREFIX = 'aet-';

function getV2AgentsDir() {
  return path.join(os.homedir(), '.config', 'opencode', 'agents');
}

// V1 permission 对象 -> V2 permissions 数组 [{action, resource, effect}]
// 宽规则（allow）在前、例外（deny）在后（last-match-wins）。
// agent_handover 的 allow→deny 改写在此阶段完成，并维护 agentHandoverAgents Set。
function buildV2Permissions(v1Permission, agentId, agentHandoverAgents) {
  const base = { question: 'allow', ...(v1Permission || {}) };

  // agent_handover allow→deny 改写
  if (base.agent_handover === 'allow') {
    agentHandoverAgents.add(agentId);
    base.agent_handover = 'deny';
  }

  const allowRules = [];
  const denyRules = [];
  const askRules = [];
  for (const [action, effect] of Object.entries(base)) {
    if (effect === 'allow') {
      allowRules.push({ action, resource: '*', effect: 'allow' });
    } else if (effect === 'deny') {
      denyRules.push({ action, resource: '*', effect: 'deny' });
    } else if (effect === 'ask') {
      askRules.push({ action, resource: '*', effect: 'ask' });
    }
  }
  // allow → ask → deny（last-match-wins：deny 最后）
  return [...allowRules, ...askRules, ...denyRules];
}

// 生成 agent .md 文件内容（frontmatter + body）
function formatAgentMarkdown(agentId, agentImpl, agentHandoverAgents) {
  const permissions = buildV2Permissions(agentImpl.permission, agentId, agentHandoverAgents);

  const frontmatter = {
    description: agentImpl.description || '',
    mode: agentImpl.mode || 'primary',
  };
;
  if (agentImpl.model) frontmatter.model = agentImpl.model;
  if (agentImpl.hidden !== undefined) frontmatter.hidden = agentImpl.hidden;
  if (agentImpl.color) frontmatter.color = agentImpl.color;
  if (agentImpl.steps !== undefined) frontmatter.steps = agentImpl.steps;
  if (permissions.length > 0) frontmatter.permissions = permissions;

  const frontmatterYaml = yamlStringify(frontmatter);
  const body = agentImpl.prompt || '';
  return `---\n${frontmatterYaml}---\n\n${body}\n`;
}

// 极简 YAML 序列化（仅用于 agent frontmatter，值类型受限）
function yamlStringify(obj, indent = 0) {
  const pad = '  '.repeat(indent);
  let out = '';
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      out += `${pad}${key}:\n`;
      for (const item of value) {
        if (item !== null && typeof item === 'object') {
          out += `${pad}- ${yamlInlineMap(item)}\n`;
        } else {
          out += `${pad}- ${yamlScalar(item)}\n`;
        }
      }
    } else if (typeof value === 'object') {
      out += `${pad}${key}:\n`;
      out += yamlStringify(value, indent + 1);
    } else {
      out += `${pad}${key}: ${yamlScalar(value)}\n`;
    }
  }
  return out;
}

function yamlInlineMap(obj) {
  const parts = [];
  for (const [k, v] of Object.entries(obj)) {
    parts.push(`${k}: ${yamlScalar(v)}`);
  }
  return parts.join(', ');
}

function yamlScalar(v) {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') {
    // 简单字符串直接输出，含特殊字符则加引号
    if (/^[\w\-./]+$/.test(v)) return v;
    return JSON.stringify(v);
  }
  return JSON.stringify(v);
}

// 物化 AET agent 定义到 ~/.config/opencode/agents/<id>.md（幂等）
// 只管理 aet- 前缀的 agent 文件，不触碰用户自有 agent。
async function materializeAgents(configManager, agentHandoverAgents) {
  configManager.reloadConfig(undefined);

  // 加载 agent 实现定义（prompt/description/permission/mode）
  let agentImpls = await loadAgentDefinitions(getAgentsDir());
  if (Object.keys(agentImpls).length === 0) {
    const projectAgentsDir = getProjectAgentsDir(process.cwd());
    agentImpls = await loadAgentDefinitions(projectAgentsDir);
    if (Object.keys(agentImpls).length > 0) {
      console.error(`[AET] Loaded ${Object.keys(agentImpls).length} agents from project directory`);
    }
  }

  const allAgentConfigs = configManager.getAllAgents();
  if (Object.keys(allAgentConfigs).length === 0) {
    console.warn('[AET] No agent configs found in workflow template. Agents will not be materialized.');
    return;
  }

  const agentsDir = getV2AgentsDir();
  fs.mkdirSync(agentsDir, { recursive: true });

  for (const [agentId, agentConfig] of Object.entries(allAgentConfigs)) {
    if (typeof agentConfig !== 'object' || agentConfig === null || !agentConfig.name) {
      continue;
    }
    // 仅管理 aet- 前缀的 agent（避免触碰用户自有 agent）
    if (!agentId.startsWith(AET_AGENT_PREFIX)) {
      continue;
    }

    const agentImplName = agentConfig.name;
    const agentImpl = agentImpls[agentImplName];
    if (!agentImpl) {
      console.warn(`[AET] Agent "${agentImplName}" definition not found in agents directory. Skipping.`);
      continue;
    }

    const filePath = path.join(agentsDir, `${agentId}.md`);
    const content = formatAgentMarkdown(agentId, agentImpl, agentHandoverAgents);

    try {
      let existing = null;
      if (fs.existsSync(filePath)) {
        existing = fs.readFileSync(filePath, 'utf-8');
      }
      if (existing === content) {
        // 幂等：内容相同，跳过
        continue;
      }
      fs.writeFileSync(filePath, content, 'utf-8');
      if (existing !== null) {
        console.error(`[AET] agent ${agentId} 已更新`);
      }
    } catch (err) {
      console.error(`[AET] agent ${agentId} materialize error:`, err.message);
    }
  }
}

// ============================================
// V2 Plugin Entry
// ============================================

export default Plugin.define({
  id: 'aet',
  async setup(ctx) {
    // ── Setup closure state ──
    const directory = ctx.location.directory;
    const session = ctx.session;

    const checkpointManager = new CheckpointManager(directory);
    const workflowEngine = new WorkflowEngine(configManager, checkpointManager);
    const traceLogger = new TraceLogger(configManager, () => ({
      checkpointID: currentCheckpointID,
      checkpointManager,
    }));
    traceLogger.install();

    const agentInsightClient = new AgentInsightClient(configManager.getAgentInsightConfig?.() ?? configManager.getAgentInsightConfig());

    let currentCheckpointID = null;
    let collaborationId = null;
    let currentAgentId = null;
    let lastAutomationSessionID = null;

    // 斜杠命令 + session 生命周期合并状态（D-003）
    const pendingCheckpointCmd = new Map();   // sessionID -> { command, agentId, arguments }
    const pendingAutomationDirective = new Map(); // sessionID -> boolean

    // agent_handover 权限追踪（allow→deny 改写的 agent 集合）
    const agentHandoverAgents = new Set();

    // session checkpoint 生命周期状态
    const sessionCheckpoints = new Map();
    let sessionCheckpointCounter = 0;

    // ── 物化 AET agents（D-006）──
    try {
      await materializeAgents(configManager, agentHandoverAgents);
    } catch (err) {
      console.error('[AET] agent materialization error:', err.message);
    }

    // ============================================
    // Session Checkpoint 状态机辅助函数
    // ============================================

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
      const sc = sessionCheckpoints.get(sessionID);
      if (sc && (sc.state === SessionCheckpointState.RUNNING || sc.state === SessionCheckpointState.PENDING_IDLE)) {
        sc.state = SessionCheckpointState.INTERRUPTED;
      }
    }

    function closeSessionCheckpoint(sessionID) {
      sessionCheckpoints.delete(sessionID);
    }

    function isAutomationMode(checkpointID) {
      if (!checkpointID || !checkpointManager) return false;
      const cp = checkpointManager.getCheckpoint(checkpointID);
      return cp?.workflow?.automation === true;
    }

    // 确保 workflow 状态为 in_progress（用于中断后恢复）
    function ensureCheckpointRunning(checkpointID) {
      if (!checkpointID || !checkpointManager) return;
      const checkpoint = checkpointManager.getCheckpoint(checkpointID);
      if (checkpoint && checkpoint.workflow.status === 'interrupted') {
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

    function resolveSessionAgent(sessionID, fallbackAgent = null) {
      if (!checkpointManager || !sessionID) {
        return fallbackAgent;
      }
      const agentId = checkpointManager.findAgentBySessionID(sessionID);
      return agentId || fallbackAgent;
    }

    // 无历史时：就地为命令切入的 agent 创建并绑定一个 checkpoint
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
    function listAgentResumableCheckpoints(agentId) {
      return checkpointManager.getResumableCheckpoints()
        .map(e => checkpointManager.getCheckpoint(e.checkpointID))
        .filter(cp => cp && cp.workflow.name === agentId && cp.workflow.status !== 'completed')
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    }

    // 有历史时注入：本次任务 + 该 agent 全部可恢复历史记录
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

    // 取出「当前 step 任务（+ 上一步 context）」文本，并把该 step 置 in_progress（幂等）。
    function takeCurrentStepText(checkpointID) {
      const checkpoint = checkpointManager.getCheckpoint(checkpointID);
      if (!checkpoint) return null;
      const currentStage = checkpoint.workflow?.currentStage;
      const execution = checkpointManager.getCurrentExecution(checkpoint, currentStage);
      if (!execution) return null;
      const agentConfig = configManager.getAgentConfig(execution.agentId);

      if (!agentConfig?.workflow || agentConfig.workflow.length === 0) {
        return execution.context ? `## Context from previous stage:\n${asText(execution.context)}` : null;
      }

      const currentStepId = execution.currentStep;
      const currentStepState = currentStepId ? execution.steps[currentStepId] : null;
      if (!currentStepState || currentStepState.status !== 'pending') return null;
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

    // 就地恢复一个 checkpoint 到「真正的断点 step」并绑定到当前 session
    function resumeAgentCheckpointInPlace(sessionID, checkpointID) {
      ensureCheckpointRunning(checkpointID);
      const cp = checkpointManager.getCheckpoint(checkpointID);
      if (!cp) return null;
      const stage = cp.workflow.currentStage;
      const prev = checkpointManager.getCurrentExecution(cp, stage);
      const prevSteps = prev?.steps || null;
      const prevStep = prev?.currentStep || null;
      const agentId = prev?.agentId || stage;
      const ctx_ = prev?.context || cp.workflow.description || null;

      const exec = checkpointManager.startExecutionOn(cp, stage, sessionID, agentId, ctx_);
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
    // Stage / Step Handover（使用 ctx.session）
    // ============================================

    async function createSessionForClearIfNeeded(oldSessionID, agentId, checkpointID, stage, updateCheckpoint = true) {
      try {
        const createResult = await session.create({
          title: `${agentId} - ${stage} Stage (context cleared)`,
        });
        const newSessionID = createResult?.id;
        if (!newSessionID) {
          console.error('[AET] Failed to create new session for clear=true');
          return oldSessionID;
        }

        // 上传协作事件到 agent-insight 平台
        if (agentInsightClient?.enabled) {
          if (!collaborationId) {
            collaborationId = generateCollaborationId();
          }
          const fromAgent = currentAgentId || agentId;
          const toAgent = agentId;
          await agentInsightClient.uploadEvent({
            collaborationId,
            eventId: generateEventId(),
            fromSessionId: oldSessionID,
            toSessionId: newSessionID,
            description: `${fromAgent} → ${toAgent}: ${stage} 阶段清上下文重建 session`,
            observedAt: new Date().toISOString(),
          });
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
        await session.prompt({ sessionID, text: promptText });
      } catch (err) {
        console.error('[AET] Send step prompt error:', err.message);
      }
    }

    async function sendStepPromptWithNewSession(oldSessionID, agentId, checkpointID, stage, stepConfig) {
      let promptText = `## Please continue executing this step:\n`;
      promptText += `Step name:\n${stepConfig.name}\n`;
      promptText += `Task:\n${stepConfig.description}`;

      const newSessionID = await createSessionForClearIfNeeded(oldSessionID, agentId, checkpointID, stage);
      if (newSessionID === oldSessionID) return;

      startSessionCheckpoint(newSessionID);
      try {
        await session.prompt({ sessionID: newSessionID, text: promptText });
      } catch (err) {
        console.error('[AET] Send step prompt with new session error:', err.message);
      }
    }

    async function triggerAfterHook(sessionID, stage, checkpointID) {
      if (!stage) {
        return;
      }

      const afterHook = stage.after || 'auto';

      if (afterHook === 'auto') {
        const workflowName = checkpointManager.getCheckpoint(checkpointID)?.workflow.name;
        const stages = workflowEngine.getScenarioWorkflow(workflowName);
        const currentIdx = stages.findIndex(s => (s.stage_id || s.agent_id) === (stage.stage_id || stage.agent_id));
        const nextStage = stages[currentIdx + 1];
        if (nextStage) {
          await executeStageHandover(nextStage, null, checkpointID, null, sessionID);
        } else {
          checkpointManager.completeCheckpoint(checkpointID);
        }
        return;
      }

      // Automation short-circuit
      if (afterHook !== 'auto' && isAutomationMode(checkpointID)) {
        const workflowName = checkpointManager.getCheckpoint(checkpointID)?.workflow.name;
        const stages = workflowEngine.getScenarioWorkflow(workflowName);
        const currentIdx = stages.findIndex(s => (s.stage_id || s.agent_id) === (stage.stage_id || stage.agent_id));
        const nextStage = stages[currentIdx + 1];
        if (nextStage) {
          await executeStageHandover(nextStage, null, checkpointID, null, sessionID);
        } else {
          checkpointManager.completeCheckpoint(checkpointID);
        }
        return;
      }

      const hookConfig = workflowEngine.getHookConfig(afterHook);
      if (hookConfig && hookConfig.options && hookConfig.options.length > 0) {
        const description = hookConfig.description || 'Please confirm';
        const optionsText = hookConfig.options.map(opt => `- ${opt.label}`).join('\n');
        const template = hookConfig.promptTemplate || 'Question: "{description}"\n{options}';
        let userPrompt = template.replace('{description}', description).replace('{options}', optionsText);
        userPrompt += '\n\n**If user approves, please call agent_handover to advance to the next stage.**';
        startSessionCheckpoint(sessionID);
        try {
          await session.prompt({ sessionID, text: userPrompt });
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
      if (!stepConfig) {
        return;
      }

      const afterHook = stepConfig.after || 'auto';

      if (afterHook === 'auto') {
        await advanceToNextStep(sessionID, agentId, agentConfig, checkpointID, stage, null);
        return;
      }

      if (afterHook !== 'auto' && isAutomationMode(checkpointID)) {
        await advanceToNextStep(sessionID, agentId, agentConfig, checkpointID, stage, null);
        return;
      }

      const hookConfig = workflowEngine.getHookConfig(afterHook);
      if (hookConfig && hookConfig.options && hookConfig.options.length > 0) {
        const description = hookConfig.description || 'Confirm before proceeding to next step';
        const optionsText = hookConfig.options.map(opt => `- ${opt.label}`).join('\n');
        const template = hookConfig.promptTemplate || 'Question: "{description}"\n{options}';
        let userPrompt = template.replace('{description}', description).replace('{options}', optionsText);
        userPrompt += `\n\nCurrent Step: **${stepConfig.name}**`;
        userPrompt += '\n\n**If user approves, please call step_handover to advance to the next step.**';
        startSessionCheckpoint(sessionID);
        try {
          await session.prompt({ sessionID, text: userPrompt });
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
        nextStepConfig = stepConfigs.find(s => (s.step_id || s.name) === targetStepId);
      } else {
        const currentIdx = stepConfigs.findIndex(s => (s.step_id || s.name) === currentStepInfo.stepId);
        nextStepConfig = stepConfigs[currentIdx + 1];
      }

      if (!nextStepConfig) {
        checkpointManager.completeAllSteps(checkpointID, stage);
        return;
      }

      const nextStepId = nextStepConfig.step_id || nextStepConfig.name;
      checkpointManager.advanceStep(checkpointID, stage, nextStepId, context);

      const shouldClear = nextStepConfig.clear === true;

      const beforeHook = nextStepConfig.before || 'auto';
      if (beforeHook === 'auto' || isAutomationMode(checkpointID)) {
        if (shouldClear) {
          sendStepPromptWithNewSession(sessionID, agentId, checkpointID, stage, nextStepConfig);
        } else {
          sendStepPrompt(sessionID, agentId, checkpointID, stage, nextStepConfig);
        }
        return;
      }

      const hookConfig = workflowEngine.getHookConfig(beforeHook);
      if (hookConfig && hookConfig.options && hookConfig.options.length > 0) {
        const description = hookConfig.description || 'Confirm before starting next step';
        const optionsText = hookConfig.options.map(opt => `- ${opt.label}`).join('\n');
        const template = hookConfig.promptTemplate || 'Question: "{description}"\n{options}';
        let userPrompt = template.replace('{description}', description).replace('{options}', optionsText);
        userPrompt += `\n\n即将执行的 Step: **${nextStepConfig.name}**`;
        userPrompt += '\n\n**If user approves, please call step_handover to continue.**';
        if (shouldClear) {
          const hookSessionID = await createSessionForClearIfNeeded(sessionID, agentId, checkpointID, stage, true);
          startSessionCheckpoint(hookSessionID);
          try {
            await session.prompt({ sessionID: hookSessionID, text: userPrompt });
          } catch (err) {
            console.error('[AET] Step before hook error:', err.message);
          }
        } else {
          startSessionCheckpoint(sessionID);
          try {
            await session.prompt({ sessionID, text: userPrompt });
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

    async function executeStageHandover(stage, context, checkpointID, promptForAgent = null, fromSessionId = null) {
      const actualPrompt = promptForAgent || context || `Please continue working on ${stage.agent_id}.`;

      try {
        const createResult = await session.create({
          title: `${stage.agent_id} - ${stage.agent_id.toUpperCase().replace('-AGENT', '')} Stage`,
          agent: stage.agent_id,
        });
        const newSessionID = createResult?.id;

        if (newSessionID) {
          // 在 CheckpointManager 中记录 execution
          const stageName = stage.stage_id || stage.agent_id;

          const checkpoint = checkpointManager.getCheckpoint(checkpointID);

          const currentStageExecution = checkpointManager.getCurrentExecution(checkpoint, checkpoint.workflow.currentStage);
          const currentStageSteps = currentStageExecution?.steps || null;
          const currentStageCurrentStep = currentStageExecution?.currentStep || null;

          // 上传跨 Session 协作关系到 agent-insight 平台
          if (agentInsightClient?.enabled) {
            if (!collaborationId) {
              collaborationId = generateCollaborationId();
            }
            const eventId = generateEventId();
            const fromSession = fromSessionId || 'root';
            const fromAgent = currentAgentId || 'Build';
            const toAgent = stage.agent_id;
            const desc = `${fromAgent} → ${toAgent}: ${stageName} 阶段启动`;
            await agentInsightClient.uploadEvent({
              collaborationId,
              eventId,
              fromSessionId: fromSession,
              toSessionId: newSessionID,
              description: desc,
              observedAt: new Date().toISOString(),
            });
            currentAgentId = toAgent;
          }

          const targetStageExecution = checkpointManager.getCurrentExecution(checkpoint, stageName);
          const targetStageSteps = targetStageExecution?.steps || null;
          const targetStageCurrentStep = targetStageExecution?.currentStep || null;

          const executionContext = context || targetStageExecution?.context || currentStageExecution?.context;

          const isSameStage = checkpoint.workflow.currentStage === stageName;
          const previousSteps = isSameStage ? currentStageSteps : targetStageSteps;
          const previousCurrentStep = isSameStage ? currentStageCurrentStep : targetStageCurrentStep;

          const newExecution = checkpointManager.startExecutionOn(checkpoint, stageName, newSessionID, stage.agent_id, executionContext);

          const agentConfig = configManager.getAgentConfig(stage.agent_id);
          if (agentConfig?.workflow && agentConfig.workflow.length > 0) {
            checkpointManager.initStepsOn(checkpoint, stageName, agentConfig.workflow, null);

            if (newExecution && previousSteps && Object.keys(previousSteps).length > 0) {
              for (const [stepId, stepState] of Object.entries(previousSteps)) {
                if (newExecution.steps[stepId]) {
                  newExecution.steps[stepId] = {
                    ...newExecution.steps[stepId],
                    ...stepState,
                  };
                }
              }
              newExecution.currentStep = previousCurrentStep;
              if (previousCurrentStep && newExecution.steps[previousCurrentStep]) {
                newExecution.steps[previousCurrentStep] = {
                  ...newExecution.steps[previousCurrentStep],
                  status: 'pending',
                  startedAt: null,
                };
              }
            }
          }

          checkpointManager.saveCheckpoint(checkpoint);
          checkpointManager.updateIndexEntry(checkpointID, checkpoint);

          // 检查 stage.before hook
          const beforeHook = stage.before || 'auto';
          if (beforeHook !== 'auto' && !isAutomationMode(checkpointID)) {
            const hookConfig = workflowEngine.getHookConfig(beforeHook);
            if (hookConfig && hookConfig.options && hookConfig.options.length > 0) {
              const description = hookConfig.description || 'Please confirm';
              const optionsText = hookConfig.options.map(opt => `- ${opt.label}`).join('\n');
              const template = hookConfig.promptTemplate || 'Question: "{description}"\n{options}';
              let userPrompt = template.replace('{description}', description).replace('{options}', optionsText);
              if (context) {
                userPrompt += `\n\nTask context:\n${context}`;
              }
              userPrompt += '\n\nIf user approves, please call agent_handover to begin this stage.';

              startSessionCheckpoint(newSessionID);
              await session.prompt({ sessionID: newSessionID, text: userPrompt });
              return;
            }
          }

          // 直接执行
          startSessionCheckpoint(newSessionID);
          await session.prompt({ sessionID: newSessionID, text: actualPrompt });
        }
      } catch (e) {
        console.error('[AET] executeStageHandover error:', e.message);
      }
    }

    async function settleIdleRun(sessionID, expectedCheckpointID, stage, workflowRunID) {
      await new Promise(resolve => setTimeout(resolve, IDLE_SETTLE_MS));

      const currentSessionCheckpoint = getCurrentSessionCheckpoint(sessionID);
      if (!currentSessionCheckpoint || currentSessionCheckpoint.checkpointID !== expectedCheckpointID || currentSessionCheckpoint.state !== SessionCheckpointState.PENDING_IDLE) {
        return;
      }

      if (currentSessionCheckpoint.state === SessionCheckpointState.INTERRUPTED) {
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

      if (currentSessionCheckpoint.state === SessionCheckpointState.INTERRUPTED) {
        closeSessionCheckpoint(sessionID);
        return;
      }

      currentSessionCheckpoint.state = SessionCheckpointState.COMPLETED;
      closeSessionCheckpoint(sessionID);
      await triggerStepAfterHook(sessionID, agentId, agentConfig, workflowRunID, stage);
    }

    // ============================================
    // T006: 9 Tools via ctx.tool.transform
    // ============================================
    await ctx.tool.transform(editor => {
      // 1. workflow_list
      editor.add({
        name: 'workflow_list',
        description: 'List all available scenarios',
        input: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
        async execute(input) {
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

          return { content: lines.join('\n') };
        },
      });

      // 2. checkpoint_list_active
      editor.add({
        name: 'checkpoint_list_active',
        description: '查询当前正在执行和可恢复的任务状态。可选 scope 过滤："scenario"（仅 workflow_start 起的多阶段场景）、"agent"（仅单 agent 直入任务）、"all"（默认，全部）。',
        input: {
          type: 'object',
          properties: {
            scope: {
              type: 'string',
              enum: ['all', 'scenario', 'agent'],
              description: '过滤范围："scenario" / "agent" / "all"（默认）',
            },
          },
          required: [],
          additionalProperties: false,
        },
        async execute(input) {
          if (!checkpointManager) {
            return { content: JSON.stringify({ error: 'CheckpointManager not initialized' }, null, 2) };
          }
          const index = checkpointManager.loadIndex();
          const scope = input.scope || 'all';
          if (scope === 'all') {
            return { content: JSON.stringify(index, null, 2) };
          }
          const isScenario = (name) => !!workflowEngine.getScenarioConfig(name);
          const keep = (e) => scope === 'scenario' ? isScenario(e.workflow) : !isScenario(e.workflow);
          const filtered = {
            ...index,
            active: (index.active || []).filter(keep),
            interrupted: (index.interrupted || []).filter(keep),
            recentCompleted: (index.recentCompleted || []).filter(keep),
          };
          return { content: JSON.stringify(filtered, null, 2) };
        },
      });

      // 3. workflow_start
      editor.add({
        name: 'workflow_start',
        description: 'Start a capability scenario OR a single agent\'s task. `name` can be a scenario (e.g. "feature") or an agent with steps (e.g. "aet-design"). If the current session agent equals the target agent, it runs IN THE CURRENT session (and returns the first step to execute); otherwise a new session is created. Example: workflow_start({ name: "feature", context: "..." }) or workflow_start({ name: "aet-design", context: "..." })',
        input: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              minLength: 1,
              description: 'Required. Scenario name, or an agent id that has steps.',
            },
            context: {
              // D-005: V1 any() → 空 schema（接受任意类型）
              description: 'Required. Task/context for the (first) stage agent. String or object (objects are serialized). Can include newlines.',
            },
          },
          required: ['name'],
          additionalProperties: false,
        },
        async execute(input, toolContext) {
          const { name } = input;
          const rawDesc = input.context;
          const desc = typeof rawDesc === 'string' ? rawDesc : (rawDesc != null ? JSON.stringify(rawDesc) : '');
          if (!name || name.trim().length === 0) {
            return { content: JSON.stringify({ success: false, error: 'name is required' }, null, 2) };
          }
          if (!desc || desc.trim().length === 0) {
            return { content: JSON.stringify({ success: false, error: 'context is required' }, null, 2) };
          }

          const scenario = workflowEngine.getScenarioConfig(name);
          const isScenario = !!scenario;
          const agentCfg = isScenario ? null : configManager.getAgentConfig(name);
          if (!isScenario && (!agentCfg?.workflow || agentCfg.workflow.length === 0)) {
            return { content: JSON.stringify({ success: false, error: `"${name}" is not a scenario, nor an agent with steps` }, null, 2) };
          }

          let firstStage = null;
          let targetAgent;
          if (isScenario) {
            const stages = workflowEngine.getScenarioWorkflow(name);
            if (!stages || stages.length === 0) {
              return { content: JSON.stringify({ success: false, error: 'Scenario has no stages' }, null, 2) };
            }
            firstStage = stages[0];
            targetAgent = firstStage.agent_id;
          } else {
            targetAgent = name;
          }

          const sessionID = toolContext?.sessionID;
          const inPlace = !isScenario && sessionID && toolContext?.agent === targetAgent;

          if (inPlace) {
            const checkpointID = bootstrapAgentCheckpoint(sessionID, targetAgent, desc);
            startSessionCheckpoint(sessionID);
            const instruction = takeCurrentStepText(checkpointID);
            return { content: JSON.stringify({ success: true, mode: 'in-place', checkpointID, agentId: targetAgent, instruction }, null, 2) };
          }

          const checkpointID = checkpointManager.createCheckpoint(name, desc);
          if (scenario?.automation === true) {
            const initCp = checkpointManager.getCheckpoint(checkpointID);
            if (initCp) {
              initCp.workflow.automation = true;
              checkpointManager.saveCheckpoint(initCp);
            }
          }
          currentCheckpointID = checkpointID;
          const stageToStart = isScenario ? firstStage : { agent_id: targetAgent, stage_id: targetAgent };
          await executeStageHandover(stageToStart, desc, checkpointID, null, toolContext?.sessionID);
          return { content: JSON.stringify({ success: true, mode: 'new-session', checkpointID, stage: stageToStart.stage_id || stageToStart.agent_id }, null, 2) };
        },
      });

      // 4. checkpoint_resume
      editor.add({
        name: 'checkpoint_resume',
        description: '恢复指定的 workflow checkpoint',
        input: {
          type: 'object',
          properties: {
            checkpointID: { type: 'string', description: '要恢复的 checkpoint ID' },
            stage: { type: 'string', description: '恢复到指定阶段（可选）' },
            step: { type: 'string', description: '恢复到指定步骤（可选）' },
          },
          required: [],
          additionalProperties: false,
        },
        async execute(input, toolContext) {
          if (!checkpointManager) {
            return { content: JSON.stringify({ success: false, error: 'CheckpointManager not initialized' }, null, 2) };
          }

          let targetCheckpointID = input.checkpointID;
          if (!targetCheckpointID) {
            const index = checkpointManager.loadIndex();
            if (index.interrupted.length > 0) {
              targetCheckpointID = index.interrupted[0].checkpointID;
            } else if (index.active.length > 0) {
              targetCheckpointID = index.active[0].checkpointID;
            }
          }

          if (!targetCheckpointID) {
            return { content: JSON.stringify({ success: false, error: 'No checkpoint to resume' }, null, 2) };
          }

          const checkpoint = checkpointManager.getCheckpoint(targetCheckpointID);
          if (!checkpoint) {
            return { content: JSON.stringify({ success: false, error: `Checkpoint ${targetCheckpointID} not found` }, null, 2) };
          }

          if (checkpoint.workflow.status === 'completed') {
            return { content: JSON.stringify({ success: false, error: 'Checkpoint already completed' }, null, 2) };
          }

          const targetStage = input.stage || checkpoint.workflow.currentStage;
          const execution = checkpointManager.getCurrentExecution(checkpoint, targetStage);
          const targetAgent = execution?.agentId || targetStage;

          if (toolContext?.sessionID && toolContext?.agent && toolContext.agent === targetAgent) {
            resumeAgentCheckpointInPlace(toolContext.sessionID, targetCheckpointID);
            startSessionCheckpoint(toolContext.sessionID);
            const instruction = takeCurrentStepText(targetCheckpointID);
            const cp = checkpointManager.getCheckpoint(targetCheckpointID);
            const ex = checkpointManager.getCurrentExecution(cp, cp.workflow.currentStage);
            return { content: JSON.stringify({
              success: true,
              mode: 'in-place',
              checkpointID: targetCheckpointID,
              stage: cp.workflow.currentStage,
              step: ex?.currentStep || null,
              instruction,
            }, null, 2) };
          }

          currentCheckpointID = targetCheckpointID;
          checkpointManager.updateCheckpoint(targetCheckpointID, {
            interruptedAt: null,
            workflow: { status: 'in_progress' },
          });
          const resumePrompt = checkpointManager.getResumePrompt(targetCheckpointID, input.stage, input.step);
          const originalContext = execution?.context;

          if (execution) {
            await executeStageHandover(
              { agent_id: execution.agentId, stage_id: targetStage },
              originalContext,
              targetCheckpointID,
              resumePrompt,
              toolContext?.sessionID
            );
          } else {
            const stages = workflowEngine.getScenarioWorkflow(checkpoint.workflow.name);
            const stageConfig = stages.find(s => (s.stage_id || s.agent_id) === targetStage);
            if (stageConfig) {
              await executeStageHandover(stageConfig, originalContext, targetCheckpointID, resumePrompt, toolContext?.sessionID);
            }
          }

          return { content: JSON.stringify({
            success: true,
            mode: 'new-session',
            checkpointID: targetCheckpointID,
            stage: targetStage,
            step: input.step || checkpointManager.getCurrentStepId(checkpoint),
          }, null, 2) };
        },
      });

      // 5. agent_handover
      editor.add({
        name: 'agent_handover',
        description: 'Advance to the next agent stage, or jump to a specific stage. Example: agent_handover({ context: "Summary: completed design.\nNext: implement the feature based on design." }) or agent_handover({ context: "...", stage: "aet-implement" })',
        input: {
          type: 'object',
          properties: {
            context: {
              type: 'string',
              minLength: 1,
              description: 'Required. Summary of current stage + task for next stage.',
            },
            stage: {
              type: 'string',
              description: 'Optional. Target stage_id/agent_id to jump to (instead of the immediate next stage). Defaults to the next stage.',
            },
          },
          required: ['context'],
          additionalProperties: false,
        },
        async execute(input, toolContext) {
          const ctx_ = input.context;
          if (!ctx_ || ctx_.trim().length === 0) {
            return { content: JSON.stringify({
              success: false,
              error: 'context is required. Please provide: 1) Summary of current stage work. 2) Task for next stage.'
            }, null, 2) };
          }

          if (!currentCheckpointID || !checkpointManager) {
            return { content: JSON.stringify({ success: false, error: 'No active workflow' }, null, 2) };
          }

          ensureCheckpointRunning(currentCheckpointID);

          const checkpoint = checkpointManager.getCheckpoint(currentCheckpointID);
          if (!checkpoint) {
            return { content: JSON.stringify({ success: false, error: 'No active checkpoint' }, null, 2) };
          }

          if (checkpoint.workflow.currentStage) {
            checkpointManager.completeExecution(currentCheckpointID, checkpoint.workflow.currentStage, ctx_);
          }

          const stages = workflowEngine.getScenarioWorkflow(checkpoint.workflow.name);
          let nextStage;
          if (input.stage) {
            nextStage = stages.find(s => (s.stage_id || s.agent_id) === input.stage);
            if (!nextStage) {
              const avail = stages.map(s => s.stage_id || s.agent_id).join(', ') || '(none)';
              return { content: JSON.stringify({ success: false, error: `stage "${input.stage}" not found. Available: ${avail}` }, null, 2) };
            }
          } else {
            const currentIdx = stages.findIndex(s => (s.stage_id || s.agent_id) === checkpoint.workflow.currentStage);
            nextStage = stages[currentIdx + 1];
          }

          if (!nextStage) {
            checkpointManager.completeCheckpoint(currentCheckpointID);
            currentCheckpointID = null;
            collaborationId = null;
            return { content: JSON.stringify({ success: true, done: true, message: 'Workflow completed' }, null, 2) };
          }

          await executeStageHandover(nextStage, ctx_, currentCheckpointID, null, toolContext?.sessionID);

          return { content: JSON.stringify({ success: true, stage: nextStage.stage_id || nextStage.agent_id }, null, 2) };
        },
      });

      // 6. step_handover
      editor.add({
        name: 'step_handover',
        description: 'Hand over to the next step within the current agent, or jump to a specific step. Examples: step_handover({ context: "Completed analysis." }) | step_handover({ context: "...", step: "development_plan" }) | step_handover({ context: "Skipped optional step." })\n\n⚠️ WARNING: The `end` parameter TERMINATES THE ENTIRE WORKFLOW — all remaining steps and stages are permanently skipped, the checkpoint is archived, and the workflow cannot be resumed. ONLY use `end=true` when the user has EXPLICITLY and CLEARLY requested to abort/terminate the whole workflow. NEVER use it just to finish a step or mark a step as complete — use `step_handover({ context: "..." })` without `end` for that.',
        input: {
          type: 'object',
          properties: {
            context: {
              type: 'string',
              minLength: 1,
              description: 'Required. Summary of current step work to pass to the next step, or final summary when ending early.',
            },
            step: {
              type: 'string',
              description: 'Optional. Target step_id to jump to (forward to skip steps, or backward to redo). Defaults to the next step. Ignored when end=true.',
            },
            end: {
              type: 'boolean',
              description: '⚠️ DANGER — DO NOT use unless the user explicitly requests to terminate the ENTIRE workflow. This ends ALL remaining steps/stages permanently (skipped & archived, no resume). For completing a single step, just omit this parameter. Confusing "finish a step" with "end the workflow" is the #1 misuse of this parameter.',
            },
          },
          required: ['context'],
          additionalProperties: false,
        },
        async execute(input, toolContext) {
          const ctx_ = input.context;
          const end = input.end;
          if (!ctx_ || ctx_.trim().length === 0) {
            return { content: JSON.stringify({
              success: false,
              error: 'context is required. Please provide a summary of the current step work.'
            }, null, 2) };
          }

          if (!currentCheckpointID || !checkpointManager) {
            return { content: JSON.stringify({ success: false, error: 'No active workflow' }, null, 2) };
          }

          ensureCheckpointRunning(currentCheckpointID);

          const sessionID = toolContext.sessionID;
          const sessionAgent = resolveSessionAgent(sessionID, null);

          const checkpoint = checkpointManager.getCheckpoint(currentCheckpointID);
          if (!checkpoint || !checkpoint.workflow.currentStage) {
            return { content: JSON.stringify({ success: false, error: 'No active stage' }, null, 2) };
          }

          const agentConfig = configManager.getAgentConfig(sessionAgent);
          if (!agentConfig?.workflow || agentConfig.workflow.length === 0) {
            return { content: JSON.stringify({ success: false, error: 'Current agent has no steps configured' }, null, 2) };
          }

          let handoverContext = {};
          try {
            handoverContext = JSON.parse(ctx_);
          } catch {
            handoverContext = { summary: ctx_ };
          }

          if (end) {
            checkpointManager.completeExecution(currentCheckpointID, checkpoint.workflow.currentStage, ctx_);
            checkpointManager.skipRemainingSteps(currentCheckpointID, checkpoint.workflow.currentStage);
            checkpointManager.completeCheckpoint(currentCheckpointID);
            currentCheckpointID = null;
            return { content: JSON.stringify({
              success: true,
              done: true,
              endedEarly: true,
              message: 'Workflow ended early. Remaining steps skipped and checkpoint archived.',
            }, null, 2) };
          }

          if (input.step) {
            const exists = agentConfig.workflow.some(s => (s.step_id || s.name) === input.step);
            if (!exists) {
              const avail = agentConfig.workflow.map(s => s.step_id || s.name).join(', ');
              return { content: JSON.stringify({ success: false, error: `step "${input.step}" not found. Available: ${avail}` }, null, 2) };
            }
          }

          await advanceToNextStep(sessionID, sessionAgent, agentConfig, currentCheckpointID, checkpoint.workflow.currentStage, handoverContext, input.step || null);

          const currentStepInfo = checkpointManager.getCurrentStep(currentCheckpointID, checkpoint.workflow.currentStage);
          if (!currentStepInfo) {
            return { content: JSON.stringify({
              success: true,
              done: true,
              message: 'All steps completed'
            }, null, 2) };
          }

          return { content: JSON.stringify({ success: true }, null, 2) };
        },
      });

      // 7. trace_enable
      editor.add({
        name: 'trace_enable',
        description: 'Enable LLM request/response trace logging. Sets trace.enabled=true in ~/.aet/config.json. All future LLM calls will be recorded to ~/.aet/log/trace/',
        input: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
        async execute(input) {
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
            configManager.invalidateGlobalConfig();
            return { content: JSON.stringify({
              success: true,
              enabled: true,
              traceDir: TRACE_DIR,
              message: 'Trace logging enabled. LLM calls will be recorded to ~/.aet/log/trace/',
            }, null, 2) };
          } catch (err) {
            return { content: JSON.stringify({
              success: false,
              error: `Failed to update global config: ${err.message}`,
            }, null, 2) };
          }
        },
      });

      // 8. trace_disable
      editor.add({
        name: 'trace_disable',
        description: 'Disable LLM request/response trace logging. Sets trace.enabled=false in ~/.aet/config.json. No new LLM calls will be recorded.',
        input: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
        async execute(input) {
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
            configManager.invalidateGlobalConfig();
            return { content: JSON.stringify({
              success: true,
              enabled: false,
              message: 'Trace logging disabled. No new LLM calls will be recorded.',
            }, null, 2) };
          } catch (err) {
            return { content: JSON.stringify({
              success: false,
              error: `Failed to update global config: ${err.message}`,
            }, null, 2) };
          }
        },
      });

      // 9. trace_status
      editor.add({
        name: 'trace_status',
        description: 'Check the current trace logging status. Shows whether trace is enabled/disabled and the trace directory location.',
        input: {
          type: 'object',
          properties: {},
          required: [],
          additionalProperties: false,
        },
        async execute(input) {
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
          return { content: JSON.stringify({
            enabled,
            traceDir: TRACE_DIR,
            traceDirExists,
            recordedSessions: sessionCount,
            globalConfigTrace: globalConfig?.trace || null,
          }, null, 2) };
        },
      });

      return editor;
    });

    // ============================================
    // T007: prompt hook（合并斜杠命令路由与 session 生命周期，D-003）
    // ============================================
    await ctx.session.hook("prompt", async (event) => {
      const sessionID = event?.sessionID;
      if (!sessionID) return;

      const promptText = event?.prompt?.text || '';

      // ── Phase A: 斜杠命令解析与路由 ──
      const slashAgentId = resolveSlashCommandAgent(promptText);
      if (slashAgentId) {
        pendingCheckpointCmd.set(sessionID, {
          command: promptText.match(/^\s*\/\S+/)?.[0] || promptText,
          agentId: slashAgentId,
          arguments: promptText.replace(/^\s*\/\S+\s*/, '').trim(),
        });

        // 自动化信号预检：该命令的 agentId 是否映射到 automation scenario
        try {
          const scenarios = configManager?.getScenarios?.() || {};
          const mapsToAutomation = Object.values(scenarios).some(sc =>
            sc && sc.automation === true &&
            Array.isArray(sc.workflow) &&
            sc.workflow.length > 0 &&
            (sc.workflow[0]?.agent_id === slashAgentId || sc.workflow[0]?.stage_id === slashAgentId)
          );
          pendingAutomationDirective.delete(sessionID);
          if (mapsToAutomation) {
            pendingAutomationDirective.set(sessionID, true);
            lastAutomationSessionID = sessionID;
          }
        } catch { /* configManager not ready — skip */ }
      }

      // ── Phase B: session checkpoint 生命周期 + first-message step 注入 ──
      // 命令直入（/design、/implement）：最优先处理
      if (checkpointManager && pendingCheckpointCmd.has(sessionID)) {
        const pending = pendingCheckpointCmd.get(sessionID);
        pendingCheckpointCmd.delete(sessionID);
        const agentId = pending.agentId;
        const agentConfig = configManager.getAgentConfig(agentId);
        const alreadyBound = checkpointManager.findCheckpointBySessionID(sessionID);
        if (!alreadyBound && agentConfig?.workflow && agentConfig.workflow.length > 0) {
          // 切换会话 agent 到命令指定的 agent（替代 V1 的 message.agent 赋值）
          try {
            await ctx.session.switchAgent({ sessionID, agent: agentId });
          } catch (err) {
            console.error('[AET] switchAgent error:', err.message);
          }
          try {
            const desc = (pending.arguments || '').trim();
            const candidates = listAgentResumableCheckpoints(agentId);
            if (candidates.length === 0) {
              // 无历史：插件直接就地建 checkpoint 并发第一步
              closeSessionCheckpoint(sessionID);
              startSessionCheckpoint(sessionID);
              const cid = bootstrapAgentCheckpoint(sessionID, agentId, desc);
              if (cid) {
                const stepText = takeCurrentStepText(cid);
                if (stepText) event.prompt.text += `\n\n${stepText}`;
              }
            } else {
              // 有历史：列出候选，让模型判断 + 找用户确认
              event.prompt.text += buildCommandEntryPrompt(agentId, desc, candidates);
            }
          } catch (e) {
            console.error('[AET] command checkpoint entry error:', e.message);
          }
          return;
        }
      }

      // 获取 workflow 当前阶段的 agent，有就 switchAgent，没有就不动
      let workflowAgent = null;
      if (checkpointManager && currentCheckpointID) {
        const checkpoint = checkpointManager.getCheckpoint(currentCheckpointID);
        if (checkpoint && checkpoint.workflow.status === 'in_progress') {
          const currentStage = checkpoint.workflow.currentStage;
          const execution = checkpointManager.getCurrentExecution(checkpoint, currentStage);
          workflowAgent = execution?.agentId;
        }
      }

      if (workflowAgent) {
        try {
          await ctx.session.switchAgent({ sessionID, agent: workflowAgent });
        } catch (err) {
          console.error('[AET] switchAgent workflow error:', err.message);
        }
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

      // 追踪当前 agent
      const finalAgent = workflowAgent || resolveSessionAgent(sessionID, null);
      if (finalAgent) {
        currentAgentId = finalAgent;
      }

      // 如果是第一条消息且有 active checkpoint，注入当前 step 信息
      try {
        const msgs = await ctx.session.context({ sessionID });
        const msgCount = msgs?.length || 0;
        if (msgCount <= 1 && finalAgent && targetCheckpointID) {
          const stepText = takeCurrentStepText(targetCheckpointID);
          if (stepText) event.prompt.text += `\n\n${stepText}`;
        }
      } catch (err) {
        console.error('[AET] prompt hook context error:', err.message);
      }
    });

    // ============================================
    // T007: context hook（系统提示注入）
    // ============================================
    await ctx.session.hook("context", (event) => {
      // Automation mode directive injection — INDEPENDENT of project-analysis
      {
        let injectDirective = false;
        // Signal 1: active automation checkpoint
        const cp = currentCheckpointID ? checkpointManager.getCheckpoint(currentCheckpointID) : null;
        if (cp?.workflow?.automation === true) {
          injectDirective = true;
        }
        // Signal 2: pending command maps to automation scenario
        const directiveSessionID = event?.sessionID || lastAutomationSessionID;
        if (!injectDirective && directiveSessionID && pendingAutomationDirective.get(directiveSessionID)) {
          injectDirective = true;
        }
        if (injectDirective) {
          pushText(event.system,
            `<aet-run-mode>automation</aet-run-mode>
<aet-run-mode-directive>
本会话处于自动化模式。禁止调用 question 工具向用户提问。
- 凡需用户决策处：选 SKILL.md 或 Agent prompt 中已声明的推荐项；若无明确推荐项，结合上下文（需求描述 / 代码库 / 已有交付物）推断最合理选项，并在交付物末尾「## 自动化决策记录」节追加一行：- 决策点：<交互点名称> | 推断选项：<选项> | 推断依据：<依据摘要>
- 凡标注为可选 review 的阶段（如 [S3] / [A4]）：仅运行一轮 review 循环（aet-req-review 的 A1→A2 一次），跳过 aet-req-user-review 阶段（A3，需要用户手动修订）与复审循环（A4）；A2 auto-fix 的决策记入「## 自动化决策记录」
- Agent 层用户交互点（如 Router 的 resume detection / workflow confirmation / unclear intent；Doc / Release 的用户选择点）：同样禁止调 question 工具，agent 基于自身判断直接推进，无需用户确认
- 不影响必经的验证类门禁（lint / test / build）：仍需全部通过
</aet-run-mode-directive>`
          );
        }
      }

      // Project-analysis injection（与 automation 正交，受独立开关控制）
      const config = configManager.config;
      const enabled = config.projectAnalysis?.enabled !== false;
      if (!enabled) {
        return;
      }
      const hasProjectAnalysis = detectProjectAnalysisFolder(directory);
      if (!hasProjectAnalysis) {
        return;
      }
      const projectAnalysisContent = formatProjectAnalysis(directory);
      if (!projectAnalysisContent) {
        return;
      }
      pushText(event.system, projectAnalysisContent);
    });

    // ============================================
    // event hook → ctx.event.subscribe（D-004）
    // AbortController 用于在 cleanup 时中止 async-iterator 订阅。
    // ============================================
    const abortController = new AbortController();
    (async () => {
      for await (const event of ctx.event.subscribe({ signal: abortController.signal })) {
        try {
          // V1 message.updated + MessageAbortedError → V2 session.execution.interrupted
          if (event.type === 'session.execution.interrupted') {
            const sessionID = event.data?.sessionID;
            if (sessionID) {
              markSessionCheckpointInterrupted(sessionID);
              if (currentCheckpointID && checkpointManager) {
                checkpointManager.interruptCheckpoint(currentCheckpointID, 'User aborted execution');
              }
            }
            continue;
          }

          // session.status: idle / busy 推进
          if (event.type === 'session.status') {
            const sessionID = event.data?.sessionID;
            const status = event.data?.status;
            if (!sessionID || !status) continue;

            const sessionAgent = resolveSessionAgent(sessionID, null);
            const sessionCheckpoint = getCurrentSessionCheckpoint(sessionID);

            if (status.type === 'idle') {
              if (sessionCheckpoint?.state === SessionCheckpointState.INTERRUPTED) {
                closeSessionCheckpoint(sessionID);
                continue;
              }

              if (currentCheckpointID && checkpointManager) {
                const checkpoint = checkpointManager.getCheckpoint(currentCheckpointID);
                if (checkpoint?.workflow?.status === 'interrupted') {
                  closeSessionCheckpoint(sessionID);
                  continue;
                }
                const execution = checkpointManager.getCurrentExecution(checkpoint, checkpoint.workflow.currentStage);
                if (execution?.status === 'interrupted') {
                  closeSessionCheckpoint(sessionID);
                  continue;
                }
              }

              if (currentCheckpointID && checkpointManager) {
                const checkpoint = checkpointManager.getCheckpoint(currentCheckpointID);
                if (checkpoint && checkpoint.workflow.currentStage) {
                  const execution = checkpointManager.getCurrentExecution(checkpoint, checkpoint.workflow.currentStage);
                  if (execution && execution.sessionID === sessionID) {
                    const agentConfig = configManager.getAgentConfig(sessionAgent);
                    const hasSteps = agentConfig?.workflow && agentConfig.workflow.length > 0;
                    const currentStepInfo = checkpointManager.getCurrentStep(currentCheckpointID, checkpoint.workflow.currentStage);

                    const hasMoreSteps = currentStepInfo && agentConfig.workflow.findIndex(s => (s.step_id || s.name) === currentStepInfo.stepId) < agentConfig.workflow.length - 1;

                    if (sessionCheckpoint?.state === SessionCheckpointState.RUNNING) {
                      sessionCheckpoint.state = SessionCheckpointState.PENDING_IDLE;
                      const expectedCheckpointID = sessionCheckpoint.checkpointID;
                      if (hasSteps && hasMoreSteps) {
                        void settleStepIdleRun(sessionID, expectedCheckpointID, sessionAgent, agentConfig, currentCheckpointID, checkpoint.workflow.currentStage);
                      } else {
                        checkpointManager.completeExecution(currentCheckpointID, checkpoint.workflow.currentStage, 'Stage completed');
                        const stages = workflowEngine.getScenarioWorkflow(checkpoint.workflow.name);
                        const fullStageConfig = stages.find(s => (s.stage_id || s.agent_id) === checkpoint.workflow.currentStage);
                        void settleIdleRun(sessionID, expectedCheckpointID, fullStageConfig || { agent_id: sessionAgent, stage_id: checkpoint.workflow.currentStage }, currentCheckpointID);
                      }
                      continue;
                    }

                    if (sessionCheckpoint?.state === SessionCheckpointState.PENDING_IDLE) {
                      const expectedCheckpointID = sessionCheckpoint.checkpointID;
                      if (sessionCheckpoint.state === SessionCheckpointState.INTERRUPTED) {
                        closeSessionCheckpoint(sessionID);
                        continue;
                      }
                      sessionCheckpoint.state = SessionCheckpointState.COMPLETED;
                      closeSessionCheckpoint(sessionID);
                      if (hasSteps && hasMoreSteps) {
                        await triggerStepAfterHook(sessionID, sessionAgent, agentConfig, currentCheckpointID, checkpoint.workflow.currentStage);
                      } else {
                        const stages = workflowEngine.getScenarioWorkflow(checkpoint.workflow.name);
                        const fullStageConfig = stages.find(s => (s.stage_id || s.agent_id) === checkpoint.workflow.currentStage);
                        const currentIdx = stages.findIndex(s => (s.stage_id || s.agent_id) === checkpoint.workflow.currentStage);
                        const nextStage = stages[currentIdx + 1];
                        if (!nextStage) {
                          checkpointManager.completeCheckpoint(currentCheckpointID);
                          currentCheckpointID = null;
                          collaborationId = null;
                        } else {
                          await triggerAfterHook(sessionID, fullStageConfig || { agent_id: sessionAgent, stage_id: checkpoint.workflow.currentStage }, currentCheckpointID);
                        }
                      }
                    }
                    continue;
                  }
                }
              }

              // 不在 workflow 中，单独 agent 执行
              const agentConfig = configManager.getAgentConfig(sessionAgent);
              if (agentConfig?.workflow && agentConfig.workflow.length > 0) {
                // TODO: 处理单独 agent 的 step workflow
              }

              closeSessionCheckpoint(sessionID);
            } else if (status.type === 'busy') {
              if (sessionCheckpoint?.state === SessionCheckpointState.PENDING_IDLE) {
                sessionCheckpoint.state = SessionCheckpointState.RUNNING;
              }
            }
          }
        } catch (err) {
          console.error('[AET] event handler error:', err?.message || err);
        }
      }
    })().catch(err => console.error('[AET] event subscribe error:', err));

    // ============================================
    // cleanup
    // ============================================
    return () => {
      abortController.abort();
      try { traceLogger.uninstall?.(); } catch { /* ignore */ }
    };
  },
});

// ============================================
// Helpers
// ============================================

// 向 event.system 数组推送文本（V2 契约：必须为 {type:'text', text} 对象）
function pushText(systemArr, text) {
  if (!Array.isArray(systemArr)) return;
  systemArr.push({ type: 'text', text });
}
