/**
 * @file src/plugins/opencode/hooks/tool_after.ts
 *
 * PASSIVE MODE (post) — V2 `ctx.tool.hook("execute.after", ...)` hook.
 * Port of the Claude Code handler's PostToolUse logic
 * (claude_code/hooks/handlers/post_tool_use.ts) to the V2 OpenCode Plugin API.
 *
 * After an `aet workflow <...>` Bash call, parse the tool result's content
 * (JSON `CommandResult`) and REPLACE `event.result` with the agent-visible
 * `result.prompt` text. The agent reads clean prompt text directly in the
 * tool result — it never sees the raw JSON. `omit_prompt` in events[]
 * skips the replacement (let the original pass through), matching CC.
 *
 * Per the V2 OpenCode Plugin API the hook receives the live `event` object
 * by reference — `event.result` is mutable (reassign the whole result
 * object; `Tool.Result.content` itself is readonly so we cannot mutate it
 * in place).
 */

import { AET_WORKFLOW_RE } from '../../shared_hooks.js';
import type { CommandResult, PluginContext } from '../types.js';

/** V2 execute.after event shape (subset we consume). */
interface ToolAfterEvent {
  readonly tool: string;
  readonly sessionID: string;
  readonly id: string;
  readonly input: { command?: string; [key: string]: unknown } | null;
  readonly status: 'completed' | 'error';
  result?: {
    readonly output?: unknown;
    readonly content?: string | ReadonlyArray<{ type: string; text?: string }> | ReadonlyArray<unknown>;
    readonly metadata?: unknown;
    [key: string]: unknown;
  };
  error?: { message?: string };
  [key: string]: unknown;
}

/**
 * V2 `ctx.tool.hook("execute.after", ...)` registration. Replaces the bash
 * tool result with `result.prompt` when the command was an `aet workflow`
 * invocation. Returns `Promise<void>` — V2 setup registers imperatively.
 */
export async function registerToolAfterHook(ctx: PluginContext): Promise<void> {
  await ctx.tool.hook('execute.after', async (event: ToolAfterEvent) => {
    if (!event?.tool || event.tool !== 'bash') return;
    if (event.status !== 'completed' || !event.result) return;

    const command = String(event.input?.command ?? '').trim();
    if (!AET_WORKFLOW_RE.test(command)) return;

    // The bash tool's result.content is either a raw stdout string or an
    // array of Content items (e.g. [{type:'text', text:stdoutString}]).
    // Normalize to the stdout string we parse as JSON.
    const content = event.result.content;
    const stdout =
      typeof content === 'string'
        ? content
        : Array.isArray(content)
          ? String((content[0] as { text?: string } | undefined)?.text ?? '')
          : '';
    if (!stdout.trim()) return; // nothing to parse/replace — leave the result as-is.

    let result: CommandResult;
    try {
      result = JSON.parse(stdout) as CommandResult;
    } catch {
      // R9: errors are never silenced — surface a synthetic error in the tool
      // result so the agent isn't left guessing about the unparseable stdout.
      event.result = {
        ...event.result,
        content: `[AET ERROR PLUGIN_PARSE_FAILED] aet: failed to parse stdout as JSON for '${command}'. First 200 chars: ${stdout.slice(0, 200)}`,
      };
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

    // Reassign the whole result object — Tool.Result.content is readonly,
    // so we can't mutate it in place. Preserve metadata.
    event.result = { ...event.result, content: text };
  });
}
