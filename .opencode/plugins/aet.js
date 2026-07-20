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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================
// Project Analysis Injection (Resilient)
// ============================================

function ensureStringPath(input) {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object' && input.path) return input.path;
  return null;
}

function detectProjectAnalysisFolder(projectRoot) {
  try {
    const root = ensureStringPath(projectRoot);
    if (!root) return false;
    const analysisDir = path.join(root, '.aet', 'project-analysis');
    return fs.existsSync(analysisDir);
  } catch (err) {
    console.error('[AET] detectProjectAnalysisFolder error:', err.message);
    return false;
  }
}

function extractFrontmatter(content) {
  if (!content || typeof content !== 'string') {
    return '';
  }
  try {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    return match ? match[1] : '';
  } catch (err) {
    console.error('[AET] extractFrontmatter error:', err.message);
    return '';
  }
}

function readMarkdownFile(filePath) {
  if (!filePath) return null;
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error('[AET] readMarkdownFile error:', err.message);
    return null;
  }
}

function readMarkdownMetadata(filePath) {
  const content = readMarkdownFile(filePath);
  if (!content) return null;
  const metadata = extractFrontmatter(content);
  return metadata || null;
}

function extractDescriptionFromFrontmatter(frontmatter) {
  if (!frontmatter || typeof frontmatter !== 'string') return null;
  const match = frontmatter.match(/^description:\s*(?:["'](.+?)["']|(.+))$/m);
  return match ? (match[1] || match[2]).trim() : null;
}

function findCaseInsensitiveFile(dirPath, filename) {
  if (!dirPath || !filename) return null;
  try {
    if (!fs.existsSync(dirPath)) return null;
    const lowerTarget = filename.toLowerCase();
    const files = fs.readdirSync(dirPath);
    const match = files.find(f => f.toLowerCase() === lowerTarget);
    return match ? path.join(dirPath, match) : null;
  } catch (err) {
    console.error('[AET] findCaseInsensitiveFile error:', err.message);
    return null;
  }
}

function getMarkdownFiles(dirPath) {
  if (!dirPath) return [];
  try {
    if (!fs.existsSync(dirPath)) {
      return [];
    }
    const files = fs.readdirSync(dirPath);
    return files.filter(f => f && f.toLowerCase().endsWith('.md')).map(f => path.join(dirPath, f));
  } catch (err) {
    console.error('[AET] getMarkdownFiles error:', err.message);
    return [];
  }
}

function formatProjectAnalysis(projectRoot) {
  try {
    const root = ensureStringPath(projectRoot);
    if (!root) return null;
    
    const analysisDir = path.join(root, '.aet', 'project-analysis');
    
    if (!fs.existsSync(analysisDir)) {
      return null;
    }

    const architecturePath = findCaseInsensitiveFile(analysisDir, 'Architecture.md');
    const modulesPath = findCaseInsensitiveFile(analysisDir, 'Modules.md');
    const componentsDir = path.join(analysisDir, 'components');
    const principlesDir = path.join(analysisDir, 'principles');

    let output = '<project-analysis>\n';

    const architectureContent = architecturePath ? readMarkdownFile(architecturePath) : null;
    if (architectureContent) {
      output += `\n<architecture>\n`;
      output += `<path>${architecturePath}</path>\n`;
      output += `<content>${architectureContent}</content>\n`;
      output += `</architecture>\n`;
    }

    const modulesContent = modulesPath ? readMarkdownFile(modulesPath) : null;
    if (modulesContent) {
      output += `\n<modules>\n`;
      output += `<path>${modulesPath}</path>\n`;
      output += `<content>${modulesContent}</content>\n`;
      output += `</modules>\n`;
    }

    const componentFiles = getMarkdownFiles(componentsDir);
    const validComponents = [];
    for (const filePath of componentFiles) {
      const metadata = readMarkdownMetadata(filePath);
      if (metadata && metadata.trim().length > 0) {
        const description = extractDescriptionFromFrontmatter(metadata);
        validComponents.push({ filePath, description });
      }
    }
    
    if (validComponents.length > 0) {
      output += `\n<components>\n`;
      for (const item of validComponents) {
        if (item.description) {
          output += `<item>\n`;
          output += `<path>${item.filePath}</path>\n`;
          output += `<description>${item.description}</description>\n`;
          output += `</item>\n`;
        }
      }
      output += `</components>\n`;
    }
    const principleFiles = getMarkdownFiles(principlesDir);
    const validPrinciples = [];
    for (const filePath of principleFiles) {
      const metadata = readMarkdownMetadata(filePath);
      if (metadata && metadata.trim().length > 0) {
        const description = extractDescriptionFromFrontmatter(metadata);
        validPrinciples.push({ filePath, description });
      }
    }
    
    if (validPrinciples.length > 0) {
      output += `\n<principles>\n`;
      for (const item of validPrinciples) {
        if (item.description) {
          output += `<item>\n`;
          output += `<path>${item.filePath}</path>\n`;
          output += `<description>${item.description}</description>\n`;
          output += `</item>\n`;
        }
      }
      output += `</principles>\n`;
    }

    output += '</project-analysis>';

    return output;
  } catch (err) {
    console.error('[AET] formatProjectAnalysis error:', err.message);
    return null;
  }
}

// ============================================
// Config Loading
// ============================================

class ConfigManager {
  constructor() {
    this.config = this.loadConfig();
  }

  reloadConfig(directory) {
    this.config = this.loadConfig(directory);
  }

  // 获取全局工作流模板路径 (~/.aet/templates/workflow.json)
  findGlobalWorkflowTemplatePath() {
    const homeDir = os.homedir();
    let workflowTemplatePath;
    if (process.platform === 'win32') {
      workflowTemplatePath = path.join(process.env.USERPROFILE || process.env.APPDATA || homeDir, '.aet', 'templates', 'workflow.json');
    } else {
      workflowTemplatePath = path.join(homeDir, '.aet', 'templates', 'workflow.json');
    }

    if (fs.existsSync(workflowTemplatePath)) {
      return { path: workflowTemplatePath, metadata: { strategy: 'global_workflow_template', priority: 10 } };
    }
    return { path: null, metadata: { strategy: 'global_workflow_template', priority: 10 } };
  }

  // 获取项目级工作流模板路径 (项目/.aet/templates/workflow.json)
  findProjectWorkflowTemplatePath(projectRoot) {
    const projectTemplatePath = path.join(projectRoot, '.aet', 'templates', 'workflow.json');
    if (fs.existsSync(projectTemplatePath)) {
      return { path: projectTemplatePath, metadata: { strategy: 'project_workflow_template', priority: 20 } };
    }
    // 尝试当前工作目录
    const cwdTemplatePath = path.join(process.cwd(), '.aet', 'templates', 'workflow.json');
    if (fs.existsSync(cwdTemplatePath)) {
      return { path: cwdTemplatePath, metadata: { strategy: 'project_workflow_template', priority: 20 } };
    }
    return { path: null, metadata: { strategy: 'project_workflow_template', priority: 20 } };
  }

  // 加载工作流模板
  loadWorkflowTemplate(templatePath) {
    if (!templatePath) {
      return { config: {}, error: null };
    }
    try {
      const content = fs.readFileSync(templatePath, 'utf-8');
      const parsed = JSON.parse(content);
      return { config: parsed, error: null };
    } catch (error) {
      console.error('[AET] Workflow template load error:', error.message);
      return { config: {}, error };
    }
  }

  // 加载并合并工作流模板（全局 + 项目级）
  loadAndMergeWorkflowTemplates(projectRoot) {
    // 1. 加载全局工作流模板
    const globalTemplateResult = this.loadWorkflowTemplate(this.findGlobalWorkflowTemplatePath().path);
    const globalTemplate = globalTemplateResult.config;

    // 2. 加载项目级工作流模板
    const projectTemplateResult = this.loadWorkflowTemplate(this.findProjectWorkflowTemplatePath(projectRoot).path);
    const projectTemplate = projectTemplateResult.config;

    // 3. 合并：项目级优先（重名时项目级覆盖全局）
    return this.mergeWorkflowTemplates(globalTemplate, projectTemplate);
  }

  // 合并工作流模板（项目级优先）
  mergeWorkflowTemplates(globalTemplate, projectTemplate) {
    if (!projectTemplate || Object.keys(projectTemplate).length === 0) {
      return globalTemplate || {};
    }
    if (!globalTemplate || Object.keys(globalTemplate).length === 0) {
      return projectTemplate;
    }

    const merged = {
      version: projectTemplate.version || globalTemplate.version || '1.0',
      scenarios: { ...globalTemplate.scenarios, ...projectTemplate.scenarios },
      hooks: { ...globalTemplate.hooks, ...projectTemplate.hooks },
      agents: { ...globalTemplate.agents, ...projectTemplate.agents },
    };

    return merged;
  }

  // 查找项目配置路径
  findProjectConfigPath(projectRoot) {
    const configPath = path.join(projectRoot, '.aet', 'config.json');
    if (fs.existsSync(configPath)) {
      return configPath;
    }
    // 尝试当前工作目录
    const cwdConfigPath = path.join(process.cwd(), '.aet', 'config.json');
    if (fs.existsSync(cwdConfigPath)) {
      return cwdConfigPath;
    }
    return null;
  }

  // 合并配置：项目配置 + 工作流模板（全局+项目级已合并）
  // 优先级：项目 config.json > 项目 templates/workflow.json > 全局 templates/workflow.json
  mergeConfigs(projectConfig, workflowConfig) {
    const mergedConfig = {};

    // 版本号：优先项目配置
    mergedConfig.version = projectConfig?.version || workflowConfig?.version || '1.0';

    // 工作流相关配置：项目配置优先，其次工作流模板
    // 注意：如果项目 config.json 中定义了同名工作流，会完全覆盖模板中的定义
    mergedConfig.scenarios = {
      ...workflowConfig?.scenarios || {},
      ...projectConfig?.scenarios || {},
    };

    mergedConfig.hooks = {
      ...workflowConfig?.hooks || {},
      ...projectConfig?.hooks || {},
    };

    mergedConfig.agents = {
      ...workflowConfig?.agents || {},
      ...projectConfig?.agents || {},
    };

    mergedConfig.configPath = projectConfig?.configPath || null;

    return mergedConfig;
  }

  loadConfig(directory) {
    const projectRoot = directory || process.cwd();

    // 1. 加载并合并工作流模板（全局 + 项目级）
    const workflowConfig = this.loadAndMergeWorkflowTemplates(projectRoot);

    // 2. 加载项目配置 (.aet/config.json)
    const projectConfigPath = this.findProjectConfigPath(projectRoot);
    let projectConfig = {};
    if (projectConfigPath) {
      try {
        const content = fs.readFileSync(projectConfigPath, 'utf-8');
        const parsed = JSON.parse(content);
        projectConfig = {
          version: parsed.version || '1.0',
          scenarios: parsed.scenarios || {},
          agents: parsed.agents || {},
          hooks: parsed.hooks || {},
          projectAnalysis: parsed.projectAnalysis || { enabled: true },
          configPath: projectConfigPath,
        };
      } catch (error) {
        console.error('[AET] Project config load error:', error.message);
      }
    }

    // 3. 合并配置（项目配置优先）
    const mergedConfig = this.mergeConfigs(projectConfig, workflowConfig);

    if (Object.keys(mergedConfig).length === 0 || !mergedConfig.scenarios) {
      return {
        version: '1.0',
        scenarios: {},
        agents: {},
        hooks: {},
        projectAnalysis: { enabled: true },
        configPath: null,
      };
    }
    
    if (!mergedConfig.projectAnalysis) {
      mergedConfig.projectAnalysis = { enabled: true };
    }
    
    return mergedConfig;
  }

  getHooks() {
    return this.config.hooks;
  }

  getScenarios() {
    return this.config.scenarios;
  }

  getAgentConfig(agentName) {
    return this.config.agents[agentName] || null;
  }

  getAllAgents() {
    return this.config.agents;
  }

  getConfigPath() {
    return this.config.configPath;
  }

  // 加载全局配置 (~/.aet/config.json) — 与项目级 config 分离
  // 全局配置包含 trace、codePlatform、knowledgeGraph 等跨项目设置
  _globalConfig = null;

  loadGlobalConfig() {
    const homeDir = os.homedir();
    const globalConfigPath = process.platform === 'win32'
      ? path.join(process.env.USERPROFILE || process.env.APPDATA || homeDir, '.aet', 'config.json')
      : path.join(homeDir, '.aet', 'config.json');

    if (fs.existsSync(globalConfigPath)) {
      try {
        this._globalConfig = JSON.parse(fs.readFileSync(globalConfigPath, 'utf-8'));
      } catch (err) {
        console.error('[AET] Global config load error:', err.message);
        this._globalConfig = {};
      }
    } else {
      this._globalConfig = {};
    }
    return this._globalConfig;
  }

  getGlobalConfig() {
    if (!this._globalConfig) this.loadGlobalConfig();
    return this._globalConfig;
  }

  isTraceEnabled() {
    const global = this.getGlobalConfig();
    // Default to true if not explicitly set
    return global?.trace?.enabled !== false;
  }
}

const configManager = new ConfigManager();

// ============================================
// CheckpointManager - Workflow Checkpoint 状态管理器
// ============================================
// 管理 WorkflowCheckpoint 的状态，存储在项目 .aet/checkpoint/ 目录下
// 支持同一阶段多次执行（executions 数组）

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
      fs.writeFileSync(filePath, JSON.stringify(index, null, 2), 'utf-8');
    } catch (e) {
      console.error('[CheckpointManager] saveIndex error:', e.message);
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
      fs.writeFileSync(filePath, JSON.stringify(checkpoint, null, 2), 'utf-8');
    } catch (e) {
      console.error('[CheckpointManager] saveCheckpoint error:', e.message);
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
      fs.writeFileSync(archivePath, JSON.stringify(checkpoint, null, 2), 'utf-8');
      fs.unlinkSync(this.getCheckpointPath(checkpointID));
    } catch (e) {
      console.error('[CheckpointManager] completeCheckpoint archive error:', e.message);
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

  advanceStep(checkpointID, stage, stepId, stepResult) {
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
      execution.steps[stepId] = {
        ...execution.steps[stepId],
        status: 'in_progress',
        startedAt: now,
        context: stepResult,  // 把上一个 step 的 result 作为新 step 的 context（用于 resume）
      };
      checkpoint.history.push({
        ts: now,
        event: 'step_started',
        stage,
        executionId: execution.executionId,
        step: stepId,
      });
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

class WorkflowEngine {
  constructor(cfgManager) {
    this.configManager = cfgManager;
  }

  getScenarioConfig(scenarioName) {
    const scenarios = this.configManager.getScenarios();
    return scenarios[scenarioName] || null;
  }

  getScenarioWorkflow(scenarioName) {
    const scenario = this.getScenarioConfig(scenarioName);
    if (!scenario) return [];
    return scenario.workflow || [];
  }

  getStageNames(scenarioName) {
    const stages = this.getScenarioWorkflow(scenarioName);
    return stages.map(s => s.stage_id || s.agent_id);
  }

  getStageByIndex(scenarioName, index) {
    const stages = this.getScenarioWorkflow(scenarioName);
    return stages[index] || null;
  }

  getHookConfig(hookName) {
    const hooks = this.configManager.getHooks();
    return hooks[hookName] || null;
  }

  startScenario(scenarioName, description) {
    const scenario = this.getScenarioConfig(scenarioName);
    if (!scenario) {
      return {
        success: false,
        error: `Scenario "${scenarioName}" not found. Available: ${Object.keys(this.configManager.getScenarios()).join(', ')}`,
      };
    }

    const stages = this.getScenarioWorkflow(scenarioName);
    if (stages.length === 0) {
      return { success: false, error: 'Scenario has no workflow stages' };
    }

    // 使用 CheckpointManager 创建 checkpoint
    currentCheckpointID = checkpointManager.createCheckpoint(scenarioName, description);

    return {
      success: true,
      checkpointID: currentCheckpointID,
      workflow: scenarioName,
      workflowInfo: { name: scenario.name, description: scenario.description },
      firstStage: stages[0],
      message: `Capability scenario "${scenarioName}" started`,
    };
  }

  getStatus() {
    if (!currentCheckpointID || !checkpointManager) {
      return { active: false };
    }
    const checkpoint = checkpointManager.getCheckpoint(currentCheckpointID);
    if (!checkpoint) {
      return { active: false };
    }
    return {
      active: true,
      checkpointID: currentCheckpointID,
      workflow: checkpoint.workflow.name,
      currentStage: checkpoint.workflow.currentStage,
      status: checkpoint.workflow.status,
    };
  }
}

const workflowEngine = new WorkflowEngine(configManager);

// ============================================
// Trace Logging — LLM request/response recording
// ============================================
// Saves to ~/.aet/log/trace/ with per-session directories.
// Structure:
//   ~/.aet/log/trace/
//     config.json
//     ses_<sessionId>/1.json, 2.json, ..., metadata.json
//
// Intercept globalThis.fetch to capture all LLM calls,
// record request/response as numbered JSON files.

const TRACE_DIR = path.join(os.homedir(), '.aet', 'log', 'trace');

const SENSITIVE_HEADERS = [
  'authorization', 'api-key', 'x-api-key', 'apikey', 'x-apikey',
  'token', 'x-token', 'access-token', 'x-access-token',
  'secret', 'x-secret', 'cookie',
];

function redactHeaders(headers) {
  if (process.env.AET_TRACE_REDACT === 'false') return headers;
  const result = {};
  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.includes(key.toLowerCase())) {
      result[key] = value.toLowerCase().startsWith('bearer ') ? 'Bearer [REDACTED]' : '[REDACTED]';
    } else {
      result[key] = value;
    }
  }
  return result;
}

class TraceLogger {
  constructor() {
    this.origFetch = globalThis.fetch;
    this.ids = new Map(); // sessionId -> last seq number
    this.installed = false;
  }

  install() {
    if (this.installed) return;
    // Always install interceptor; runtime enable/disable controlled by global config
    this.origFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => this._tracedFetch(input, init);
    this.installed = true;
    this._writeConfig();
    const enabled = configManager.isTraceEnabled();
    console.log('[AET] Trace logging installed →', TRACE_DIR, '(enabled:', enabled, ')');
  }

  uninstall() {
    if (!this.installed) return;
    globalThis.fetch = this.origFetch;
    this.installed = false;
  }

  // --- config.json ---
  _writeConfig() {
    try {
      fs.mkdirSync(TRACE_DIR, { recursive: true });
      const configPath = path.join(TRACE_DIR, 'config.json');
      if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, JSON.stringify({
          version: '1.0',
          createdAt: new Date().toISOString(),
          traceDir: TRACE_DIR,
        }, null, 2));
      }
    } catch (err) {
 console.error('[AET] trace config write error:', err.message);
    }
  }

  // --- per-session metadata.json ---
  _writeMetadata(sessionID) {
    const sessionDir = path.join(TRACE_DIR, `ses_${sessionID}`);
    try {
      fs.mkdirSync(sessionDir, { recursive: true });
      const metaPath = path.join(sessionDir, 'metadata.json');
      if (!fs.existsSync(metaPath)) {
        const meta = {
          sessionID,
          createdAt: new Date().toISOString(),
          checkpointID: currentCheckpointID || null,
          workflow: currentCheckpointID && checkpointManager
            ? checkpointManager.getCheckpoint(currentCheckpointID)?.workflow?.name || null
            : null,
        };
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
      } else {
        // Update checkpointID if it changed since metadata was first written
        try {
          const existing = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          const newCheckpointID = currentCheckpointID || null;
          const newWorkflow = currentCheckpointID && checkpointManager
            ? checkpointManager.getCheckpoint(currentCheckpointID)?.workflow?.name || null
            : null;
          if (existing.checkpointID !== newCheckpointID || existing.workflow !== newWorkflow) {
            existing.checkpointID = newCheckpointID;
            existing.workflow = newWorkflow;
            existing.updatedAt = new Date().toISOString();
            fs.writeFileSync(metaPath, JSON.stringify(existing, null, 2));
          }
        } catch { /* ignore read errors */ }
      }
    } catch (err) {
 console.error('[AET] trace metadata write error:', err.message);
    }
  }

  // --- parse request from fetch args ---
  _parseRequest(input, init) {
    try {
      return new Request(input, init);
    } catch {
      return null;
    }
  }

  _getSessionId(req) {
    return req.headers.get('x-opencode-session')
      || req.headers.get('x-session-affinity')
      || req.headers.get('session_id')
      || undefined;
  }

  _headersToObject(headers) {
    const obj = {};
    headers.forEach((value, key) => { obj[key] = value; });
    return obj;
  }

  _parseBody(text) {
    try { return JSON.parse(text); }
    catch { return text || null; }
  }

  _classifyPurpose(body) {
    if (typeof body === 'object' && body !== null && !Array.isArray(body)
      && Array.isArray(body.tools) && body.tools.length > 0) {
      return ''; // tool call — purpose is implied by tool name
    }
    return '[meta]';
  }

  // --- atomic write of seq.json ---
  _writeRecord(sessionID, seq, record) {
    const sessionDir = path.join(TRACE_DIR, `ses_${sessionID}`);
    try {
      fs.mkdirSync(sessionDir, { recursive: true });
      const tmpPath = path.join(sessionDir, `${seq}.json.tmp`);
      const finalPath = path.join(sessionDir, `${seq}.json`);
      fs.writeFileSync(tmpPath, JSON.stringify(record, null, 2));
      fs.renameSync(tmpPath, finalPath);
    } catch (err) {
 console.error('[AET] trace record write error:', err.message);
    }
  }

  // --- main fetch interceptor ---
  async _tracedFetch(input, init) {
    const req = this._parseRequest(input, init);
    if (!req) return this.origFetch(input, init);

    const sessionID = this._getSessionId(req);
    if (!sessionID || !configManager.isTraceEnabled() || !currentCheckpointID) return this.origFetch(input, init);

    // Assign seq number
    const seq = (this.ids.get(sessionID) ?? 0) + 1;
    this.ids.set(sessionID, seq);

    const requestAt = new Date().toISOString();
    const requestSentAt = performance.now();

    // Clone request body before sending
    const reqBodyText = await req.clone().text().catch(() => '');
    const reqBody = this._parseBody(reqBodyText);
    const purpose = this._classifyPurpose(reqBody);
    const isStream = typeof reqBody === 'object' && reqBody?.stream === true;

    const traceReq = {
      method: req.method,
      url: req.url,
      headers: redactHeaders(this._headersToObject(req.headers)),
      body: reqBody,
    };

    // Write metadata for this session on first trace
    this._writeMetadata(sessionID);

    // Execute the original fetch
    let res;
    try {
      res = await this.origFetch(input, init);
    } catch (err) {
      // Network error — record and rethrow
      const error = err instanceof Error
        ? { message: err.message }
        : { message: String(err) };
      this._writeRecord(sessionID, seq, {
        id: seq,
        purpose,
        requestAt,
        responseAt: new Date().toISOString(),
        request: traceReq,
        response: null,
        error,
        requestSentAt,
      });
      throw err;
    }

    // Stream responses: wrap to capture firstTokenAt / lastTokenAt
    let latencyMeta;
    if (isStream && res.body) {
      latencyMeta = { requestSentAt, firstTokenAt: null, lastTokenAt: null };
      const transform = new TransformStream({
        transform(chunk, controller) {
          if (latencyMeta.firstTokenAt === null) latencyMeta.firstTokenAt = performance.now();
          controller.enqueue(chunk);
        },
        flush() { latencyMeta.lastTokenAt = performance.now(); },
      });
      const wrappedBody = res.body.pipeThrough(transform);
      res = new Response(wrappedBody, { status: res.status, statusText: res.statusText, headers: res.headers });
      (res).__latencyMeta = latencyMeta;
    }

    // Fire-and-forget response recording (don't block the response stream)
    void this._recordResponse(sessionID, seq, purpose, requestAt, traceReq, res, latencyMeta);

    return res;
  }

  async _recordResponse(sessionID, seq, purpose, requestAt, traceReq, res, latencyMeta) {
    try {
      const resBodyText = await res.clone().text();
      const resBody = this._parseBody(resBodyText);
      const traceRes = {
        status: res.status,
        statusText: res.statusText,
        headers: redactHeaders(this._headersToObject(res.headers)),
        body: resBody,
      };

      // Grab latency from stream wrapper if present
      const latency = latencyMeta || res.__latencyMeta;

      this._writeRecord(sessionID, seq, {
        id: seq,
        purpose,
        requestAt,
        responseAt: new Date().toISOString(),
        request: traceReq,
        response: traceRes,
        error: null,
        requestSentAt: latency?.requestSentAt,
        firstTokenAt: latency?.firstTokenAt ?? undefined,
        lastTokenAt: latency?.lastTokenAt ?? undefined,
      });
    } catch (err) {
      const error = err instanceof Error
        ? { message: err.message }
        : { message: String(err) };
      const latency = latencyMeta || res.__latencyMeta;

      this._writeRecord(sessionID, seq, {
        id: seq,
        purpose,
        requestAt,
        responseAt: new Date().toISOString(),
        request: traceReq,
        response: null,
        error,
        requestSentAt: latency?.requestSentAt,
        firstTokenAt: latency?.firstTokenAt ?? undefined,
        lastTokenAt: latency?.lastTokenAt ?? undefined,
      });
    }
  }
}

const traceLogger = new TraceLogger();

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
  if (!nextStepConfig.before || nextStepConfig.before === 'auto') {
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
  // 初始化 TraceLogger（拦截 globalThis.fetch）
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
            configManager._globalConfig = null;
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
            configManager._globalConfig = null;
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
    },
  };
};

