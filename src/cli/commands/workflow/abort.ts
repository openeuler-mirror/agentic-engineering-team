/**
 * @file src/cli/commands/workflow/abort.ts
 *
 * Layer 3 — `aet workflow abort` command.
 *
 * Terminates the single active workflow in the current project root
 * (user-initiated, NOT natural completion). Core resolves the active
 * workflow from the on-disk checkpoint — the caller passes only an
 * optional `--reason` (recorded in the checkpoint history for audit)
 * and the standard `--output` flag.
 *
 * Usage:
 *   aet workflow abort                              # terminate active workflow
 *   aet workflow abort --reason "wrong direction"  # record why
 *   aet workflow abort --output json                # plugin mode
 *
 * Returns `data.status='workflow_aborted'` on success. The plugin reads
 * this to release any session/context it held (mirrors `workflow_complete`
 * handling). Checkpoint is archived with `status='aborted'` (distinct
 * from `'completed'` so the audit trail can tell them apart).
 *
 * Errors:
 *   - `NO_ACTIVE_WORKFLOW` when nothing is active (exit 1)
 */

import type { EventBus } from '../../../core/event_bus.js';
import type { InputEvent, OutputMode } from '../../../definitions/events.js';

import { optionalFlag, parseArgs, requireOutputMode, UsageError } from '../../args.js';
import { cliError, encodeResult, type CommandSpec } from '../base.js';

// ---------------------------------------------------------------------------
// Command spec
// ---------------------------------------------------------------------------

export const workflowAbortSpec: CommandSpec = {
  id: 'workflow.abort',
  description: 'Terminate the active workflow (user-initiated, not natural completion).',
  run: runWorkflowAbort,
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

async function runWorkflowAbort(bus: EventBus, _argv: string[]): Promise<{ stdout: string; exitCode: number }> {
  const parsed = parseArgs(_argv);

  let reason: string | undefined;
  let output: OutputMode;
  try {
    reason = optionalFlag(parsed, 'reason');
    output = requireOutputMode(parsed);
  } catch (e) {
    if (e instanceof UsageError) {
      return cliError(e.message, 'USAGE_ERROR');
    }
    throw e;
  }

  // Build payload, omitting `reason` when absent so the engine sees
  // `undefined` and skips recording a reason entry.
  const payload: InputEvent['payload'] = reason !== undefined ? { reason } : {};

  const event: InputEvent = {
    event: 'workflow.abort',
    payload,
  };

  const result = await bus.dispatch(event);
  return encodeResult(result, output);
}
