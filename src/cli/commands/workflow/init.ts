/**
 * @file src/cli/commands/workflow/init.ts
 *
 * Layer 3 — `aet workflow init` command.
 *
 * Translates CLI args into a `workflow.init` InputEvent, dispatches it via
 * the EventBus, and encodes the result for the caller (plugin JSON or bare
 * agent prompt).
 *
 * Usage:
 *   aet workflow init --name design
 *   aet workflow init --name design --output json
 *   aet workflow init --name bugfix
 *
 * Stateful Core contract: the CLI passes only the workflow name; Core owns
 * checkpoint state (active workflow + current step). The caller never
 * re-states workflow identity on subsequent handovers — Core reads it from
 * the on-disk checkpoint index. The CLI is agent-agnostic: it does not know
 * (or care) which agent is invoking it. `--output` defaults to `prompt`
 * (human/bare-bash friendly); in-process plugins (opencode / claude-code)
 * inject `--output json` when they spawn the CLI.
 */

import type { EventBus } from '../../../core/event_bus.js';
import type { InputEvent, OutputMode } from '../../../definitions/events.js';

import { parseArgs, requireFlag, requireOutputMode, optionalFlag, UsageError } from '../../args.js';
import { cliError, encodeResult, type CommandOutput, type CommandSpec } from '../base.js';

// ---------------------------------------------------------------------------
// Command spec (consumed by cli/index.ts)
// ---------------------------------------------------------------------------

export const workflowInitSpec: CommandSpec = {
  id: 'workflow.init',
  description: 'Start a scenario or single-agent workflow (checkpoint only).',
  run: runWorkflowInit,
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

async function runWorkflowInit(bus: EventBus, argv: string[]): Promise<CommandOutput> {
  const parsed = parseArgs(argv);

  let name: string;
  let output: OutputMode;
  let argument: string | undefined;

  try {
    name = requireFlag(parsed, 'name', 'workflow name (e.g. design)');
    output = requireOutputMode(parsed);
    argument = optionalFlag(parsed, 'argument');
  } catch (e) {
    if (e instanceof UsageError) {
      return cliError(e.message, 'USAGE_ERROR');
    }
    throw e;
  }

  // Core is agent-agnostic — the InputEvent payload carries only the
  // workflow name (and the optional initial-requirement `argument`).
  // Context/identity lives outside the event contract.
  const event: InputEvent = {
    event: 'workflow.init',
    payload: { name, ...(argument ? { argument } : {}) },
  };

  const result = await bus.dispatch(event);
  return encodeResult(result, output);
}
