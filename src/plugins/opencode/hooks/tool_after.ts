/**
 * @file src/plugins/opencode/hooks/tool_after.ts
 *
 * PASSIVE MODE (post) — `tool.execute.after` hook. Port of the Claude Code
 * handler's PostToolUse logic (claude_code/hooks/handlers/post_tool_use.ts)
 * to the OpenCode Plugin API.
 *
 * After an `aet workflow <...>` Bash call, parse the tool result JSON
 * (`CommandResult`) and REPLACE `output.output` with the agent-visible
 * `result.prompt` text. The agent reads clean prompt text directly in the
 * tool result — it never sees the raw JSON. `omit_prompt` in events[]
 * skips the replacement (let the original pass through), matching CC.
 *
 * Per the OpenCode Plugin API the hook receives the live `output` object by
 * reference — mutate `output.output` in place, never rebind.
 */

import { AET_WORKFLOW_RE } from '../../shared_hooks.js';
import type { CommandResult, PluginContext } from '../types.js';

/** tool.execute.after input/output shapes (per @opencode-ai/plugin Hooks). */
interface ToolAfterInput {
  tool: string;
  sessionID: string;
  callID: string;
  args: { command?: string; [key: string]: unknown };
}
interface ToolAfterOutput {
  title: string;
  output: string;
  metadata: unknown;
}

/**
 * Build the `tool.execute.after` hook handler. Replaces the bash tool result
 * with `result.prompt` when the command was an `aet workflow` invocation.
 * Returns the handler so the plugin entry can return its hooks object (the
 * OpenCode Plugin API contract).
 */
export function registerToolAfterHook(ctx: PluginContext): (input: unknown, output: unknown) => Promise<void> {
  return async (rawInput: unknown, rawOutput: unknown): Promise<void> => {
    const input = rawInput as ToolAfterInput;
    const output = rawOutput as ToolAfterOutput;
    if (!input?.tool || input.tool !== 'bash') return;

    const command = String(input.args?.command ?? '').trim();
    if (!AET_WORKFLOW_RE.test(command)) return;

    const stdout = String(output.output ?? '').trim();
    if (!stdout) return; // nothing to parse/replace — leave the result as-is.

    let result: CommandResult;
    try {
      result = JSON.parse(stdout) as CommandResult;
    } catch {
      // R9: errors are never silenced — surface a synthetic error in the tool
      // result so the agent isn't left guessing about the unparseable stdout.
      output.output = `[AET ERROR PLUGIN_PARSE_FAILED] aet: failed to parse stdout as JSON for '${command}'. First 200 chars: ${stdout.slice(0, 200)}`;
      return;
    }

    // omit_prompt: the active-injection pattern wants stdout suppressed;
    // OpenCode can't suppress, so degrade by NOT replacing (raw JSON passes).
    if (result.events?.some((e) => e.id === 'omit_prompt')) return;

    // `result.prompt` is the complete agent-visible text. Fall back to a
    // tagged error when ok=false and no prompt was populated.
    const text =
      result.prompt ||
      (result.ok ? '' : `[AET ERROR ${result.error?.code ?? 'UNKNOWN'}] ${result.error?.message ?? ''}`);
    if (!text) return;

    output.output = text;
  };
}
