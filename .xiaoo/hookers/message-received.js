/**
 * AET xiaoO *.Chat.message.received Hook
 *
 * 与 opencode chat.message（pendingCheckpointCmd 消费）对齐
 *
 * 职责：
 * 1. AET命令：消费 command-before 存储的 cmd-info 文件（与 opencode pendingCheckpointCmd 对齐）
 *    - Scenario → 引导 LLM 调用 workflow_start 工具（与 opencode 一致）
 *    - 单 agent with workflow → bootstrap checkpoint 或列出可恢复历史
 *    - 无 agent → accept 不修改
 * 2. 非AET命令：accept 不修改
 *
 * xiaoO 适配说明：
 * - opencode 通过 output.message.agent 路由到特定 agent
 * - xiaoO 本 hook 仅负责消息内容注入（step 上下文、checkpoint 恢复指令）
 * - agent 路由由 command-before（通过 frontmatter agent）和
 *   session-lifecycle-state（通过 send_prompt + subagent_role_id）处理
 *
 * xiaoO 协议：
 * - Input: { stage: "chat_message", session_id, message, prior_message_count, agent, model }
 * - Output: { result: "accept" } | { result: "transform", message: {...} }
 */

'use strict';

const path = require('path');
const {
  AET_ROOT,
  resolveProjectRoot,
  readPayload,
  writeResult,
  bootstrapAgentCheckpoint,
  listAgentResumableCheckpoints,
  buildCommandEntryPrompt,
  buildResumableCommandText,
  takeCurrentStepText,
} = require('../hook-utils');

const lib = (name) => require(path.join(AET_ROOT, '.platform/utils', name));

const { ConfigManager } = lib('config-manager');
const { StateStore } = require('../state-store');

function injectText(message, text) {
  const blocks = message.blocks || [];

  if (blocks.length > 0) {
    let injected = false;
    const newBlocks = blocks.map((b) => {
      if (b.type === 'text' && !injected) {
        injected = true;
        return { ...b, text: b.text + '\n\n' + text };
      }
      return b;
    });

    if (injected) {
      return { ...message, blocks: newBlocks };
    }
    // 没有 text block → 在第一个 block 前插入一个 text block
    return { ...message, blocks: [{ type: 'text', text: text }, ...blocks] };
  }

  // 无 blocks → 用 content 字段（兼容旧格式）
  const newContent = (message.content || '') + '\n\n' + text;
  return { ...message, content: newContent };
}

