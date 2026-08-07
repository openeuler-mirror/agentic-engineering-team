/**
 * @file src/cli/commands/event/dispatch.ts
 *
 * Layer 3 — `aet event <name>` command (INTERNAL, plugin-only dispatcher).
 *
 * The unified dispatch channel for every event OUTSIDE the workflow
 * lifecycle. Coding-agent plugins emit host events (CC `Stop`, OpenCode
 * `session.idle`) through this command instead of bespoke `aet ca ...`
 * resources:
 *
 *   aet event ca-stop --session-id <id> --output json
 *
 * The event name is HYPHENATED on the CLI (`ca-stop`); the command
 * normalizes `-` → `.` to recover the canonical InputEventId (`ca.stop`)
 * before dispatch — the CLI form and the Core id differ only in separator,
 * so no alias table is needed. Per-event payload flag parsing lives in the
 * {@link EVENT_PAYLOADS} registry below: add a row there for any new
 * non-workflow event (its flags → payload fields), and the dispatcher
 * stays untouched.
 *
 * Routing guard: `workflow.*` events are REJECTED here — they have
 * dedicated `aet workflow ...` commands and must not be dispatched
 * generically (the user directive: `event` manages everything EXCEPT
 * workflow). Unknown events fall through to the EventBus, which is the
 * single authority and returns a NOT_IMPLEMENTED error — the "降级一致"
 * principle, never a silent no-op.
 *
 * Visibility: `'internal'` — hidden from `aet --help`, but callable. The
 * plugin hooks (and only they) invoke it on stop/idle; a human would have
 * no reason to dispatch it by hand.
 */

import type { EventBus } from '../../../core/event_bus.js';
import type { InputEvent, InputEventId, OutputMode } from '../../../definitions/events.js';
import { parseArgs, optionalFlag, requireOutputMode, UsageError, type ParsedArgs } from '../../args.js';
import { cliError, encodeResult, type CommandOutput, type CommandSpec } from '../base.js';

// ---------------------------------------------------------------------------
// Per-event payload registry
// ---------------------------------------------------------------------------

/**
 * Map an InputEventId to a payload-parser. Each parser reads the event's
 * flags off the parsed CLI args and returns the InputEvent payload. An
 * event with no registered parser dispatches with an empty payload (the
 * bus decides — NOT_IMPLEMENTED for unknown ids).
 */
const EVENT_PAYLOADS: Record<string, (parsed: ParsedArgs) => Record<string, unknown>> = {
  // `ca.stop` — a coding agent stopped producing output. `--session-id`
  // reports the stopping session; Core resolves the active workflow and
  // returns guidance only on a session match (see WorkflowEngine.handleCaStop).
  'ca.stop': (parsed) => {
    const sessionId = optionalFlag(parsed, 'session-id');
    return sessionId !== undefined ? { sessionId } : {};
  },
};

// ---------------------------------------------------------------------------
// Command spec
// ---------------------------------------------------------------------------

export const eventDispatchSpec: CommandSpec = {
  id: 'event',
  description: '【plugin-only】dispatch a non-workflow input event（如 ca.stop）',
  visibility: 'internal',
  run: runEvent,
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

async function runEvent(bus: EventBus, argv: string[]): Promise<CommandOutput> {
  const parsed = parseArgs(argv);

  // argv[0] (dispatcher-style) is the hyphenated event name.
  const eventName = parsed.positionals[0];
  if (!eventName) {
    return cliError(
      'Expected form: aet event <event-name> [--<flag> <value>...].',
      'USAGE_ERROR',
    );
  }

  let output: OutputMode;
  try {
    output = requireOutputMode(parsed);
  } catch (e) {
    if (e instanceof UsageError) {
      return cliError(e.message, 'USAGE_ERROR');
    }
    throw e;
  }

  // Normalize the CLI name to the canonical Core id (`ca-stop` → `ca.stop`).
  const eventId = eventName.replace(/-/g, '.') as InputEventId;

  // Workflow lifecycle has dedicated `aet workflow ...` commands — never
  // dispatch those generically.
  if (eventId.startsWith('workflow.')) {
    return cliError(
      `Event "${eventId}" belongs to the workflow lifecycle — use the dedicated \`aet workflow ...\` command instead of \`aet event ${eventName}\`.`,
      'USAGE_ERROR',
    );
  }

  const parser = EVENT_PAYLOADS[eventId];
  const payload = parser ? parser(parsed) : {};

  const event: InputEvent = {
    event: eventId,
    payload: payload as InputEvent['payload'],
  };

  const result = await bus.dispatch(event);
  return encodeResult(result, output);
}
