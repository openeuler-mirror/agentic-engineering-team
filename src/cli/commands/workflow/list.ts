/**
 * @file src/cli/commands/workflow/list.ts
 *
 * Layer 3 — `aet workflow list` command.
 *
 * Read-only query of every workflow AND command declared in the merged
 * config (baseline + global + project). Core reads the registry directly —
 * the caller passes nothing but an optional `--output`. Pure read, no
 * side effects, no checkpoint access.
 *
 * Returns `data.status='list'` with `data.workflows[]` /
 * `data.commands[]` populated; the human-readable list is carried as the
 * top-level `prompt` field (one bullet per entry, workflows annotated
 * with their stage count). Use `--output json` to consume the structured
 * arrays from a plugin.
 *
 * Usage:
 *   aet workflow list                       # human-readable list
 *   aet workflow list --output json         # machine-readable (plugin mode)
 */

import type { EventBus } from '../../../core/event_bus.js';
import type { InputEvent, OutputMode } from '../../../definitions/events.js';

import { parseArgs, requireOutputMode, UsageError } from '../../args.js';
import { cliError, encodeResult, type CommandOutput, type CommandSpec } from '../base.js';

// ---------------------------------------------------------------------------
// Command spec
// ---------------------------------------------------------------------------

export const workflowListSpec: CommandSpec = {
  id: 'workflow.list',
  description: 'List all workflows and commands declared in the merged config (read-only).',
  run: runWorkflowList,
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

async function runWorkflowList(bus: EventBus, argv: string[]): Promise<CommandOutput> {
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

  // Pure read — no caller-supplied identity. Core reads the registry's
  // full workflow + command list from the merged config.
  const event: InputEvent = {
    event: 'workflow.list',
    payload: {},
  };

  const result = await bus.dispatch(event);
  return encodeResult(result, output);
}
