/**
 * @file src/cli/commands/workflow/command_init.ts
 *
 * Layer 3 — `aet workflow command-init` command (INTERNAL, plugin-only).
 *
 * Collapses `workflow.init` + `workflow.handover` into a single dispatch:
 * creates the checkpoint AND advances into step 1 in one Core call. Used
 * by the CC plugin's UserPromptSubmit hook to do init + step-1 task
 * injection in one CLI subprocess instead of two.
 *
 * Naming: the spec id is `workflow.command-init` (kebab-case, CLI-friendly),
 * but the dispatched InputEvent id is `workflow.commandInit` (camelCase,
 * per `src/definitions/events.ts:59`). The two need not match — the spec
 * id drives CLI routing (`aet <resource> <action>` → findCommand), while
 * the event id drives Core routing (EventBus → handler).
 *
 * Visibility: `'internal'` — hidden from `aet --help` to avoid confusing
 * agents. Agents should call `aet workflow init` + `aet workflow
 * handover` separately so the branch semantics (init failure /
 * intervention_required → skip handover) stay explicit. Plugins may
 * collapse the two into one because they implement the same branch
 * logic internally and only the success path benefits from collapsing.
 *
 * Usage:
 *   aet workflow command-init --name design --output json
 *
 * Returns (Core's handleCommandInit branches):
 *   - init failure (ok=false)         → init error result
 *   - init intervention_required      → intervention prompt, NO handover
 *   - init success (workflow_started) → handover result: data.status='step_advanced'
 *                                       + step-1 task text in `prompt`
 *
 * See `src/core/workflow_engine.ts:148` (handleCommandInit) for the
 * Core-side branch logic.
 */
import type { EventBus } from '../../../core/event_bus.js';
import type { InputEvent, OutputMode } from '../../../definitions/events.js';

import { parseArgs, requireFlag, requireOutputMode, optionalFlag, UsageError } from '../../args.js';
import { cliError, encodeResult, type CommandOutput, type CommandSpec } from '../base.js';

// ---------------------------------------------------------------------------
// Command spec
// ---------------------------------------------------------------------------

export const workflowCommandInitSpec: CommandSpec = {
  id: 'workflow.command-init',
  description:
    '【plugin-only】一步完成 init + 进入 step 1（plugin 用；agent 应分别调 init + handover）',
  visibility: 'internal',
  run: runWorkflowCommandInit,
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

async function runWorkflowCommandInit(
  bus: EventBus,
  argv: string[],
): Promise<CommandOutput> {
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

  // Dispatch as `workflow.commandInit` (camelCase, per events.ts:59).
  // Core's handleCommandInit runs initWorkflow then handoverWorkflow
  // internally; the result is whichever branch fired last (error → init
  // result; intervention → intervention prompt; success → step_advanced
  // + step-1 task text). `argument` (the user's initial requirement) is
  // persisted into the checkpoint so `workflow.continue` can re-inject it.
  const event: InputEvent = {
    event: 'workflow.commandInit',
    payload: { name, ...(argument ? { argument } : {}) },
  };

  const result = await bus.dispatch(event);
  return encodeResult(result, output);
}
