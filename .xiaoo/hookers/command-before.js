/**
 * AET xiaoO *.Chat.command.before Hook
 *
 * 与 opencode command.execute.before + pendingCheckpointCmd 对齐
 *
 * 职责：仅保存命令信息到 StateStore（cmd-info 文件），不做 checkpoint 操作。
 * 实际的 checkpoint bootstrap/恢复/step 注入由 message-received.js 消费时完成。
 *
 * 这与 opencode 的设计一致：
 * - command.execute.before → pendingCheckpointCmd.set(sessionID, { command, agentId, arguments })
 * - chat.message → 消费 pendingCheckpointCmd，执行 checkpoint 操作 + step 注入
 *
 * xiaoO 协议：
 * - Input: { stage: "command_before", command: "aet-auto", arguments: "...", body: "...", session_id: "..." }
 * - Output: { result: "allow" } | { result: "transform", body: "..." }
 */

'use strict';

const {
  resolveProjectRoot,
  readPayload,
  writeResult,
  isAETCommand,
} = require('../hook-utils');

const { StateStore } = require('../state-store');

function main() {
  const payload = readPayload();

  if (!payload || payload.stage !== 'command_before') {
    writeResult({ result: 'allow' });
    return;
  }

  try {
    const command = payload.command || '';
    const arguments_ = payload.arguments || '';
    const sessionId = payload.session_id || '';

    // 判断是否是 AET 命令
    const aetInfo = isAETCommand(command);
    if (!aetInfo) {
      writeResult({ result: 'allow' });
      return;
    }

    const projectRoot = resolveProjectRoot();
    if (!projectRoot) {
      writeResult({ result: 'allow' });
      return;
    }
    const stateStore = new StateStore(projectRoot);

    // 仅保存命令信息到 StateStore（与 opencode pendingCheckpointCmd.set 对齐）
    // 实际的 checkpoint bootstrap/恢复由 message-received.js 消费 cmd-info 时完成
    stateStore.setCommandInfo(projectRoot, sessionId, {
      command: aetInfo.command,
      arguments: arguments_,
      agentId: aetInfo.agentId,
    });

    // 同时保存当前 session_id，供 tools 读取（tools 无法直接获取 xiaoO session_id）
    stateStore.setCurrentSessionID(projectRoot, sessionId);

    // command-before 只保存信息，不修改 body
    // body 变换由 message-received.js 在注入 step 指令时完成
    writeResult({ result: 'allow' });
  } catch (e) {
    writeResult({ result: 'allow' });
  }
}

main();
