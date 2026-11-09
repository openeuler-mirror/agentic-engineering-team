/**
 * @file src/plugins/opencode/hooks/command_before.ts
 *
 * ACTIVE MODE — V2 `ctx.session.hook("prompt", ...)` hook. Port of the
 * Claude Code handler's UserPromptSubmit logic (claude_code/hooks/handlers/
 * user_prompt_submit.ts) to the V2 OpenCode Plugin API.
 *
 * The V2 `prompt` hook fires for every user prompt and receives a mutable
 * `event.prompt` (PromptInput.Prompt). We parse the slash command from
 * `event.prompt.text` (NOT `event.message.text`), and for AET workflow
 * commands route to `aet workflow command-init --name <id>`:
 *   - workflow id  → one-shot init + step-1 task; result.prompt replaces
 *                    `event.prompt.text` (in-hook application via
 *                    `applyResult`).
 *   - command id / unknown → `UNKNOWN_WORKFLOW` → return WITHOUT mutating
 *                    `event.prompt.text`, so OpenCode renders the registered
 *                    command's `execute` natively (the CC "command pass-through").
 *
 * The hook is async; OpenCode awaits it before the prompt is dispatched to
 * the model, so the rewritten text lands in the same generation.
 */

import { AET_PLUGIN_ID } from '../constants.js';
import { runAetSafe } from '../cli.js';
import { applyResult } from '../json_to_op.js';
import { parseSlash, parseSlashArgs } from '../../shared_hooks.js';
import { decodePromptText, encodePromptText } from '../prompt_text.js';
import type { MessagePart, PluginContext } from '../types.js';

/**
 * V2 `ctx.session.hook("prompt", ...)` registration. Parses slash commands
 * from `event.prompt.text` and routes AET workflow commands through
 * `aet workflow command-init`. Returns `Promise<void>` — V2 setup registers
 * imperatively (no hooks-object return).
 */
export async function registerCommandBeforeHook(ctx: PluginContext): Promise<void> {
  await ctx.session.hook('prompt', async (event) => {
    const decoded = decodePromptText(event?.prompt?.text);
    const text = decoded.text;
    if (!text) return;

    // Parse the slash command from the prompt text. Returns null for
    // non-slash prompts (pass through — the host's normal prompt flow).
    const command = parseSlash(text);
    if (!command) return;

    // `/init` is NOT handled here — it passes through to OpenCode's native
    // command `execute` (registered by config.ts from init.md), which
    // directs the agent to follow the aet-install skill (self-contained
    // install carrier). 'init' then flows to command-init →
    // UNKNOWN_WORKFLOW → pass-through, and init.md's execute renders natively.

    // One-shot init + advance into step 1. Core's registry classifies the
    // id: workflows get the lifecycle prompt, everything else returns
    // UNKNOWN_WORKFLOW and we pass through to OpenCode's native handling.
    //
    // `parseSlashArgs` extracts the user's trailing args (initial-requirement
    // text). When present, forward it as `--argument` so the checkpoint
    // persists it and `workflow.continue` can re-inject the original task
    // on resume.
    //
    // Pass the project root explicitly so the spawned `aet` CLI resolves
    // projectRoot from env.AET_PROJECT_ROOT (set inside runAet via
    // opts.cwd) instead of falling back to its own process.cwd(). This
    // mirrors the Claude Code handler (shared.ts runAet → env.AET_PROJECT_ROOT
    // = cwd); without it, checkpoints land under the wrong directory tree
    // when the host's process.cwd() differs from the open project root.
    const argv = ['workflow', 'command-init', '--name', command];
    const argText = parseSlashArgs(text) ?? '';
    if (argText.trim().length > 0) {
      argv.push('--argument', argText.trim());
    }
    // Bind the coding-agent session at workflow start so the `ca.stop` event
    // (the stop/idle guard) can verify the stopping session owns this workflow.
    // `event.sessionID` is the host's ambient session for THIS prompt.
    if (event.sessionID) {
      argv.push('--session-id', event.sessionID);
    }
    const result = await runAetSafe(argv, { cwd: process.cwd() });

    // Command pass-through: not a workflow — let OpenCode render the
    // registered command's `execute` natively (no checkpoint, no injection).
    if (!result.ok && result.error?.code === 'UNKNOWN_WORKFLOW') {
      console.debug(`[${AET_PLUGIN_ID}] /${command} passed through (not an AET workflow)`);
      return;
    }

    // Workflow (or a real error) — apply events to a local parts array
    // (in-hook mode), then replace event.prompt.text with the assembled
    // agent-visible text. step_advanced's prompt (orientation banner +
    // step-1 task) becomes the prompt the model sees.
    const parts: MessagePart[] = [];
    await applyResult(ctx, result, 'in-hook', { parts });
    const assembled = parts
      .map((p) => (typeof p.text === 'string' ? p.text : ''))
      .filter((t) => t.length > 0)
      .join('\n\n');
    if (assembled) {
      event.prompt.text = encodePromptText(assembled, decoded.encoded);
    }

    // Log a banner so users can see the intercept happened.
    console.log(`[${AET_PLUGIN_ID}] /${command} intercepted → aet workflow command-init`);
  });
}
