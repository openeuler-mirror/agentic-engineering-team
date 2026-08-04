/**
 * @file src/plugins/claude_code/hooks/handlers/aet_handler.ts
 *
 * Single build entry for the Claude Code plugin handler. CC registers every
 * hook (UserPromptSubmit / SessionStart / PreToolUse / PostToolUse) against
 * this ONE file (see hooks/settings.json); it reads a CC hook JSON envelope
 * from stdin, dispatches on `hook_event_name`, and writes the hook output
 * JSON to stdout. All heavy lifting lives in per-event modules:
 *
 *   - user_prompt_submit.ts  — ACTIVE MODE: `/aet-*` slash → command-init
 *   - session_start.ts       — BOOT MODE (currently disabled)
 *   - pre_tool_use.ts        — PASSIVE (pre): append `--output json`
 *   - post_tool_use.ts       — PASSIVE (post): replace stdout with prompt
 *   - shared.ts              — stdin / spawn / emit / debug plumbing
 *
 * The whole tree bundles to a SINGLE dist artifact (build.mjs
 * CC_HANDLER_ENTRY), so install stays a one-file copy; the source is split
 * purely for maintainability.
 *
 * Install (post-build): copy `dist/plugins/claude_code/handlers/aet_handler.js`
 * to `~/.claude/handlers/aet_handler.js` (or any path on PATH). The
 * settings.json snippet in this directory references it via that path.
 *
 * Build: scripts/build.mjs bundles this file to
 * `dist/plugins/claude_code/handlers/aet_handler.js` (CJS, since CC
 * hooks expect Node-flavor JS).
 */

import type { CcHookEventName, CcHookInput } from '../../types.js';
import { DIALECT_ID, resolveDialect } from '../../../dialect.js';
import { handleUserPromptSubmit } from './user_prompt_submit.js';
import { handlePreToolUse } from './pre_tool_use.js';
import { handlePostToolUse } from './post_tool_use.js';
import { debugLog, emit, emitError, readStdin, resolveAetBin } from './shared.js';

const dialect = resolveDialect(DIALECT_ID);

/** Hook event that raised the current dispatch — used by the catch handler. */
let activeEventName: CcHookEventName = 'UserPromptSubmit';

async function dispatch(eventName: string | undefined, input: CcHookInput): Promise<void> {
  // Normalize the host-provided event name into the canonical (claude)
  // vocabulary BEFORE routing. For claude-family hosts this is identity
  // (claude/codex/codeagent are all aligned 1:1); for a host that later
  // diverges with a renamed namespace, this is what lets a renamed event
  // reach its handler without per-host code.
  switch (dialect.fromHostEvent(eventName ?? '')) {
    case 'UserPromptSubmit':
      return handleUserPromptSubmit(input);
    case 'SessionStart':
      // BOOT MODE is deliberately disabled. The intended behavior lives in
      // session_start.ts; enable by importing + calling handleSessionStart(input).
      debugLog({ event: 'SessionStart', action: 'disabled' });
      emit(null);
      return;
    case 'PreToolUse':
      return handlePreToolUse(input);
    case 'PostToolUse':
      return handlePostToolUse(input);
    default:
      debugLog({ event: 'default_skip', hookEventName: eventName });
      emit(null);
  }
}

async function main() {
  debugLog({ event: 'handler_start', pid: process.pid, aetBin: resolveAetBin() });
  const input = await readStdin();
  if (!input) {
    debugLog({ event: 'no_input', action: 'emit_null' });
    emit(null);
    return;
  }

  // CC uses snake_case on the wire (hook_event_name); camelCase kept as a
  // dev fallback. Log the actual keys CC sent — helps detect field-name
  // mismatches.
  const eventName = (input['hook_event_name'] ?? input['hookEventName']) as string | undefined;
  activeEventName = (dialect.fromHostEvent(eventName ?? '') as CcHookEventName) || 'UserPromptSubmit';
  debugLog({ event: 'dispatch', hook_event_name: eventName, normalized: activeEventName, inputKeys: Object.keys(input).sort(), cwd: input.cwd });

  await dispatch(eventName, input);
}

main().catch((err) => {
  debugLog({ event: 'uncaught_error', error: (err as Error).message, stack: (err as Error).stack?.slice(0, 500) });
  emitError(activeEventName, 'PLUGIN_INTERNAL', (err as Error).message);
});
