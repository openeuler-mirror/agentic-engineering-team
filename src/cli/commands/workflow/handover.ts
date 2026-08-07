/**
 * @file src/cli/commands/workflow/handover.ts
 *
 * Layer 3 — `aet workflow handover` command.
 *
 * Translates CLI args into a `workflow.handover` InputEvent. Core is
 * stateful: the active workflow and current step are read from the on-disk
 * checkpoint, so the caller passes only an optional `--step` for explicit
 * jumps. With no `--step`, Core advances one step in workflow-definition
 * order; if `currentStepId` is null (just-init'd), the first handover
 * enters step 1.
 *
 * Usage:
 *   aet workflow handover                       # advance to next step
 *   aet workflow handover --step requirements_design
 *   aet workflow handover --session-id <id>    # bind the coding-agent session
 *   aet workflow handover --output json
 */

import type { EventBus } from '../../../core/event_bus.js';
import type { InputEvent, OutputMode } from '../../../definitions/events.js';

import { optionalFlag, parseArgs, requireOutputMode, UsageError } from '../../args.js';
import { cliError, encodeResult, type CommandOutput, type CommandSpec } from '../base.js';

// ---------------------------------------------------------------------------
// Command spec
// ---------------------------------------------------------------------------

export const workflowHandoverSpec: CommandSpec = {
  id: 'workflow.handover',
  description: 'Advance the current step to the next (or named) step.',
  run: runWorkflowHandover,
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

async function runWorkflowHandover(bus: EventBus, argv: string[]): Promise<CommandOutput> {
  const parsed = parseArgs(argv);

  let step: string | undefined;
  let sessionId: string | undefined;
  let output: OutputMode;

  try {
    step = optionalFlag(parsed, 'step');
    sessionId = optionalFlag(parsed, 'session-id');
    output = requireOutputMode(parsed);
  } catch (e) {
    if (e instanceof UsageError) {
      return cliError(e.message, 'USAGE_ERROR');
    }
    throw e;
  }

  // Build payload, omitting `step` / `session-id` when absent so the engine
  // sees `undefined` and applies its own defaults (advance one step in
  // definition order; skip session binding when no session is reported).
  const payload: InputEvent['payload'] = {
    ...(step !== undefined ? { step } : {}),
    ...(sessionId !== undefined ? { sessionId } : {}),
  };

  const event: InputEvent = {
    event: 'workflow.handover',
    payload,
  };

  const result = await bus.dispatch(event);
  return encodeResult(result, output);
}
