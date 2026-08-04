/**
 * @file src/plugins/omp/hooks/tool_result.ts
 *
 * PASSIVE MODE (post) — omp `tool_result` hook. Port of the Claude Code
 * handler's PostToolUse logic (claude_code/hooks/handlers/post_tool_use.ts)
 * to the omp HookAPI, and a sibling of the opencode plugin's
 * `tool.execute.after` hook (hooks/tool_after.ts).
 *
 * After an `aet workflow <...>` Bash call, parse the tool result content
 * (a text part carrying the CLI's JSON stdout) and REPLACE it with the
 * agent-visible `result.prompt` text. The agent reads clean prompt text
 * directly in the tool result — it never sees the raw JSON. `omit_prompt`
 * in events[] skips the replacement (let the original pass through),
 * matching CC / opencode.
 *
 * omp delivers the `tool_result` event with the `content` array and reads
 * back a returned `{ content }` to replace what the model sees, so we return
 * a new `content` array (text parts built from resultToOmpContent).
 */

import { AET_WORKFLOW_RE } from '../../shared_hooks.js';
import { resultToOmpContent } from '../json_to_omp.js';
import type { CommandResult, HookReturn, MessagePart, ToolResultEvent } from '../types.js';

/**
 * The `tool_result` (post-tool) handler. Replaces the bash tool result
 * content with the agent-visible `result.prompt` text (as text parts built
 * by resultToOmpContent) when the command was an `aet workflow` invocation.
 * Returns a `{ content }` replacement when the result changed, or undefined
 * to leave the tool result untouched.
 *
 * Exported as a bare handler (mirrors handleToolCall) for uniform
 * registration in the plugin entry.
 */
export function handleToolResult(event: ToolResultEvent): HookReturn | void {
  if (event.toolName !== 'bash') return;

  // The command that produced this result is not carried on tool_result in
  // omp's HookAPI (only toolName/content/isError). The bash tool's command
  // was available at tool_call time, but omp does not thread it through to
  // tool_result. We reconstruct the workflow-vs-not signal from the result
  // CONTENT instead: an `aet workflow` JSON stdout always carries the AET
  // CommandResult shape (`ok` + `events`/`prompt`/`data`). If the content
  // parses as a CommandResult, we treat it as an AET workflow result and
  // replace; otherwise we leave it untouched.
  const stdout = extractText(event.content);
  if (!stdout) return;

  let result: CommandResult;
  try {
    result = JSON.parse(stdout) as CommandResult;
  } catch {
    // R9: errors are never silenced — surface a synthetic error in the tool
    // result so the agent isn't left guessing about the unparseable stdout.
    return {
      content: [
        { type: 'text', text: `[AET ERROR PLUGIN_PARSE_FAILED] aet: failed to parse tool result as JSON. First 200 chars: ${stdout.slice(0, 200)}` },
      ],
    };
  }

  // Belt-and-suspenders: only replace content that genuinely looks like an
  // AET workflow result (has `ok` and at least one of prompt/events/data).
  // This avoids clobbering unrelated bash JSON output (e.g. a user piping
  // some other tool's JSON). The tool_call hook already gated --output json
  // onto `aet workflow` commands, so this is the matching post-side guard.
  if (!isAetResult(result)) return;

  const replacement = resultToOmpContent(result);
  if (replacement === null) return; // omit_prompt or nothing to surface — leave as-is.

  return { content: replacement };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Concatenate the `text` of all text parts in a content array. */
function extractText(content: MessagePart[]): string {
  if (!Array.isArray(content)) return '';
  return content
    .map((c) => (typeof c.text === 'string' ? c.text : ''))
    .join('')
    .trim();
}

/**
 * Heuristic: does this parsed JSON look like an AET CommandResult? AET
 * results always carry `ok` (boolean) and at least one of `prompt` /
 * `events` / `data`. Guards against replacing unrelated JSON bash output.
 */
function isAetResult(r: unknown): r is CommandResult {
  if (typeof r !== 'object' || r === null) return false;
  const o = r as Record<string, unknown>;
  return typeof o.ok === 'boolean' && ('prompt' in o || 'events' in o || 'data' in o);
}
