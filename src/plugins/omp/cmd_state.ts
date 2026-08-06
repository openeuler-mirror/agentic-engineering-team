/**
 * @file src/plugins/omp/cmd_state.ts
 *
 * Shared in-process state bridging the `tool_call` (pre) and `tool_result`
 * (post) hooks. omp's `tool_result` event does NOT carry the originating
 * command — only `toolName`/`content`/`isError` — so the post hook cannot tell
 * whether a mangled / truncated / empty result plausibly came from an
 * `aet workflow --output json` call. The `tool_call` hook DOES see the command
 * (it rewrites it), so it records what it saw here; `tool_result` consults it.
 *
 * This is safe because omp delivers pre/post synchronously around each tool
 * execution (one tool at a time), so the flag always reflects the most recent
 * bash call. It is set by tool_call.ts and read by tool_result.ts.
 */

let lastBashWasAetWorkflow = false;

/** Record that the most recent bash call was an `aet workflow` invocation. */
export function markAetWorkflow(): void {
  lastBashWasAetWorkflow = true;
}

/** Record that the most recent bash call was NOT an `aet workflow` invocation. */
export function markNonAetWorkflow(): void {
  lastBashWasAetWorkflow = false;
}

/** True iff the most recent bash call was an `aet workflow` invocation. */
export function wasAetWorkflow(): boolean {
  return lastBashWasAetWorkflow;
}