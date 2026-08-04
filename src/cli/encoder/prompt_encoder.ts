/**
 * @file src/cli/encoder/prompt_encoder.ts
 *
 * Layer 3 — Prompt output encoder.
 *
 * DUAL-CHANNEL DESIGN (see `definitions/events.ts`): the `CommandResult`
 * carries the agent-visible text in its top-level `prompt` field, and
 * PLUGIN-ONLY signals in `events[]`. The prompt encoder's only job is to
 * surface `prompt` verbatim to stdout — it ignores `events[]` entirely
 * (a bare agent has no host hooks to act on them; the plugin reading
 * JSON mode handles events itself).
 *
 * Errors (`ok === false`) are already encoded into `prompt` by the
 * `err()` factory as `ERROR: <code> — <message>`, so they surface as
 * plain text here too.
 */

import type { CommandResult } from '../../definitions/events.js';

/**
 * Encode a CommandResult into prompt text. Returns the `prompt` field
 * verbatim (which is `''` for no-op success paths like `workflow.init`
 * and `ERROR: <code> — <msg>` for errors).
 */
export function encodePrompt(result: CommandResult): string {
  return result.prompt;
}
