/**
 * AET xiaoO Workflow Start Tool
 *
 * 与 opencode workflow_start (aet.js L1066-1125) 对齐：
 * - name 可以是 scenario（如 "aet-prd"）或有 workflow steps 的 agent（如 "aet-design"）
 * - scenario 模式：取首阶段 agent，创建 checkpoint
 * - agent 模式：直接启动该 agent 的 workflow steps
 * - 都不匹配：返回错误
 */

'use strict';

const path = require('path');
const { resolveProjectRoot, readStdinJson, outputError, AET_ROOT } = require('../tool-utils');

const lib = (name) => require(path.join(AET_ROOT, '.platform/utils', name));

const { ConfigManager } = lib('config-manager');
const { CheckpointManager } = lib('checkpoint-manager');
const { WorkflowEngine } = lib('workflow-engine');
const { StateStore } = require('../state-store');

async function main() {
  try {
    const input = await readStdinJson();
    const { name, context } = input.args || input;
    const projectRoot = resolveProjectRoot();

    if (!name) {
      outputError('缺少 name 参数');
      return;
    }

    const configManager = new ConfigManager();
    configManager.reloadConfig(projectRoot);
    const checkpointManager = new CheckpointManager(projectRoot);
    const workflowEngine = new WorkflowEngine(configManager, checkpointManager);
    const stateStore = new StateStore(projectRoot);

    // 与 opencode workflow_start (aet.js L1076-1080) 对齐：
    // name 解析为 scenario 或单 agent
    const scenario = workflowEngine.getScenarioConfig(name);
    const isScenario = !!scenario;
    const agentCfg = isScenario ? null : configManager.getAgentConfig(name);

    // 既不是 scenario 也不是有 workflow 的 agent → 报错
    if (!isScenario && (!agentCfg?.workflow || agentCfg.workflow.length === 0)) {
      const scenarios = Object.keys(configManager.getScenarios()).filter(k => !k.startsWith('_'));
      outputError(`"${name}" 不是有效的 scenario 或有步骤的 agent。可用 scenario: ${scenarios.join(', ')}`);
      return;
    }

    // 确定首阶段 agent
    let targetAgent;
    if (isScenario) {
      const stages = workflowEngine.getScenarioWorkflow(name);
      if (!stages || stages.length === 0) {
        outputError(`Scenario "${name}" 没有工作流阶段`);
        return;
      }
      targetAgent = stages[0].agent_id;
    } else {
      targetAgent = name;
    }

    // 创建 checkpoint（与 opencode aet.js L1115 对齐）
    const desc = typeof context === 'string' ? context : (context != null ? JSON.stringify(context) : '');
    const checkpointID = checkpointManager.createCheckpoint(name, desc);

    // 启动首阶段 execution
    // sessionID：优先从 StateStore 读取真实 xiaoO session_id，否则生成描述性 ID
    const realSessionID = stateStore.getCurrentSessionID(projectRoot);
    const sessionID = realSessionID || `aet-${targetAgent}-${Date.now()}`;
    checkpointManager.startExecution(
      checkpointID,
      targetAgent,
      sessionID,
      targetAgent,
      desc
    );

    // 初始化 steps（与 opencode bootstrapAgentCheckpoint aet.js L607 对齐）
    const agentConfig = configManager.getAgentConfig(targetAgent);
    const hasSteps = agentConfig?.workflow?.length > 0;
    if (hasSteps) {
      checkpointManager.initSteps(checkpointID, targetAgent, agentConfig.workflow);

      // idle 驱动模式：首步保持 pending，由 idle handler 在下次 idle 时
      // 通过 send_prompt 注入首步指令（pending→in_progress），与后续 step 完全一致。
      // 首步 context 设为 desc（用户原始需求），供 idle handler 注入时使用。
      // 不在此处设 startedAt / 推 step_started，避免 idle handler 误判该 step
      // "已在执行中 + idle → 触发 after hook"，从而跳过首步的实际执行。
      const cp = checkpointManager.getCheckpoint(checkpointID);
      const cpExecution = checkpointManager.getCurrentExecution(cp, targetAgent);
      const firstStepId = agentConfig.workflow[0].step_id || agentConfig.workflow[0].name;
      if (cpExecution && cpExecution.steps[firstStepId]) {
        cpExecution.steps[firstStepId] = {
          ...cpExecution.steps[firstStepId],
          status: 'pending',
          context: desc || null,  // 用户原始需求，供 idle handler 注入时使用
        };
        checkpointManager.saveCheckpoint(cp);
      }
    }

    // 保存到 current-checkpoint（兼容单 session 场景）
    stateStore.setCurrentCheckpointID(projectRoot, checkpointID);

    // idle 驱动模式：不返回 instruction，引导 LLM 结束当前回复。
    // 首步指令由 idle handler 在下次 idle 时通过 send_prompt 注入（独立 user message，
    // 与后续 step 一致），避免指令"埋"在工具返回值中导致首步行为与其他 step 不一致。
    process.stdout.write(JSON.stringify({
      success: true,
      checkpointID,
      agentId: targetAgent,
      message: `Workflow "${name}" started. 请立即结束当前session到idle状态，系统将自动注入首步骤指令。`,
    }, null, 2) + '\n');
  } catch (e) {
    outputError(e.message);
  }
}

main();
