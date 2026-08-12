/**
 * @file src/plugins/opencode/hooks/tool_before.ts
 *
 * PASSIVE MODE (pre) — `tool.execute.before` hook. Port of the Claude Code
 * handler's PreToolUse logic (claude_code/hooks/handlers/pre_tool_use.ts) to
 * the OpenCode Plugin API.
 *
 * When the agent invokes the `bash` tool with an `aet workflow ...` /
 * `aet plugin init ...` command, REWRITE the command to append the flags the
 * plugin needs:
 *   - `aet workflow <...>`  → append `--output json` (idempotent), and for
 *                             `aet workflow handover` / `continue` also append
 *                             `--session-id <sessionID>` so the stopping-session
 *                             guard (the `ca.stop` event) can verify which
 *                             session owns the current stage (idempotent).
 *   - `aet plugin init`     → append `--agent opencode`
 *
 * OpenCode passes the live `output.args` object by reference and reads it
 * back after the hook, so we MUTATE `output.args.command` in place (never
 * rebind `output.args`). Unlike CC there is no permission-decision concept —
 * the hook only rewrites the args. Non-matching / non-bash calls are left
 * untouched.
 */

import { AET_PLUGIN_INIT_RE, AET_WORKFLOW_RE, rewriteAddFlag } from '../../shared_hooks.js';
import { AET_AGENT_ID } from '../constants.js';
import type { PluginContext } from '../types.js';

/** Shape of the bash tool args the hook rewrites. */
interface BashArgs {
  command?: string;
  cwd?: string;
  [key: string]: unknown;
}

/** tool.execute.before input/output shapes (per @opencode-ai/plugin Hooks). */
interface ToolBeforeInput {
  tool: string;
  sessionID: string;
  callID: string;
}
interface ToolBeforeOutput {
  args: BashArgs | null;
}

/**
 * Build the `tool.execute.before` hook handler. Rewrites an AET Bash command
 * to append `--output json` (workflow) / `--agent opencode` (plugin init),
 * plus `--session-id <sessionID>` on workflow handover calls so the
 * checkpoint binds the coding-agent session. Returns the handler so the
 * plugin entry can return its hooks object (the OpenCode Plugin API contract
 * — the plugin RETURNS its hooks).
 */
export function registerToolBeforeHook(ctx: PluginContext): (input: unknown, output: unknown) => Promise<void> {
  return async (rawInput: unknown, rawOutput: unknown): Promise<void> => {
    const input = rawInput as ToolBeforeInput;
    const output = rawOutput as ToolBeforeOutput;
    if (!input?.tool || !output?.args) return;
    if (input.tool !== 'bash') return; // opencode's tool id is lowercase `bash`.

    const command = String(output.args.command ?? '').trim();
    if (!command) return;

    if (AET_WORKFLOW_RE.test(command)) {
      let rewritten = rewriteAddFlag(command, ['--output', '-o'], 'json');
      if (rewritten !== null) {
        output.args.command = rewritten;
      }
      // Bind the coding-agent session when ENTERING a stage — `aet workflow
      // handover` (advance into the next stage) and `aet workflow continue`
      // (resume the current stage). Per-stage binding: each stage may run in
      // a different session, so the `ca.stop` event verifies the stopping
      // session owns the CURRENT stage. Applies to the (post-rewrite) command
      // so the flag lands on the same `aet` invocation.
      if (/(aet\s+workflow\s+handover|aet\s+workflow\s+continue)\b/.test(command) && input.sessionID) {
        rewritten = rewriteAddFlag(output.args.command, ['--session-id'], input.sessionID);
        if (rewritten !== null) output.args.command = rewritten;
      }
      return;
    }

    if (AET_PLUGIN_INIT_RE.test(command)) {
      const rewritten = rewriteAddFlag(command, ['--agent'], AET_AGENT_ID);
      if (rewritten !== null) output.args.command = rewritten;
      return;
    }

    // Non-AET command — leave untouched.
  };
}
