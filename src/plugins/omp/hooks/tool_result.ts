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

import { resultToOmpContent } from '../json_to_omp.js';
import { wasAetWorkflow } from '../cmd_state.js';
import type { CommandResult, HookReturn, MessagePart, ToolResultEvent } from '../types.js';

/**
 * The `tool_result` (post-tool) handler. Replaces the bash tool result
 * content with the agent-visible `result.prompt` text (as text parts built
 * by resultToOmpContent) when the result came from an `aet workflow`
 * invocation. Returns a `{ content }` replacement when the result changed, or
 * undefined to leave the tool result untouched.
 *
 * Exported as a bare handler (mirrors handleToolCall) for uniform
 * registration in the plugin entry.
 */
export function handleToolResult(event: ToolResultEvent): HookReturn | void {
  if (event.toolName !== 'bash') return;

  // The command that produced this result is not carried on tool_result in
  // omp's HookAPI (only toolName/content/isError). The tool_call hook saw the
  // command and recorded whether it was an `aet workflow` invocation in
  // cmd_state (see cmd_state.ts); we consult that to decide whether a mangled
  // / truncated / empty result is an AET failure worth surfacing (R9) or a
  // plain non-AET bash result to leave untouched. For a well-formed result we
  // still belt-and-suspenders verify the CommandResult shape before replacing.
  const stdout = extractText(event.content);
  if (!stdout) {
    // Empty output from an `aet workflow` call is itself a failure — never
    // silence it (R9). Non-AET empty results are left untouched.
    if (wasAetWorkflow()) {
      return {
        content: [
          { type: 'text', text: '[AET ERROR PLUGIN_PARSE_FAILED] aet: workflow returned no output (expected a JSON tool result).' },
        ],
      };
    }
    return;
  }

  let result: CommandResult;
  try {
    result = JSON.parse(stdout) as CommandResult;
  } catch {
    // R9: errors are never silenced — BUT only when this result plausibly came
    // from an AET command. The tool_call hook recorded whether the most recent
    // bash call was an `aet workflow` invocation (omp's tool_result carries no
    // command). If it was, a mangled/truncated/empty `{...}` is worth surfacing
    // as a synthetic error. Otherwise (plain-text bash output like `git status`
    // / `ls` / `npm test`) it is NOT an AET result — clobbering it with a
    // synthetic error would break normal agent bash usage in omp.
    if (!wasAetWorkflow()) return;
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
