import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyEventsViaClient, applyResult } from './json_to_op.js';
import { out, err } from '../../definitions/events.js';
import type { CommandResult, OutputEvent } from './types.js';
import type { PluginContext } from './types.js';

// `out(...)` returns the discriminated-union OutputEvent from core definitions
// (typed payloads). `applyEventsViaClient` consumes the plugin-local OutputEvent
// shape (`payload: Record<string, unknown>`). Cast through the local type to
// bridge the one-way dependency (plugins → definitions, NOT plugins → core).
const ev = (id: Parameters<typeof out>[0], payload: Parameters<typeof out>[1]): OutputEvent =>
  ({ id, payload } as unknown as OutputEvent);

/**
 * V2 mock ctx: ctx.session.create / ctx.session.prompt + console.log/warn/error/debug.
 * V2 ctx has NO `client` (D-009) — the V1 OpencodeClient shape is gone.
 *
 * The spies are (re)created per-test via beforeEach so call counts don't
 * accumulate across tests.
 */
let ctx: PluginContext;
let session: { create: ReturnType<typeof vi.fn>; prompt: ReturnType<typeof vi.fn> };
let logSpy: ReturnType<typeof vi.spyOn>;
let consoleError: ReturnType<typeof vi.spyOn>;
let consoleWarn: ReturnType<typeof vi.spyOn>;
let consoleDebug: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  session = {
    create: vi.fn(async () => ({ id: 'sess-1' })),
    prompt: vi.fn(async () => ({})),
  };
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => {});
  ctx = { session } as unknown as PluginContext;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('applyEventsViaClient (V2 — ctx.session + console, no host-client property)', () => {
  it('clears context by creating a session + logging a hint (tui DEGRADED — AC-023)', async () => {
    await applyEventsViaClient(ctx, [ev('context.clear', { reason: 'next step' })]);
    expect(session.create).toHaveBeenCalledWith({});
    // console.log was called with the [AET] context.clear hint including session id + AC-023 note.
    expect(logSpy).toHaveBeenCalled();
    const msg = logSpy.mock.calls[0][0] as string;
    expect(msg).toContain('[aet]');
    expect(msg).toContain('context.clear');
    expect(msg).toContain('AC-023');
    expect(msg).toContain('next step');
  });

  it('logs prompt.inject as a warn (delivery tracked by plugin session)', async () => {
    await applyEventsViaClient(ctx, [ev('prompt.inject', { text: 'hi', type: 'task' })]);
    expect(consoleWarn).toHaveBeenCalled();
    const msg = consoleWarn.mock.calls[0][0] as string;
    expect(msg).toContain('[aet]');
    expect(msg).toContain('prompt.inject');
    expect(consoleWarn.mock.calls[0][1]).toEqual({ text: 'hi' });
  });

  it('logs hook.func and inject_system via console.log (info-level)', async () => {
    await applyEventsViaClient(ctx, [
      ev('hook.func', { command: 'node', cwd: '/tmp' }),
      ev('prompt.inject_system', { text: 'sys' }),
    ]);
    expect(logSpy).toHaveBeenCalledTimes(2);
    expect(logSpy.mock.calls[0][0]).toContain('hook.func');
    expect(logSpy.mock.calls[1][0]).toContain('prompt.inject_system');
  });

  it('logs errors at error level (R9)', async () => {
    await applyEventsViaClient(ctx, [ev('error', { code: 'E1', message: 'bad' })]);
    expect(consoleError).toHaveBeenCalled();
    const msg = consoleError.mock.calls[0][0] as string;
    expect(msg).toContain('[aet]');
    expect(msg).toContain('[AET ERROR E1] bad');
  });

  it('logs unknown events via console.debug', async () => {
    await applyEventsViaClient(ctx, [{ id: 'mystery', payload: {} } as unknown as OutputEvent]);
    expect(consoleDebug).toHaveBeenCalled();
    const msg = consoleDebug.mock.calls[0][0] as string;
    expect(msg).toContain('unknown event');
  });
});

describe('applyResult', () => {
  it('synthesizes + applies an error event when the command failed (console.error, R9)', async () => {
    const result: CommandResult = {
      ok: false,
      prompt: 'ERROR: X — y',
      events: [],
      error: { code: 'X', message: 'y' },
    };
    await applyResult(ctx, result, 'via-client');
    expect(consoleError).toHaveBeenCalled();
    const msg = consoleError.mock.calls[0][0] as string;
    expect(msg).toContain('[AET ERROR X] y');
  });

  it('does nothing when ok with no events', async () => {
    await applyResult(ctx, { ok: true, prompt: 'fine', events: [] }, 'via-client');
    expect(logSpy).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(consoleDebug).not.toHaveBeenCalled();
  });

  it('applies in-hook events into an output object when mode is in-hook', async () => {
    const output = { parts: [] as { type: string; text: string }[] };
    await applyResult(ctx, { ok: true, prompt: '', events: [ev('prompt.inject', { text: 'x', type: 'task' })] }, 'in-hook', output);
    expect(output.parts.map((p) => p.text)).toEqual(['x']);
  });

  it('injects the top-level result.prompt as a text part (in-hook) — aligns with CC additionalContext', async () => {
    const output = { parts: [] as { type: string; text: string }[] };
    const result: CommandResult = {
      ok: true,
      prompt: '## AET 工作流已启动\n请调用 `aet workflow handover` 推进\n\n---\nstep-1 task',
      events: [],
    };
    await applyResult(ctx, result, 'in-hook', output);
    expect(output.parts.map((p) => p.text)).toEqual([result.prompt]);
  });

  it('injects prompt then applies events (in-hook), matching CC ordering', async () => {
    const output = { parts: [] as { type: string; text: string }[] };
    await applyResult(
      ctx,
      { ok: true, prompt: 'banner', events: [ev('context.clear', { reason: 'next step' })] },
      'in-hook',
      output,
    );
    expect(output.parts.map((p) => p.text)).toEqual(['banner', expect.stringContaining('新会话')]);
  });

  it('has zero host-client residue (V2 ctx has no client property — D-009)', async () => {
    // Sanity check: the mock ctx we built has `session` but NOT a host-client property.
    // If applyEventsViaClient tried to read a host-client property, this test would crash.
    expect((ctx as unknown as { client?: unknown }).client).toBeUndefined();
    await applyEventsViaClient(ctx, [ev('context.clear', { reason: 'x' })]);
    // No throw = success.
  });
});

// err() helper import kept for parity with the V1 test (unused but mirrors import surface).
void err;
