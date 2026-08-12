/**
 * @file src/plugins/omp/hooks/tool_call.ts
 *
 * PASSIVE MODE (pre) — omp `tool_call` hook. Port of the Claude Code
 * handler's PreToolUse logic (claude_code/hooks/handlers/pre_tool_use.ts)
 * to the omp HookAPI, and a sibling of the opencode plugin's
 * `tool.execute.before` hook (hooks/tool_before.ts).
 *
 * When the agent invokes the `bash` tool with an `aet workflow ...` /
 * `aet plugin init ...` command, REWRITE the command to append the flag
 * the plugin needs:
 *   - `aet workflow <...>`  → append `--output json` (idempotent)
 *   - `aet plugin init`     → append `--agent omp`
 *
 * omp delivers the `tool_call` event with the live `input` object and reads
 * back a returned `{ input: {...} }` to rewrite the tool input, so we return
 * a new `input` object (with the rewritten `command`) — unlike CC there is no
 * permission-decision concept; the hook only rewrites the args. Non-matching
 * / non-bash calls are left untouched (return undefined).
 */

import { AET_PLUGIN_INIT_RE, AET_WORKFLOW_RE, rewriteAddFlag } from '../../shared_hooks.js';
import { AET_AGENT_ID } from '../constants.js';
import { markAetWorkflow, markNonAetWorkflow } from '../cmd_state.js';
import type { HookReturn, ToolCallEvent } from '../types.js';

/**
 * The `tool_call` (pre-tool) handler. Rewrites an AET Bash command to append
 * `--output json` (workflow) or `--agent omp` (plugin init). Returns a
 * `{ input }` rewrite object when the command changed, or undefined to leave
 * the tool call untouched.
 *
 * Exported in a no-arg factory form so the plugin entry can register it
 * uniformly (mirrors the opencode plugin's `registerToolBeforeHook` shape,
 * though omp's HookAPI takes a bare handler, not a factory — the entry
 * wraps accordingly).
 */
export function handleToolCall(event: ToolCallEvent): HookReturn | void {
  if (event.toolName !== 'bash') return; // omp's tool id is lowercase `bash`.

  const command = String(event.input?.command ?? '').trim();
  if (!command) return;

  if (AET_WORKFLOW_RE.test(command)) {
    // Record that this bash call will produce an `aet workflow --output json`
    // result, so the post hook can surface a parse error even when the output
    // is truncated/mangled (omp's tool_result carries no command).
    markAetWorkflow();
    const rewritten = rewriteAddFlag(command, ['--output', '-o'], 'json');
    if (rewritten !== null) {
      return { input: { ...event.input, command: rewritten } };
    }
    return;
  }

  // Any other bash call is NOT an AET workflow result — clear the flag so a
  // mangled/plain result from it is left untouched (never clobbered with a
  // synthetic AET error).
  markNonAetWorkflow();

  if (AET_PLUGIN_INIT_RE.test(command)) {
    const rewritten = rewriteAddFlag(command, ['--agent'], AET_AGENT_ID);
    if (rewritten !== null) {
      return { input: { ...event.input, command: rewritten } };
    }
    return;
  }

  // Non-AET command — leave untouched.
  return;
}
