/**
 * @file src/plugins/claude_code/hooks/handlers/stop.ts
 *
 * PASSIVE MODE (post) — Stop hook. Fires when the Claude Code agent stops
 * producing output (`Stop` / `SubagentStop`).
 *
 * When the agent stops, we report the stopping session to AET Core via
 * `aet event ca-stop --session-id <id>`. Core resolves the active workflow and
 * compares the session against the one bound to the checkpoint. ONLY on a
 * session match does Core return a guidance prompt (question tool / handover
 * / continue) — we BLOCK the stop and feed that guidance back as the block
 * `reason` so the agent keeps working. Every no-match case returns an empty
 * prompt → we emit `null` (exit 0) and let the stop proceed cleanly. This is
 * the "don't feed AET guidance to an unrelated session" guard.
 *
 * Stop blocking uses the CC decision API — NOT `additionalContext`:
 *   {"decision": "block", "reason": "<guidance>"} written to STDERR, exit 2.
 * This is the only reliable way to keep the turn going on a Stop hook.
 */

import type { CcHookInput } from '../../types.js';
import { debugLog, emit, emitStopBlock, runAet } from './shared.js';

export async function handleStop(input: CcHookInput): Promise<void> {
  const sessionId = input.session_id;
  if (!sessionId) {
    debugLog({ event: 'Stop', action: 'no_session' });
    emit(null);
    return;
  }

  debugLog({ event: 'Stop', sessionId, cwd: input.cwd });

  // Report the stopping session to Core. `event ca-stop` returns a guidance
  // prompt ONLY when the session owns the active workflow (session match); an
  // empty prompt means "no AET guidance for this stop". The CLI call is NOT
  // auto-appended `--output json` here — we pass it explicitly (runAet does
  // not auto-append; the CC handler appends flags itself).
  const result = await runAet(['event', 'ca-stop', '--session-id', sessionId, '--output', 'json'], input.cwd);
  if (result === null) {
    debugLog({ event: 'Stop', action: 'spawn_failed' });
    // A failed guard should not block the stop — emit null (let it proceed).
    emit(null);
    return;
  }

  const text = result.ok ? (result.prompt ?? '') : '';
  if (!text) {
    debugLog({ event: 'Stop', action: 'no_guidance', status: result.data?.status });
    emit(null);
    return;
  }

  // BLOCK the stop and feed the guidance back as `reason`. Per the CC Stop
  // decision API, `{"decision":"block","reason":"..."}` on stderr + exit 2
  // keeps the agent working. We do NOT use additionalContext here.
  debugLog({ event: 'Stop', action: 'block_guidance', chars: text.length, status: result.data?.status, currentStep: result.data?.currentStep });
  emitStopBlock(text);
}