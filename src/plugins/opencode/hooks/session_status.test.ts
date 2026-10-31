import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginContext, CommandResult } from '../types.js';

const { runAetSafe } = vi.hoisted(() => ({ runAetSafe: vi.fn() }));

vi.mock('../cli.js', () => ({ runAetSafe }));

import { registerSessionStatusHook } from './session_status.js';

/** Build an async iterable that yields the provided events. */
function makeEventStream(events: Array<Record<string, unknown>>): AsyncIterable<Record<string, unknown>> {
  return {
    [Symbol.asyncIterator]() {
      let i = 0;
      return {
        next(): Promise<IteratorResult<Record<string, unknown>>> {
          if (i < events.length) {
            return Promise.resolve({ value: events[i++], done: false });
          }
          // Block forever — the test's cleanup aborts to end the loop.
          return new Promise(() => {});
        },
      };
    },
  };
}

function makeCtx(events: Array<Record<string, unknown>> = []): {
  ctx: PluginContext;
  prompt: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  cleanupFns: Array<() => void>;
} {
  const prompt = vi.fn(async () => ({}));
  const stream = makeEventStream(events);
  const subscribe = vi.fn((opts?: { signal?: AbortSignal }) => {
    // If signal already aborted, return an empty stream.
    if (opts?.signal?.aborted) return makeEventStream([]);
    return stream;
  });
  const cleanupFns: Array<() => void> = [];
  const ctx = {
    event: { subscribe },
    session: { prompt },
  } as unknown as PluginContext;
  return { ctx, prompt, subscribe, cleanupFns };
}

function stopResult(prompt: string): CommandResult {
  return { ok: true, prompt, events: [] };
}

/** A final assistant message. `opts` overrides/adds fields. */
function finalAssistantMessage(opts: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    role: 'assistant',
    time: { created: 1, completed: 2 },
    content: [],
    ...opts,
  };
}

/** A message.updated event with the given sessionID + info. */
function messageUpdated(sessionID: string, info: Record<string, unknown>): Record<string, unknown> {
  return { type: 'message.updated', data: { sessionID, info } };
}

