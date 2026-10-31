/**
 * @file src/plugins/opencode/hooks/tool_before.ts
 *
 * PASSIVE MODE (pre) — V2 `ctx.tool.hook("execute.before", ...)` hook.
 * Port of the Claude Code handler's PreToolUse logic
 * (claude_code/hooks/handlers/pre_tool_use.ts) to the V2 OpenCode Plugin API.
 *
 * When the agent invokes the `bash` tool with an `aet workflow ...` /
 * `aet plugin init ...` command, REWRITE `event.input.command` to append
 * the flags the plugin needs:
 *   - `aet workflow <...>`  → append `--output json` (idempotent), and for
 *                             `aet workflow handover` / `continue` also append
 *                             `--session-id <sessionID>` so the stopping-session
 *                             guard (the `ca.stop` event) can verify which
 *                             session owns the current stage (idempotent).
 *   - `aet plugin init`     → append `--agent opencode`
 *
 * V2 passes the live `event.input` by reference and reads it back after the
 * hook, so we MUTATE `event.input.command` in place (never rebind
 * `event.input`). Unlike CC there is no permission-decision concept — the
 * hook only rewrites the args. Non-matching / non-bash calls are left
 * untouched.
 */

import { AET_PLUGIN_INIT_RE, AET_WORKFLOW_RE, rewriteAddFlag } from '../../shared_hooks.js';
import { AET_AGENT_ID } from '../constants.js';
import type { PluginContext } from '../types.js';

/**
 * V2 `ctx.tool.hook("execute.before", ...)` registration. Rewrites an AET
 * Bash command to append `--output json` (workflow) / `--agent opencode`
 * (plugin init), plus `--session-id <sessionID>` on workflow handover calls
 * so the checkpoint binds the coding-agent session. Returns `Promise<void>`
 * — V2 setup registers imperatively.
 */
export async function registerToolBeforeHook(ctx: PluginContext): Promise<void> {
  await ctx.tool.hook('execute.before', async (event) => {
    if (!event?.tool || event.tool !== 'bash') return; // opencode's tool id is lowercase `bash`.
    // V2 execute.before event.input is `unknown`; cast to the bash args shape we rewrite.
    const input = event.input as { command?: string; [key: string]: unknown } | null;
    if (!input) return;

    const command = String(input.command ?? '').trim();
    if (!command) return;

    if (AET_WORKFLOW_RE.test(command)) {
      let rewritten = rewriteAddFlag(command, ['--output', '-o'], 'json');
      if (rewritten !== null) {
        input.command = rewritten;
      }
      // Bind the coding-agent session when ENTERING a stage — `aet workflow
      // handover` (advance into the next stage) and `aet workflow continue`
      // (resume the current stage). Per-stage binding: each stage may run in
      // a different session, so the `ca.stop` event verifies the stopping
      // session owns the CURRENT stage. Applies to the (post-rewrite) command
      // so the flag lands on the same `aet` invocation.
      const sessionID = (event as { sessionID?: string }).sessionID;
      if (/(aet\s+workflow\s+handover|aet\s+workflow\s+continue)\b/.test(command) && sessionID) {
        rewritten = rewriteAddFlag(input.command ?? '', ['--session-id'], sessionID);
        if (rewritten !== null) input.command = rewritten;
      }
      return;
    }

    if (AET_PLUGIN_INIT_RE.test(command)) {
      const rewritten = rewriteAddFlag(command, ['--agent'], AET_AGENT_ID);
      if (rewritten !== null) input.command = rewritten;
      return;
    }

    // Non-AET command — leave untouched.
  });
}
