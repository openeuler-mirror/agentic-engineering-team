import { describe, expect, it, vi } from 'vitest';
import { applyEventsViaClient, applyResult } from './json_to_op.js';
import { out, err } from '../../definitions/events.js';
import type { CommandResult, OutputEvent } from '../../definitions/events.js';
import type { PluginContext } from './types.js';

function mockCtx(): { ctx: PluginContext; session: any; tui: any; log: any } {
  const session = { create: vi.fn(async () => ({ id: 'sess-1' })), prompt: vi.fn(async () => ({})) };
  const tui = { publish: vi.fn(async () => ({})) };
  const log = vi.fn(async () => ({}));
  const ctx = { client: { session, tui, app: { log } } } as unknown as PluginContext;
  return { ctx, session, tui, log };
}

describe('applyEventsViaClient', () => {
  it('clears context by creating a session + publishing a tui session.select', async () => {
    const { ctx, session, tui } = mockCtx();
    await applyEventsViaClient(ctx, [out('context.clear', { reason: 'next step' })]);
    expect(session.create).toHaveBeenCalledWith({});
    expect(tui.publish).toHaveBeenCalledWith({
      type: 'tui.session.select',
      sessionID: 'sess-1',
      reason: 'next step',
    });
  });

  it('degrades when there is no tui surface', async () => {
    const { ctx, session } = mockCtx();
    const { ctx: noTui } = mockCtx();
    (noTui.client as any).tui = undefined;
    (noTui.client as any).session = session;
    await applyEventsViaClient(noTui, [out('context.clear', { reason: 'x' })]);
    expect(session.create).toHaveBeenCalledWith({});
  });

  it('logs prompt.inject as a warn (delivery tracked by plugin session)', async () => {
    const { ctx, log } = mockCtx();
    await applyEventsViaClient(ctx, [out('prompt.inject', { text: 'hi', type: 'task' })]);
    expect(log.mock.calls[0][0].body.level).toBe('warn');
    expect(log.mock.calls[0][0].body.extra.text).toBe('hi');
  });

  it('logs hook.func and inject_system info', async () => {
    const { ctx, log } = mockCtx();
    await applyEventsViaClient(ctx, [
      out('hook.func', { command: 'node', cwd: '/tmp' }),
      out('prompt.inject_system', { text: 'sys' }),
    ]);
    expect(log.mock.calls[0][0].body.level).toBe('info');
    expect(log.mock.calls[1][0].body.level).toBe('info');
  });

  it('logs errors at error level (R9)', async () => {
    const { ctx, log } = mockCtx();
    await applyEventsViaClient(ctx, [out('error', { code: 'E1', message: 'bad' })]);
    expect(log.mock.calls[0][0].body.level).toBe('error');
    expect(log.mock.calls[0][0].body.message).toContain('[AET ERROR E1] bad');
  });

  it('logs unknown events at debug level', async () => {
    const { ctx, log } = mockCtx();
    await applyEventsViaClient(ctx, [{ id: 'mystery', payload: {} } as OutputEvent]);
    expect(log.mock.calls[0][0].body.level).toBe('debug');
  });
});

describe('applyResult', () => {
  it('synthesizes + applies an error event when the command failed', async () => {
    const { ctx, log } = mockCtx();
    const result: CommandResult = {
      ok: false,
      prompt: 'ERROR: X — y',
      events: [],
      error: { code: 'X', message: 'y' },
    };
    await applyResult(ctx, result, 'via-client');
    expect(log.mock.calls[0][0].body.level).toBe('error');
    expect(log.mock.calls[0][0].body.message).toContain('X');
  });

  it('does nothing when ok with no events', async () => {
    const { ctx, log } = mockCtx();
    await applyResult(ctx, { ok: true, prompt: 'fine', events: [] }, 'via-client');
    expect(log).not.toHaveBeenCalled();
  });

  it('applies in-hook events into an output object when mode is in-hook', async () => {
    const { ctx } = mockCtx();
    const output = { parts: [] as { type: string; text: string }[] };
    await applyResult(ctx, { ok: true, prompt: '', events: [out('prompt.inject', { text: 'x', type: 'task' })] }, 'in-hook', output);
    expect(output.parts.map((p) => p.text)).toEqual(['x']);
  });

  it('injects the top-level result.prompt as a text part (in-hook) — aligns with CC additionalContext', async () => {
    const { ctx } = mockCtx();
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
    const { ctx } = mockCtx();
    const output = { parts: [] as { type: string; text: string }[] };
    await applyResult(
      ctx,
      { ok: true, prompt: 'banner', events: [out('context.clear', { reason: 'next step' })] },
      'in-hook',
      output,
    );
    expect(output.parts.map((p) => p.text)).toEqual(['banner', expect.stringContaining('新会话')]);
  });
});