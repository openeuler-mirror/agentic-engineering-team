/**
 * ConfigManager - 三层配置加载与合并
 *
 * 从 aet.js 抽离的配置管理模块。
 * 配置优先级：项目 config.json > 项目 templates/workflow.json > 全局 templates/workflow.json
 * 同时管理全局配置 (~/.aet/config.json)，包含 trace、codePlatform、knowledgeGraph 等跨项目设置
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

class ConfigManager {
  constructor() {
    this.config = this.loadConfig();
    this._globalConfig = null;
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

  // --- 全局配置 (~/.aet/config.json) ---

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

  invalidateGlobalConfig() {
    this._globalConfig = null;
  }

  isTraceEnabled() {
    const global = this.getGlobalConfig();
    return global?.trace?.enabled !== false;
  }
}

module.exports = { ConfigManager };
