/**
 * CheckpointManager - Workflow Checkpoint 状态管理器
 *
 * 从 aet.js 抽离的断点状态持久化模块。
 * 管理 WorkflowCheckpoint 的状态，存储在项目 .aet/checkpoint/ 目录下
 * 支持同一阶段多次执行（executions 数组）
 */

const path = require('path');
const fs = require('fs');

const CHECKPOINT_VERSION = '1.0';

class CheckpointManager {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.checkpointDir = path.join(projectRoot, '.aet', 'checkpoint');
    this.ensureCheckpointDir();
  }

  ensureCheckpointDir() {
    if (!fs.existsSync(this.checkpointDir)) {
      fs.mkdirSync(this.checkpointDir, { recursive: true });
    }
    const archiveDir = path.join(this.checkpointDir, 'archive');
    if (!fs.existsSync(archiveDir)) {
      fs.mkdirSync(archiveDir, { recursive: true });
    }
  }

  // ============ Index 管理 ============

  getIndexPath() {
    return path.join(this.checkpointDir, 'index.json');
  }

  loadIndex() {
    const filePath = this.getIndexPath();
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (e) {
      console.error('[CheckpointManager] loadIndex error:', e.message);
    }
    return {
      version: CHECKPOINT_VERSION,
      lastUpdated: null,
      active: [],
      interrupted: [],
      recentCompleted: [],
    };
  }

  saveIndex(index) {
    const filePath = this.getIndexPath();
    index.lastUpdated = new Date().toISOString();
    try {
      this.ensureCheckpointDir();
      fs.writeFileSync(filePath, JSON.stringify(index, null, 2), 'utf-8');
    } catch (e) {
      // Silently ignore — checkpoint persistence is best-effort;
 	    // surfacing this to the UI degrades user experience.
    }
  }

  // ============ Run 生命周期 ============

  generateCheckpointID() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `checkpoint_${timestamp}_${random}`;
  }

  generateExecutionID() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 6);
    return `exec_${timestamp}_${random}`;
  }

  getCheckpointPath(checkpointID) {
    return path.join(this.checkpointDir, `${checkpointID}.json`);
  }

  getArchiveCheckpointPath(checkpointID) {
    return path.join(this.checkpointDir, 'archive', `${checkpointID}.json`);
  }

  createCheckpoint(workflowName, description) {
    const checkpointID = this.generateCheckpointID();
    const now = new Date().toISOString();

    const checkpoint = {
      version: CHECKPOINT_VERSION,
      workflow: {
        checkpointID,
        name: workflowName,
        description,
        currentStage: null,
        status: 'in_progress',
      },
      executions: {},
      history: [
        { ts: now, event: 'workflow_started', workflow: workflowName }
      ],
      startedAt: now,
      updatedAt: now,
      interruptedAt: null,
      completedAt: null,
    };

    this.saveCheckpoint(checkpoint);

    const index = this.loadIndex();
    index.active.push({
      checkpointID,
      workflow: workflowName,
      description,
      stage: null,
      step: null,
      startedAt: now,
      updatedAt: now,
    });
    this.saveIndex(index);

    return checkpointID;
  }

  getCheckpoint(checkpointID) {
    const filePath = this.getCheckpointPath(checkpointID);
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
      }
      const archivePath = this.getArchiveCheckpointPath(checkpointID);
      if (fs.existsSync(archivePath)) {
        const content = fs.readFileSync(archivePath, 'utf-8');
        return JSON.parse(content);
      }
    } catch (e) {
      console.error('[CheckpointManager] getCheckpoint error:', e.message);
    }
    return null;
  }

  saveCheckpoint(checkpoint) {
    const filePath = this.getCheckpointPath(checkpoint.workflow.checkpointID);
    checkpoint.updatedAt = new Date().toISOString();
    try {
      this.ensureCheckpointDir();
      fs.writeFileSync(filePath, JSON.stringify(checkpoint, null, 2), 'utf-8');
    } catch (e) {
      // Silently ignore — checkpoint persistence is best-effort;
 	    // surfacing this to the UI degrades user experience.
    }
  }

  updateCheckpoint(checkpointID, updates) {
    const checkpoint = this.getCheckpoint(checkpointID);
    if (!checkpoint) return null;
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'workflow' || key === 'executions' || key === 'feature') {
        checkpoint[key] = { ...checkpoint[key], ...value };
      } else {
        checkpoint[key] = value;
      }
    }
    this.saveCheckpoint(checkpoint);
    this.updateIndexEntry(checkpointID, checkpoint);
    return checkpoint;
  }

  updateIndexEntry(checkpointID, checkpoint) {
    const index = this.loadIndex();
    const activeIdx = index.active.findIndex(e => e.checkpointID === checkpointID);
    if (activeIdx >= 0) {
      index.active[activeIdx] = {
        checkpointID,
        workflow: checkpoint.workflow.name,
        description: checkpoint.workflow.description,
        stage: checkpoint.workflow.currentStage,
        step: this.getCurrentStepId(checkpoint),
        startedAt: checkpoint.startedAt,
        updatedAt: checkpoint.updatedAt,
      };
    }
    const interruptedIdx = index.interrupted.findIndex(e => e.checkpointID === checkpointID);
    if (interruptedIdx >= 0 && !checkpoint.interruptedAt) {
      index.interrupted.splice(interruptedIdx, 1);
      if (activeIdx < 0) {
        index.active.push({
          checkpointID,
          workflow: checkpoint.workflow.name,
          description: checkpoint.workflow.description,
          stage: checkpoint.workflow.currentStage,
          step: this.getCurrentStepId(checkpoint),
          startedAt: checkpoint.startedAt,
          updatedAt: checkpoint.updatedAt,
        });
      }
    }
    this.saveIndex(index);
  }

  getCurrentStepId(checkpoint) {
    const stage = checkpoint.workflow.currentStage;
    if (!stage) return null;
    const records = checkpoint.executions[stage]?.records;
    if (!records || records.length === 0) return null;
    const currentExec = records[records.length - 1];
    return currentExec?.currentStep || null;
  }

  completeCheckpoint(checkpointID) {
    const checkpoint = this.getCheckpoint(checkpointID);
    if (!checkpoint) return false;
    const now = new Date().toISOString();
    checkpoint.completedAt = now;
    checkpoint.workflow.status = 'completed';
    const archivePath = this.getArchiveCheckpointPath(checkpointID);
    try {
      this.ensureCheckpointDir();
      fs.writeFileSync(archivePath, JSON.stringify(checkpoint, null, 2), 'utf-8');
      fs.unlinkSync(this.getCheckpointPath(checkpointID));
    } catch (e) {
      // 静默处理 — checkpoint 持久化是 best-effort
    }
    const index = this.loadIndex();
    index.active = index.active.filter(e => e.checkpointID !== checkpointID);
    index.interrupted = index.interrupted.filter(e => e.checkpointID !== checkpointID);
    index.recentCompleted.unshift({
      checkpointID,
      workflow: checkpoint.workflow.name,
      description: checkpoint.workflow.description,
      completedAt: now,
    });
    if (index.recentCompleted.length > 10) {
      index.recentCompleted = index.recentCompleted.slice(0, 10);
    }
    this.saveIndex(index);
    return true;
  }

  interruptCheckpoint(checkpointID, resumeHint) {
    const checkpoint = this.getCheckpoint(checkpointID);
    if (!checkpoint) return false;
    const now = new Date().toISOString();
    checkpoint.interruptedAt = now;
    checkpoint.workflow.status = 'interrupted';
    // 同时标记当前 execution 为 interrupted（强制覆盖，即使已经是 completed）
    const currentStage = checkpoint.workflow.currentStage;
    if (currentStage && checkpoint.executions[currentStage]) {
      const execution = this.getCurrentExecution(checkpoint, currentStage);
      if (execution) {
        execution.status = 'interrupted';
        execution.completedAt = now;
        execution.result = 'Interrupted by user';
        // 同时标记当前 step 为 interrupted
        if (execution.currentStep && execution.steps[execution.currentStep]) {
          execution.steps[execution.currentStep] = {
            ...execution.steps[execution.currentStep],
            status: 'interrupted',
            completedAt: now,
          };
        }
      }
    }
    checkpoint.history.push({
      ts: now,
      event: 'workflow_interrupted',
      hint: resumeHint,
    });
    this.saveCheckpoint(checkpoint);
    const index = this.loadIndex();
    index.active = index.active.filter(e => e.checkpointID !== checkpointID);
    const interruptedEntry = {
      checkpointID,
      workflow: checkpoint.workflow.name,
      description: checkpoint.workflow.description,
      stage: checkpoint.workflow.currentStage,
      interruptedAt: now,
      resumeHint,
    };
    const existingIdx = index.interrupted.findIndex(e => e.checkpointID === checkpointID);
    if (existingIdx >= 0) {
      index.interrupted[existingIdx] = interruptedEntry;
    } else {
      index.interrupted.push(interruptedEntry);
    }
    this.saveIndex(index);
    return true;
  }

  // ============ Execution 管理 ============

  // 在传入的 checkpoint 对象上创建 execution（不读盘、不落盘），返回新建的 execution。
  // 调用方负责在所有变更完成后统一 saveCheckpoint / updateIndexEntry。
  startExecutionOn(checkpoint, stage, sessionID, agentId, context = null) {
    if (!checkpoint) return null;
    const now = new Date().toISOString();
    const executionId = this.generateExecutionID();
    if (!checkpoint.executions[stage]) {
      checkpoint.executions[stage] = { records: [] };
    }
    const execution = {
      executionId,
      sessionID,
      agentId,
      status: 'in_progress',
      startedAt: now,
      completedAt: null,
      result: null,
      context: context,  // handover context，用于没有 workflow 的 agent
      currentStep: null,
      steps: {},
    };
    checkpoint.executions[stage].records.push(execution);
    checkpoint.workflow.currentStage = stage;
    checkpoint.history.push({
      ts: now,
      event: 'execution_started',
      stage,
      executionId,
      sessionID,
    });
    return execution;
  }

  startExecution(checkpointID, stage, sessionID, agentId, context = null) {
    const checkpoint = this.getCheckpoint(checkpointID);
    if (!checkpoint) return null;
    const execution = this.startExecutionOn(checkpoint, stage, sessionID, agentId, context);
    this.saveCheckpoint(checkpoint);
    this.updateIndexEntry(checkpointID, checkpoint);
    return execution;
  }

  getCurrentExecution(checkpoint, stage) {
    if (!checkpoint || !checkpoint.executions[stage]) return null;
    const records = checkpoint.executions[stage].records;
    if (records.length === 0) return null;
    return records[records.length - 1];
  }

  completeExecution(checkpointID, stage, result) {
    const checkpoint = this.getCheckpoint(checkpointID);
    if (!checkpoint) return false;
    const execution = this.getCurrentExecution(checkpoint, stage);
    if (!execution) return false;
    const now = new Date().toISOString();
    execution.status = 'completed';
    execution.completedAt = now;
    execution.result = result;
    // 同时标记当前 step 为 completed
    if (execution.currentStep && execution.steps[execution.currentStep]) {
      execution.steps[execution.currentStep] = {
        ...execution.steps[execution.currentStep],
        status: 'completed',
        completedAt: now,
      };
    }
    checkpoint.history.push({
      ts: now,
      event: 'execution_completed',
      stage,
      executionId: execution.executionId,
      result,
    });
    this.saveCheckpoint(checkpoint);
    return true;
  }

  // ============ Step 管理 ============

  // 在传入的 checkpoint 对象上初始化当前 execution 的 steps（不读盘、不落盘）。
  initStepsOn(checkpoint, stage, stepConfigs, initialContext = null) {
    if (!checkpoint) return false;
    const execution = this.getCurrentExecution(checkpoint, stage);
    if (!execution) return false;
    for (const step of stepConfigs) {
      const stepId = step.step_id || step.name;
      execution.steps[stepId] = {
        status: 'pending',
        startedAt: null,
        completedAt: null,
        result: null,
        context: null,
      };
    }
    if (stepConfigs.length > 0) {
      const firstStepId = stepConfigs[0].step_id || stepConfigs[0].name;
      execution.steps[firstStepId] = {
        status: 'pending',  // 初始为 pending，chat.message hook 注入后变为 in_progress
        startedAt: null,
        completedAt: null,
        result: null,
        context: null,  // 非 resume 时，context 通过 executeStageHandover 的 prompt 发送，不保存到 step
      };
      execution.currentStep = firstStepId;
      // 不记录 step_started 事件，等 chat.message hook 注入后再记录
    }
    return true;
  }

  initSteps(checkpointID, stage, stepConfigs, initialContext = null) {
    const checkpoint = this.getCheckpoint(checkpointID);
    if (!checkpoint) return false;
    const ok = this.initStepsOn(checkpoint, stage, stepConfigs, initialContext);
    if (!ok) return false;
    this.saveCheckpoint(checkpoint);
    this.updateIndexEntry(checkpointID, checkpoint);
    return true;
  }

  getCurrentStep(checkpointID, stage) {
    const checkpoint = this.getCheckpoint(checkpointID);
    if (!checkpoint) return null;
    const execution = this.getCurrentExecution(checkpoint, stage);
    if (!execution || !execution.currentStep) return null;
    return {
      stepId: execution.currentStep,
      ...execution.steps[execution.currentStep],
    };
  }

  advanceStep(checkpointID, stage, stepId, stepResult, { idleDriven = false } = {}) {
    const checkpoint = this.getCheckpoint(checkpointID);
    if (!checkpoint) return false;
    const execution = this.getCurrentExecution(checkpoint, stage);
    if (!execution) return false;
    const now = new Date().toISOString();
    if (execution.currentStep) {
      execution.steps[execution.currentStep] = {
        ...execution.steps[execution.currentStep],
        status: 'completed',
        completedAt: now,
        result: stepResult,
      };
      checkpoint.history.push({
        ts: now,
        event: 'step_completed',
        stage,
        executionId: execution.executionId,
        step: execution.currentStep,
      });
    }
    execution.currentStep = stepId;
    if (stepId) {
      if (idleDriven) {
        // idle 驱动模式：下一步设为 pending，由 idle handler 在下次 idle 时
        // 注入 step 指令并推进到 in_progress（pending→in_progress + step_started 事件）。
        // 不在此处设 startedAt / 推 step_started，避免 idle handler 误判该 step
        // "已在执行中 + idle → 触发 after hook"，从而跳过本步骤的实际执行。
        execution.steps[stepId] = {
          ...execution.steps[stepId],
          status: 'pending',
          startedAt: null,
          completedAt: null,
          context: stepResult,
        };
      } else {
        // 直接推进模式：下一步立即设为 in_progress，并记录 step_started 事件
        execution.steps[stepId] = {
          ...execution.steps[stepId],
          status: 'in_progress',
          startedAt: now,
          context: stepResult,
        };
        checkpoint.history.push({
          ts: now,
          event: 'step_started',
          stage,
          executionId: execution.executionId,
          step: stepId,
        });
      }
    }
    this.saveCheckpoint(checkpoint);
    this.updateIndexEntry(checkpointID, checkpoint);
    return true;
  }

  completeAllSteps(checkpointID, stage) {
    const checkpoint = this.getCheckpoint(checkpointID);
    if (!checkpoint) return false;
    const execution = this.getCurrentExecution(checkpoint, stage);
    if (!execution) return false;
    execution.currentStep = null;
    checkpoint.history.push({
      ts: new Date().toISOString(),
      event: 'all_steps_completed',
      stage,
      executionId: execution.executionId,
    });
    this.saveCheckpoint(checkpoint);
    return true;
  }

  skipRemainingSteps(checkpointID, stage) {
    const checkpoint = this.getCheckpoint(checkpointID);
    if (!checkpoint) return false;
    const execution = this.getCurrentExecution(checkpoint, stage);
    if (!execution) return false;
    const now = new Date().toISOString();
    for (const [stepId, stepState] of Object.entries(execution.steps)) {
      if (stepState.status !== 'completed') {
        execution.steps[stepId] = {
          ...stepState,
          status: 'skipped',
          completedAt: now,
          result: 'Skipped - workflow ended early',
        };
      }
    }
    execution.currentStep = null;
    checkpoint.history.push({
      ts: now,
      event: 'workflow_ended_early',
      stage,
      executionId: execution.executionId,
    });
    this.saveCheckpoint(checkpoint);
    return true;
  }

  // ============ 状态查询 ============

  getActiveCheckpoints() {
    const index = this.loadIndex();
    return index.active;
  }

  getInterruptedCheckpoints() {
    const index = this.loadIndex();
    return index.interrupted;
  }

  findCheckpointBySessionID(sessionID) {
    const index = this.loadIndex();
    const allCheckpoints = [...index.active, ...index.interrupted];
    for (const entry of allCheckpoints) {
      const checkpoint = this.getCheckpoint(entry.checkpointID);
      if (checkpoint) {
        for (const stageRecords of Object.values(checkpoint.executions)) {
          for (const record of stageRecords.records) {
            if (record.sessionID === sessionID) {
              return entry.checkpointID;
            }
          }
        }
      }
    }
    return null;
  }

  findAgentBySessionID(sessionID) {
    const index = this.loadIndex();
    const allCheckpoints = [...index.active, ...index.interrupted];
    for (const entry of allCheckpoints) {
      const checkpoint = this.getCheckpoint(entry.checkpointID);
      if (checkpoint) {
        for (const stageRecords of Object.values(checkpoint.executions)) {
          for (const record of stageRecords.records) {
            if (record.sessionID === sessionID) {
              return record.agentId;
            }
          }
        }
      }
    }
    return null;
  }

  getResumableCheckpoints() {
    const index = this.loadIndex();
    return [...index.active, ...index.interrupted];
  }

  getResumePrompt(checkpointID, stage = null, step = null) {
    const checkpoint = this.getCheckpoint(checkpointID);
    if (!checkpoint) return null;
    const currentStage = stage || checkpoint.workflow.currentStage;
    const execution = this.getCurrentExecution(checkpoint, currentStage);
    const currentStep = step || execution?.currentStep;
    let prompt = `## Resume Workflow Checkpoint\n\n`;
    prompt += `**Checkpoint ID**: ${checkpointID}\n`;
    prompt += `**Workflow**: ${checkpoint.workflow.name}\n`;
    prompt += `**Description**: ${checkpoint.workflow.description}\n`;
    prompt += `\n**Current Stage**: ${currentStage}\n`;
    prompt += `**Agent**: ${execution?.agentId || 'unknown'}\n`;
    // Step 任务与 step context 由 chat.message 的 injectCurrentStep 统一注入，这里不再重复。
    // 只补充「跨阶段交接 context」（execution 级，来自上一阶段 agent_handover），且与 Description 不同时才显示。
    const execCtx = execution?.context;
    const execCtxStr = execCtx == null ? '' : (typeof execCtx === 'string' ? execCtx : JSON.stringify(execCtx, null, 2));
    if (execCtxStr.trim() && execCtxStr.trim() !== String(checkpoint.workflow.description || '').trim()) {
      prompt += `\n### Handover Context:\n${execCtxStr}\n`;
    }
    if (checkpoint.interruptedAt) {
      const index = this.loadIndex();
      const entry = index.interrupted.find(e => e.checkpointID === checkpointID);
      if (entry?.resumeHint) {
        prompt += `\n### Resume Hint:\n${entry.resumeHint}\n`;
      }
    }
    prompt += `\nPlease continue from where the workflow was interrupted.\n`;
    return prompt;
  }
}

module.exports = { CheckpointManager, CHECKPOINT_VERSION };