function main() {
  const payload = readPayload();

  if (!payload || payload.stage !== 'chat_message') {
    writeResult({ result: 'accept' });
    return;
  }

  try {
    const sessionId = payload.session_id || '';
    const message = payload.message || {};
    const projectRoot = resolveProjectRoot();
    if (!projectRoot) {
      writeResult({ result: 'accept' });
      return;
    }
    const stateStore = new StateStore(projectRoot);
    const configManager = new ConfigManager();
    configManager.reloadConfig(projectRoot);

    // 保存当前 session_id（供 tools 读取，tools 无法直接获取 xiaoO session_id）
    if (sessionId) {
      stateStore.setCurrentSessionID(projectRoot, sessionId);
    }

    // === AET命令场景 ===
    const commandInfo = stateStore.getCommandInfo(projectRoot, sessionId);
    if (commandInfo && commandInfo.command) {
      const agentId = commandInfo.agentId;
      const arguments_ = commandInfo.arguments || '';

      stateStore.clearCommandInfo(projectRoot, sessionId);

      if (agentId) {
        const scenarios = configManager.getScenarios();
        // scenario key 可能是 "design"/"implement"，而 agentId 是 "aet-design"/"aet-implement"
        // 需要同时检查原始 key 和去掉 "aet-" 前缀后的 key
        const strippedAgentId = agentId.startsWith('aet-') ? agentId.slice(4) : agentId;
        const isScenario = scenarios && (scenarios[agentId] || scenarios[strippedAgentId]);

        if (isScenario) {
          // 先检查是否有可恢复的 interrupted checkpoint（与 opencode 对齐）
          const { CheckpointManager } = lib('checkpoint-manager');
          const cm = new CheckpointManager(projectRoot);
          const index = cm.loadIndex();
          const interruptedCandidates = (index.interrupted || []).filter(e =>
            e.workflow === agentId || e.workflow === strippedAgentId || e.workflow === 'feature'
          );
          if (interruptedCandidates.length > 0) {
            // 有中断 checkpoint → 列出候选，让 LLM + 用户决定（与 aet-router 路径一致）
            const text = buildResumableCommandText(commandInfo.command, arguments_, interruptedCandidates, cm, '该 agent 可恢复的历史任务', agentId);
            const newMessage = injectText(message, text);
            writeResult({ result: 'transform', message: newMessage });
            return;
          }

          // 无中断 checkpoint → 引导 LLM 调用 workflow_start 工具（与 opencode 一致）
          // LLM 调用 workflow_start 后，工具结果在 TUI 可见；
          // 首步指令由 idle handler 通过 send_prompt 注入（idle 驱动模式）。
          let text = `<aet-command>\n**Command**: ${commandInfo.command}`;
          if (arguments_) text += `\n**Arguments**: ${arguments_}`;
          const escapedContext = JSON.stringify(arguments_ || '');
          text += `\n\n请调用 workflow_start({ name: "${strippedAgentId}", context: ${escapedContext} }) 启动工作流。`;
          text += `\n</aet-command>`;

          const newMessage = injectText(message, text);
          writeResult({ result: 'transform', message: newMessage });
          return;
        }

        // 单 agent：检查可恢复 checkpoint
        const agentConfig = configManager.getAgentConfig(agentId);
        const hasWorkflow = agentConfig?.workflow && agentConfig.workflow.length > 0;

        // aet-router 没有 workflow，但应该检查是否有 scenario 类型的可恢复 checkpoint
        // 与 opencode listAgentResumableCheckpoints 对齐：active + interrupted 都检查
        if (!hasWorkflow && agentId === 'aet-router') {
          const { CheckpointManager } = lib('checkpoint-manager');
          const cm = new CheckpointManager(projectRoot);
          const resumableCandidates = cm.getResumableCheckpoints()
            .filter(e => {
              // 筛选 scenario 类型的可恢复 checkpoint（feature、bugfix、aet-design 等）
              const scenarios = configManager.getScenarios();
              return scenarios && scenarios[e.workflow];
            })
            .filter(e => {
              // 排除已完成的
              const cp = cm.getCheckpoint(e.checkpointID);
              return cp && cp.workflow.status !== 'completed';
            })
            .sort((a, b) => new Date(b.updatedAt || b.startedAt) - new Date(a.updatedAt || a.startedAt));
          if (resumableCandidates.length > 0) {
            // 与 opencode buildCommandEntryPrompt 对齐：列出候选，让 LLM + 用户决定
            const text = buildResumableCommandText(commandInfo.command, arguments_, resumableCandidates, cm, '该 agent 可恢复的历史任务', agentId);
            const newMessage = injectText(message, text);
            writeResult({ result: 'transform', message: newMessage });
            return;
          }
        }

        if (hasWorkflow) {
          const candidates = listAgentResumableCheckpoints(projectRoot, agentId);

          if (candidates.length === 0) {
            // 无历史 → bootstrap checkpoint + 注入首步骤指令
            const cid = bootstrapAgentCheckpoint(projectRoot, agentId, arguments_, sessionId);
            if (cid) {
              const stepInstruction = takeCurrentStepText(projectRoot, cid);
              let text = arguments_ || '';
              if (stepInstruction) text += '\n\n' + stepInstruction;
              if (text) {
                const newMessage = injectText(message, text);
                writeResult({ result: 'transform', message: newMessage });
                return;
              }
            }
            writeResult({ result: 'accept' });
            return;
          }

          // 有历史 → 注入候选列表，让 LLM + 用户决定
          const prompt = buildCommandEntryPrompt(agentId, arguments_, candidates);
          const newMessage = injectText(message, arguments_ + prompt);
          writeResult({ result: 'transform', message: newMessage });
          return;
        }

        // 单 agent 无 workflow → accept（body 已由 command template 展开）
        writeResult({ result: 'accept' });
        return;
      }

      // 无 agent 的命令（如 /aet-init）→ accept（body 已由 command template 展开）
      writeResult({ result: 'accept' });
      return;
    }

    // === 非AET命令场景 ===
    writeResult({ result: 'accept' });
  } catch (e) {
    writeResult({ result: 'accept' });
  }
}

main();
