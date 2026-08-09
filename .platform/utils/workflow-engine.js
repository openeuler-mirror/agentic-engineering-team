/**
 * WorkflowEngine - 工作流引擎
 *
 * 从 aet.js 抽离的工作流引擎模块。
 * 连接 ConfigManager（读取场景定义）和 CheckpointManager（管理运行状态）。
 *
 * 注意：原 aet.js 中 WorkflowEngine.startScenario 直接设置模块级 currentCheckpointID，
 * 抽离后改为通过构造函数注入 checkpointManager，startScenario 返回 checkpointID 由调用方设置。
 * getStatus 原来依赖模块级 currentCheckpointID，改为接收 checkpointID 参数。
 */

class WorkflowEngine {
  constructor(cfgManager, checkpointManager) {
    this.configManager = cfgManager;
    this._checkpointManager = checkpointManager;
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
    const checkpointID = this._checkpointManager.createCheckpoint(scenarioName, description);

    return {
      success: true,
      checkpointID,
      workflow: scenarioName,
      workflowInfo: { name: scenario.name, description: scenario.description },
      firstStage: stages[0],
      message: `Capability scenario "${scenarioName}" started`,
    };
  }

  getStatus(checkpointID) {
    if (!checkpointID || !this._checkpointManager) {
      return { active: false };
    }
    const checkpoint = this._checkpointManager.getCheckpoint(checkpointID);
    if (!checkpoint) {
      return { active: false };
    }
    return {
      active: true,
      checkpointID,
      workflow: checkpoint.workflow.name,
      currentStage: checkpoint.workflow.currentStage,
      status: checkpoint.workflow.status,
    };
  }
}

module.exports = { WorkflowEngine };
