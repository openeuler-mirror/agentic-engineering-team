/**
 * @file src/plugins/opencode/hooks/command_before.ts
 *
 * ACTIVE MODE — `command.execute.before` hook. Port of the Claude Code
 * handler's UserPromptSubmit logic (claude_code/hooks/handlers/
 * user_prompt_submit.ts) to the OpenCode Plugin API.
 *
 * Per the OpenCode Plugin API, `input.command` is the BARE command name
 * (no leading slash) and the hook fires ONLY for commands that are already
 * registered in OpenCode (config.command or commands/ dirs). So — mirroring
 * CC, which runs command-init on any slash command — we run
 * `aet workflow command-init --name <command>` for ANY command that fires
 * and let Core's registry classify it:
 *   - workflow id  → one-shot init + step-1 task; events applied to
 *                    `output.parts` (prompt.inject → text part).
 *   - command id / unknown → `UNKNOWN_WORKFLOW` → return WITHOUT mutating
 *                    parts, so OpenCode renders the registered command
 *                    template natively (the CC "command pass-through").
 *
 * The hook is async; OpenCode awaits it before the command body executes,
 * so injected parts land in the same invocation.
 */

import { AET_PLUGIN_ID } from '../constants.js';
import { runAetSafe } from '../cli.js';
import { applyResult } from '../json_to_op.js';
import type { CommandBeforeInput, CommandBeforeOutput, MessagePart, PluginContext } from '../types.js';

/**
 * Build the `command.execute.before` hook handler.
 *
 * Returns the handler so the plugin entry can return its hooks object (the
 * OpenCode Plugin API contract). The handler signature (per @opencode-ai/plugin
 * Hooks): (input: { command, sessionID, arguments }, output: { parts }) => Promise<void>.
 */
export function registerCommandBeforeHook(ctx: PluginContext): (input: unknown, output: unknown) => Promise<void> {
  return async (rawInput: unknown, rawOutput: unknown): Promise<void> => {
    const input = rawInput as CommandBeforeInput;
    const output = rawOutput as CommandBeforeOutput;
    if (!input?.command || !output?.parts) {
      // Malformed hook payload — log and bail.
      await ctx.client.app.log({
        body: {
          service: AET_PLUGIN_ID,
          level: 'warn',
          message: 'command.execute.before: malformed payload; skipping',
          extra: { hasCommand: !!input?.command, hasParts: !!output?.parts },
        },
      });
      return;
    }

    // `/init` is NOT handled here — it passes through to OpenCode's native
    // slash-command rendering of commands/init.md, which directs the agent to
    // follow the aet-install skill (self-contained install carrier). No plugin
    // path is injected by this hook. 'init' then flows to command-init →
    // UNKNOWN_WORKFLOW → pass-through, and init.md renders natively.

    // One-shot init + advance into step 1. Core's registry classifies the
    // id: workflows get the lifecycle prompt, everything else returns
    // UNKNOWN_WORKFLOW and we pass through to OpenCode's native handling.
    //
    // `input.arguments` (string | string[]) carries the user's trailing
    // args after the slash command — their initial-requirement text. When
    // present, forward it as `--argument` so the checkpoint persists it
    // and `workflow.continue` can re-inject the original task on resume.
    //
    // Pass the project root explicitly so the spawned `aet` CLI resolves
    // projectRoot from env.AET_PROJECT_ROOT (set inside runAet via
    // opts.cwd) instead of falling back to its own process.cwd(). This
    // mirrors the Claude Code handler (shared.ts runAet → env.AET_PROJECT_ROOT
    // = cwd); without it, checkpoints land under the wrong directory tree
    // when the host's process.cwd() differs from the open project root.
    const argv = ['workflow', 'command-init', '--name', input.command];
    const argText = Array.isArray(input.arguments)
      ? input.arguments.join(' ')
      : (input.arguments ?? '');
    const trimmed = argText.trim();
    if (trimmed.length > 0) {
      argv.push('--argument', trimmed);
    }
    // Bind the coding-agent session at workflow start so the `ca.stop` event
    // (the stop/idle guard) can verify the stopping session owns this workflow.
    // `input.sessionID` is the host's ambient session for THIS command.
    if (input.sessionID) {
      argv.push('--session-id', input.sessionID);
    }
    const result = await runAetSafe(argv, { cwd: process.cwd() });

    // Command pass-through: not a workflow — let OpenCode render the
    // registered command template natively (no checkpoint, no injection).
    if (!result.ok && result.error?.code === 'UNKNOWN_WORKFLOW') {
      await ctx.client.app.log({
        body: {
          service: AET_PLUGIN_ID,
          level: 'debug',
          message: `/${input.command} passed through (not an AET workflow)`,
        },
      });
      return;
    }

    // Workflow (or a real error) — apply events to output.parts (in-hook
    // mode). step_advanced's prompt (orientation banner + step-1 task)
    // arrives as a prompt.inject-style text part the agent executes.
    await applyResult(ctx, result, 'in-hook', { parts: output.parts as MessagePart[] });

    // Log a banner so users can see the intercept happened.
    await ctx.client.app.log({
      body: {
        service: AET_PLUGIN_ID,
        level: 'info',
        message: `/${input.command} intercepted → aet workflow command-init`,
      },
    });
  };
}
