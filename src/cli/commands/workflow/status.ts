/**
 * @file src/cli/commands/workflow/status.ts
 *
 * Layer 3 — `aet workflow status` command.
 *
 * Read-only query of the single active workflow in the current project
 * root. Core resolves the active workflow + current step from the on-disk
 * checkpoint — the caller passes nothing but an optional `--output` for
 * encoding selection.
 *
 * Usage:
 *   aet workflow status                       # human-readable summary
 *   aet workflow status --output json         # machine-readable (plugin mode)
 *
 * Returns `data.status='active'` (with workflow / workflowName /
 * currentStep / checkpointId populated) when an active workflow exists,
 * or `data.status='no_active'` when the project root holds none. Pure
 * read — does NOT bump `updatedAt` or write to the checkpoint.
 */

import type { EventBus } from '../../../core/event_bus.js';
import type { InputEvent, OutputMode } from '../../../definitions/events.js';

import { parseArgs, requireOutputMode, UsageError } from '../../args.js';
import { cliError, encodeResult, type CommandSpec } from '../base.js';

// ---------------------------------------------------------------------------
// Command spec
// ---------------------------------------------------------------------------

export const workflowStatusSpec: CommandSpec = {
  id: 'workflow.status',
  description: 'Show the active workflow in the current project root.',
  run: runWorkflowStatus,
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

async function runWorkflowStatus(bus: EventBus, _argv: string[]): Promise<{ stdout: string; exitCode: number }> {
  const parsed = parseArgs(_argv);

  let output: OutputMode;
  try {
    output = requireOutputMode(parsed);
  } catch (e) {
    if (e instanceof UsageError) {
      return cliError(e.message, 'USAGE_ERROR');
    }
    throw e;
  }

  // Status is a pure read — no caller-supplied identity. Core resolves
  // the active workflow from its on-disk checkpoint index.
  const event: InputEvent = {
    event: 'workflow.status',
    payload: {},
  };

  const result = await bus.dispatch(event);
  return encodeResult(result, output);
}
