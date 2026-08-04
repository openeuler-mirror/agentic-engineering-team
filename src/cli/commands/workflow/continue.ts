/**
 * @file src/cli/commands/workflow/continue.ts
 *
 * Layer 3 — `aet workflow continue` command.
 *
 * Re-emits the CURRENT step's task prompt (state recovery). Core is
 * stateful: the active workflow and current step are read from the
 * on-disk checkpoint, so the caller passes nothing but an optional
 * `--output`. Unlike `handover`, `continue` does NOT advance —
 * `currentStepId` stays the same; the same step's task text is
 * re-issued (prefixed with a "state recovery" header). Core re-fires
 * the current step's `before` hooks and records a `step_resumed`
 * audit entry.
 *
 * Errors with `NO_ACTIVE_STEP` when `currentStepId` is null (the
 * workflow was init'd but not yet handed over — run
 * `aet workflow handover` first to enter step 1).
 *
 * Usage:
 *   aet workflow continue
 *   aet workflow continue --output json
 */

import type { EventBus } from '../../../core/event_bus.js';
import type { InputEvent, OutputMode } from '../../../definitions/events.js';

import { parseArgs, requireOutputMode, UsageError } from '../../args.js';
import { cliError, encodeResult, type CommandOutput, type CommandSpec } from '../base.js';

// ---------------------------------------------------------------------------
// Command spec
// ---------------------------------------------------------------------------

export const workflowContinueSpec: CommandSpec = {
  id: 'workflow.continue',
  description: 'Re-emit the current step prompt (state recovery).',
  run: runWorkflowContinue,
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

async function runWorkflowContinue(bus: EventBus, argv: string[]): Promise<CommandOutput> {
  const parsed = parseArgs(argv);

  let output: OutputMode;

  try {
    output = requireOutputMode(parsed);
  } catch (e) {
    if (e instanceof UsageError) {
      return cliError(e.message, 'USAGE_ERROR');
    }
    throw e;
  }

  // Core is stateful — the active workflow + current step are read from
  // the on-disk checkpoint. The payload is empty; the event type is what
  // selects the handler.
  const event: InputEvent = {
    event: 'workflow.continue',
    payload: {},
  };

  const result = await bus.dispatch(event);
  return encodeResult(result, output);
}
