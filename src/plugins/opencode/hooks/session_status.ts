/**
 * @file src/plugins/opencode/hooks/session_status.ts
 *
 * Passive hook: `event` (新方案.md §3.1).
 *
 * OpenCode's `event` hook fires for many event types (per ctx7 docs):
 *   session.created, session.compacted, session.deleted, session.idle,
 *   session.status, session.updated, message.updated, message.removed,
 *   tui.prompt.append, tui.command.execute, tui.toast.show, etc.
 *
 * JOB: detect when a coding agent STOPS producing output (the "ca.stop"
 * condition) WITHOUT firing on user interrupt. We judge this from a SINGLE
 * `message.updated` event — no cross-event correlation, no race:
 *
 *   On `message.updated` where the assistant message is FINAL
 *   (`info.role === 'assistant'` AND `info.time.completed` is set):
 *     - `info.error?.name === 'MessageAbortedError'` → USER INTERRUPT → skip.
 *       OpenCode sets this error name on the interrupted assistant message
 *       (confirmed in current source: packages/schema/src/v1/session.ts —
 *       `AbortedError = namedError("MessageAbortedError", …)`). A user
 *       pressing Esc / stopping the agent produces exactly this, and we must
 *       NOT inject a "keep working" prompt on a user-initiated stop.
 *     - `info.content` contains a `tool` part → the agent is MID-WORKFLOW
 *       (it ended its turn by calling a tool, not by finishing) → skip.
 *     - OTHERWISE (final message, no abort error, no pending tool call) →
 *       NATURAL COMPLETION — the model's turn ended without a tool call,
 *       i.e. the agent stopped producing output. Report it to Core via
 *       `aet event ca-stop --session-id <id>`.
 *
 * Why NOT `session.idle` / `session.status idle`: those fire on BOTH natural
 * completion AND user interrupt (both go through the runner's `status.set
 * ({type:"idle"})`), and they also fire after every tool execution while the
 * agent is still working. There is no discriminator in the idle event itself.
 * The assistant message's `error.name === 'MessageAbortedError'` is the only
 * reliable way to tell user interrupt apart from a natural completed turn.
 *
 * Core's `ca.stop` additionally guards by session: it returns a guidance
 * prompt ONLY when the stopping session matches the session bound to the
 * active workflow. Every no-match returns an empty prompt → we inject nothing
 * and the stop proceeds cleanly. This is the "don't feed AET guidance to an
 * unrelated session" guard.
 */
import { AET_PLUGIN_ID } from '../constants.js';
import { runAetSafe } from '../cli.js';
import type { PluginContext } from '../types.js';

/** Event payload shape for OpenCode's `event` hook. */
interface EventHookPayload {
  type: string;
  sessionID?: string;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Shape of the assistant message's `info` carried by `message.updated`. */
interface AssistantMessageInfo {
  role?: string;
  time?: { completed?: number };
  error?: { name?: string };
  content?: Array<{ type?: string }>;
}

/**
 * Build the `event` hook handler. On a naturally-completed assistant message
 * (no user interrupt, no pending tool call), reports the stopping session to
 * Core (`aet event ca-stop`) and delivers the returned guidance (if any) back to
 * that session. Returns the handler so the plugin entry can return its hooks
 * object (the OpenCode Plugin API contract). The hook receives
 * `{ event: Event }` — destructure it before reading event fields.
 */
export function registerSessionStatusHook(ctx: PluginContext): (input: unknown) => Promise<void> {
  return async (rawInput: unknown): Promise<void> => {
    // OpenCode passes `{ event }`; the SDK Event carries `type` + `properties`.
    const event = (rawInput as { event?: EventHookPayload }).event;
    if (!event?.type) return;

    const sessionID = event.sessionID ?? (event.properties as Record<string, unknown> | undefined)?.['sessionID'];
    if (!sessionID) return;

    // Only a final assistant message is the "stop" signal. `message.updated`
    // fires for every message (user + assistant + mid-stream deltas); we
    // judge only the final assistant turn.
    if (event.type === 'message.updated') {
      const info = event.properties?.['info'] as AssistantMessageInfo | undefined;
      if (!isFinalAssistantMessage(info)) return;
      if (isUserInterrupt(info)) return; // user stopped us — do NOT inject
      if (hasPendingToolCall(info)) return; // agent is mid-workflow — not stopping
      await deliverCaStop(ctx, sessionID);
      return;
    }

    // `session.idle` / `session.status idle` are NOT used as the trigger —
    // they fire on user interrupt too and after every tool call. Log for
    // observability only.
    if (event.type === 'session.idle' || isIdleStatus(event.type, event.properties)) {
      await ctx.client.app.log({
        body: {
          service: AET_PLUGIN_ID,
          level: 'debug',
          message: `session idle observed (not a ca.stop trigger — ambiguous with user interrupt)`,
          extra: { sessionID, type: event.type },
        },
      });
    }
  };
}

/** True when the assistant message is final (role=assistant + time.completed set). */
function isFinalAssistantMessage(info: AssistantMessageInfo | undefined): boolean {
  return !!info && info.role === 'assistant' && typeof info.time?.completed === 'number';
}

/** True when the assistant message was interrupted by the user (OpenCode sets MessageAbortedError). */
function isUserInterrupt(info: AssistantMessageInfo | undefined): boolean {
  return info?.error?.name === 'MessageAbortedError';
}

/** True when the assistant message ended its turn by calling a tool (mid-workflow, not stopping). */
function hasPendingToolCall(info: AssistantMessageInfo | undefined): boolean {
  return !!info?.content?.some((part) => part.type === 'tool');
}

/** Report the stopping session to Core and deliver any guidance back to it. */
async function deliverCaStop(ctx: PluginContext, sessionID: string): Promise<void> {
  // `event ca-stop` returns a guidance prompt ONLY when the session owns the
  // active workflow (session match); an empty prompt means "no AET guidance
  // for this stop" — inject nothing.
  const result = await runAetSafe(['event', 'ca-stop', '--session-id', sessionID], { cwd: process.cwd() });
  const text = result?.ok ? (result.prompt ?? '') : '';
  if (!text) return;

  // Deliver the guidance back to the stopping session so the agent keeps
  // working. This is the out-of-hook delivery path — the `event` hook has
  // no `output.parts` to mutate, so we drive the host API directly.
  await ctx.client.session.prompt({
    sessionID,
    prompt: { parts: [{ type: 'text', text }] },
  });
}

/** True when a `session.status` event reports an idle status. */
function isIdleStatus(type: string, properties: Record<string, unknown> | undefined): boolean {
  if (type !== 'session.status') return false;
  const status = properties?.['status'] as { type?: string } | undefined;
  return status?.type === 'idle';
}