describe('ca.stop guard — V2 ctx.event.subscribe + AbortController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fires ca.stop on a naturally-completed assistant message (no tool, no abort error)', async () => {
    const { ctx, prompt, cleanupFns } = makeCtx([
      messageUpdated('sess-1', finalAssistantMessage()),
    ]);
    runAetSafe.mockResolvedValue(stopResult('## AET 工作流进行中 — 请勿停止\n...'));

    await registerSessionStatusHook(ctx, (fn) => cleanupFns.push(fn as () => void));
    // Wait a microtask for the async subscriber to process the event.
    await new Promise((r) => setImmediate(r));

    expect(runAetSafe).toHaveBeenCalledWith(
      ['event', 'ca-stop', '--session-id', 'sess-1'],
      { cwd: expect.any(String) },
    );
    expect(prompt).toHaveBeenCalledWith({
      sessionID: 'sess-1',
      text: '## AET 工作流进行中 — 请勿停止\n...',
    });

    // Cleanup aborts the subscription.
    for (const fn of cleanupFns) fn();
  });

  it('does NOT fire ca.stop on a user-interrupt message (error.name === MessageAbortedError)', async () => {
    const { ctx, cleanupFns } = makeCtx([
      messageUpdated('sess-2', finalAssistantMessage({ error: { name: 'MessageAbortedError' } })),
    ]);
    runAetSafe.mockResolvedValue(stopResult('guidance'));

    await registerSessionStatusHook(ctx, (fn) => cleanupFns.push(fn as () => void));
    await new Promise((r) => setImmediate(r));

    expect(runAetSafe).not.toHaveBeenCalled();
    for (const fn of cleanupFns) fn();
  });

  it('does NOT fire ca.stop when the assistant message has a pending tool call (mid-workflow)', async () => {
    const { ctx, cleanupFns } = makeCtx([
      messageUpdated('sess-3', finalAssistantMessage({ content: [{ type: 'tool' }] })),
    ]);
    runAetSafe.mockResolvedValue(stopResult('guidance'));

    await registerSessionStatusHook(ctx, (fn) => cleanupFns.push(fn as () => void));
    await new Promise((r) => setImmediate(r));

    expect(runAetSafe).not.toHaveBeenCalled();
    for (const fn of cleanupFns) fn();
  });

  it('does NOT fire ca.stop on a non-final assistant message (time.completed absent)', async () => {
    const { ctx, cleanupFns } = makeCtx([
      messageUpdated('sess-4', { role: 'assistant', time: { created: 1 }, content: [] }),
    ]);
    await registerSessionStatusHook(ctx, (fn) => cleanupFns.push(fn as () => void));
    await new Promise((r) => setImmediate(r));
    expect(runAetSafe).not.toHaveBeenCalled();
    for (const fn of cleanupFns) fn();
  });

  it('does NOT fire ca.stop on a user message or non-assistant message', async () => {
    const { ctx, cleanupFns } = makeCtx([
      messageUpdated('sess-5', { role: 'user', time: { created: 1, completed: 2 } }),
      messageUpdated('sess-5', { role: 'assistant', time: { created: 1 }, content: [] }),
    ]);
    await registerSessionStatusHook(ctx, (fn) => cleanupFns.push(fn as () => void));
    await new Promise((r) => setImmediate(r));
    expect(runAetSafe).not.toHaveBeenCalled();
    for (const fn of cleanupFns) fn();
  });

  it('injects nothing when ca.stop returns an empty prompt (no session match)', async () => {
    const { ctx, prompt, cleanupFns } = makeCtx([
      messageUpdated('sess-6', finalAssistantMessage()),
    ]);
    runAetSafe.mockResolvedValue(stopResult(''));

    await registerSessionStatusHook(ctx, (fn) => cleanupFns.push(fn as () => void));
    await new Promise((r) => setImmediate(r));

    expect(runAetSafe).toHaveBeenCalled();
    expect(prompt).not.toHaveBeenCalled();
    for (const fn of cleanupFns) fn();
  });

  it('does NOT fire ca.stop on session.idle (ambiguous with user interrupt and post-tool idle)', async () => {
    const { ctx, cleanupFns } = makeCtx([
      { type: 'session.idle', data: { sessionID: 'sess-7' } },
      { type: 'session.status', data: { sessionID: 'sess-7', status: { type: 'idle' } } },
    ]);
    runAetSafe.mockResolvedValue(stopResult('guidance'));

    await registerSessionStatusHook(ctx, (fn) => cleanupFns.push(fn as () => void));
    await new Promise((r) => setImmediate(r));

    expect(runAetSafe).not.toHaveBeenCalled();
    for (const fn of cleanupFns) fn();
  });

  it('does nothing for unrelated events', async () => {
    const { ctx, cleanupFns } = makeCtx([
      { type: 'session.updated', data: { sessionID: 'sess-8' } },
      { type: 'session.created', data: { sessionID: 'sess-8' } },
    ]);
    await registerSessionStatusHook(ctx, (fn) => cleanupFns.push(fn as () => void));
    await new Promise((r) => setImmediate(r));
    expect(runAetSafe).not.toHaveBeenCalled();
    for (const fn of cleanupFns) fn();
  });

  it('does nothing when no sessionID is present', async () => {
    const { ctx, cleanupFns } = makeCtx([
      messageUpdated('', finalAssistantMessage()),
    ]);
    await registerSessionStatusHook(ctx, (fn) => cleanupFns.push(fn as () => void));
    await new Promise((r) => setImmediate(r));
    expect(runAetSafe).not.toHaveBeenCalled();
    for (const fn of cleanupFns) fn();
  });

  it('registers an AbortController cleanup that aborts the subscription', async () => {
    const { ctx, subscribe, cleanupFns } = makeCtx([]);
    await registerSessionStatusHook(ctx, (fn) => cleanupFns.push(fn as () => void));
    expect(subscribe).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
    expect(cleanupFns.length).toBe(1);
    // Abort should not throw.
    expect(() => cleanupFns[0]()).not.toThrow();
  });
});
