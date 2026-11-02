/**
 * @file src/plugins/opencode/hooks/session_status.ts
 *
 * V2 Passive hook: `ctx.event.subscribe()` (新方案.md §3.1) + AbortController.
 *
 * V2 event types (per `@opencode/protocol` SessionEventDurable union — verified
 * in node_modules/@opencode/protocol/dist/groups/event.d.ts:52): the union
 * contains `session.step.ended` and `session.execution.interrupted` but NOT
 * the V1 `message.updated` / `message.removed` types. The V1 implementation
 * below keyed on `message.updated` and was dead code on a real V2 host.
 *
 * JOB: detect when a coding agent STOPS producing output (the "ca.stop"
 * condition) WITHOUT firing on user interrupt or mid-workflow tool calls.
 * We dispatch on TWO V2 event types — no cross-event correlation, no race:
 *
 *   On `session.step.ended` (agent turn ended):
 *     - `data.finish === 'tool-calls'` → agent is MID-WORKFLOW (it ended its
 *       turn by calling a tool, not by finishing) → skip.
 *     - `data.finish === 'error'` → ERRORED stop (not a natural completion;
 *       injecting guidance here could interfere with error handling) → skip.
 *     - `data.finish ∈ {stop, length, unknown, content-filter}` → NATURAL
 *       COMPLETION (the model's turn ended without a pending tool call) →
 *       report to Core via `aet event ca-stop --session-id <id>`.
 *
 *   On `session.execution.interrupted` (user/host halted the agent mid-turn):
 *     - `data.reason === 'user'` → USER INTERRUPT → skip (must NOT inject a
 *       "keep working" prompt on a user-initiated stop).
 *     - `data.reason ∈ {shutdown, superseded, inactivity}` → host-initiated
 *       halt → also skip (not a natural completion; agent didn't finish).
 *
 * Why NOT `session.idle` / `session.status idle`: those fire on BOTH natural
 * completion AND user interrupt (both go through the runner's `status.set
 * ({type:"idle"})`), and they also fire after every tool execution while the
 * agent is still working. There is no discriminator in the idle event itself.
 * `session.step.ended` + `finish` discriminator is the only reliable signal.
 *
 * Core's `ca.stop` additionally guards by session: it returns a guidance
 * prompt ONLY when the stopping session matches the session bound to the
 * active workflow. Every no-match returns an empty prompt → we inject nothing
 * and the stop proceeds cleanly. This is the "don't feed AET guidance to an
 * unrelated session" guard.
 *
 * V2 cleanup (D-004): the subscription runs in a background async loop driven
 * by an AbortController; the setup() cleanup function aborts it on plugin
 * unload so the host doesn't keep a dangling iterator.
 */
import { AET_PLUGIN_ID } from '../constants.js';
import { runAetSafe } from '../cli.js';
import type { PluginContext } from '../types.js';

/** V2 OpenCodeEvent shape (subset we consume — duck-typed). */
interface OpenCodeEventLike {
  type: string;
  data?: {
    sessionID?: string;
    /** `session.step.ended` discriminator — how the agent turn ended. */
    finish?: 'stop' | 'length' | 'tool-calls' | 'content-filter' | 'error' | 'unknown';
    /** `session.execution.interrupted` discriminator — who halted the agent. */
    reason?: 'user' | 'shutdown' | 'superseded' | 'inactivity';
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** Cleanup collector — setup() passes this in; we push our abort fn. */
type CleanupCollector = (fn: () => Promise<void> | void) => void;

/**
 * V2 `ctx.event.subscribe()` registration with AbortController cleanup.
 *
 * On a naturally-completed assistant message (no user interrupt, no pending
 * tool call), reports the stopping session to Core (`aet event ca-stop`) and
 * delivers the returned guidance (if any) back to that session via
 * `ctx.session.prompt`. Returns `Promise<void>` — the cleanup fn is
 * registered with the collector passed by setup().
 */
export async function registerSessionStatusHook(
  ctx: PluginContext,
  cleanup: CleanupCollector,
): Promise<void> {
  const abortController = new AbortController();

  // Background subscriber — runs until aborted. Catches its own errors so the
  // host process is never affected by a subscriber crash.
  (async () => {
    try {
      for await (const event of ctx.event.subscribe({ signal: abortController.signal })) {
        try {
          await handleEvent(ctx, event as unknown as OpenCodeEventLike);
        } catch (err) {
          // Per R9, errors are never silenced — log with [AET] prefix.
          console.error(`[${AET_PLUGIN_ID}] session_status event handler error:`, (err as Error).message);
        }
      }
    } catch (err) {
      // The iterator throws on abort (signal) — distinguish real errors.
      if (!abortController.signal.aborted) {
        console.error(`[${AET_PLUGIN_ID}] session_status subscribe error:`, (err as Error).message);
      }
    }
  })();

  // Register cleanup so setup() can abort the subscription on unload.
  cleanup(() => abortController.abort());
}

/** Dispatch a single V2 OpenCode event. Exported for unit testing. */
async function handleEvent(ctx: PluginContext, event: OpenCodeEventLike): Promise<void> {
  if (!event?.type) return;

  // `session.execution.interrupted` — user/host halted the agent mid-turn.
  // NOT a natural completion; skip (Core's session-match guard would also
  // return empty, but skipping the CLI spawn entirely is cheaper + clearer).
  if (event.type === 'session.execution.interrupted') {
    return;
  }

  // `session.step.ended` — agent turn ended. The `finish` discriminator tells
  // us HOW it ended; only natural completion triggers ca.stop.
  if (event.type === 'session.step.ended') {
    const sessionID = event.data?.sessionID;
    if (!sessionID) return;
    const finish = event.data?.finish;
    // `tool-calls` = agent is mid-workflow (will continue after tool result).
    // `error` = errored stop (injecting guidance could interfere with error
    //           handling; the agent didn't naturally complete its turn).
    // Both are skipped. `stop` / `length` / `unknown` / `content-filter` are
    // natural completions (agent stopped producing output, no pending tool
    // call) → report to Core.
    if (finish !== 'stop' && finish !== 'length' && finish !== 'unknown' && finish !== 'content-filter') {
      return;
    }
    await deliverCaStop(ctx, sessionID);
    return;
  }

  // Other events (session.idle, session.status, session.created, session.updated,
  // etc.) are NOT ca.stop triggers — session.idle/status fire on both natural
  // completion AND user interrupt (no discriminator), and after every tool call.
  // Intentionally no logging on this hot path (see N1 finding — console.debug
  // per-event would be pure waste on a per-tool-call event stream).
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
  // working. V2 ctx.session.prompt takes { sessionID, text } (D-009 — no
  // legacy `prompt({ parts: [...] })` shape; the V2 API takes a flat `text`
  // field).
  await ctx.session.prompt({
    sessionID,
    text,
  });
}
