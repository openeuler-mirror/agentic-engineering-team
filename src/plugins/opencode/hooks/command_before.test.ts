import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandResult, PluginContext } from '../types.js';

const { runAetSafe, applyResult } = vi.hoisted(() => ({
  runAetSafe: vi.fn(),
  applyResult: vi.fn(),
}));

vi.mock('../cli.js', () => ({ runAetSafe }));
vi.mock('../json_to_op.js', () => ({ applyResult }));

import { registerCommandBeforeHook } from './command_before.js';

interface CapturedPromptHook {
  (event: { sessionID: string; prompt: { text: string } }): Promise<void>;
}

function makeCtx(): {
  ctx: PluginContext;
  hook: CapturedPromptHook;
  sessionHook: ReturnType<typeof vi.fn>;
} {
  const sessionHook = vi.fn(async (name: string, cb: CapturedPromptHook) => {
    capturedHook = cb;
    return { dispose: vi.fn() };
  });
  let capturedHook: CapturedPromptHook = vi.fn() as unknown as CapturedPromptHook;
  const ctx = { session: { hook: sessionHook } } as unknown as PluginContext;
  // registerCommandBeforeHook awaits ctx.session.hook and captures the callback;
  // we expose it via a closure so tests can invoke it with a payload.
  return {
    ctx,
    sessionHook,
    get hook() {
      return capturedHook;
    },
  } as unknown as { ctx: PluginContext; hook: CapturedPromptHook; sessionHook: ReturnType<typeof vi.fn> };
}

function okResult(): CommandResult {
  return {
    ok: true,
    prompt: '## banner\nstep-1 task',
    events: [{ id: 'prompt.inject', payload: { text: 'step-1 task' } }],
    data: { status: 'step_advanced', workflow: 'design', currentStep: 's1', nextStep: null },
  };
}

describe('V2 ctx.session.hook("prompt") — slash command routing', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it('runs command-init for a slash command and applies events (mutates event.prompt.text)', async () => {
    const { ctx, sessionHook } = makeCtx();
    runAetSafe.mockResolvedValue(okResult());
    applyResult.mockImplementation(async (_ctx: unknown, _r: unknown, _mode: string, output: { parts: { type: string; text: string }[] }) => {
      output.parts.push({ type: 'text', text: '## banner\nstep-1 task' });
    });
    await registerCommandBeforeHook(ctx);

    expect(sessionHook).toHaveBeenCalledWith('prompt', expect.any(Function));
    const cb = sessionHook.mock.calls[0][1] as CapturedPromptHook;
    const event = { sessionID: 's', prompt: { text: '/design' } };
    await cb(event);

    expect(runAetSafe).toHaveBeenCalledWith(
      ['workflow', 'command-init', '--name', 'design', '--session-id', 's'],
      { cwd: expect.any(String) },
    );
    // applyResult was called with ctx, the result, 'in-hook', and a parts array.
    // (The mock impl pushes to the parts array by reference, so we check the
    // call shape with expect.objectContaining rather than a literal empty array.)
    expect(applyResult).toHaveBeenCalledWith(ctx, expect.objectContaining({ ok: true }), 'in-hook', expect.objectContaining({ parts: expect.any(Array) }));
    // event.prompt.text was replaced with the assembled agent-visible text.
    expect(event.prompt.text).toBe('## banner\nstep-1 task');
  });

  it('forwards the user arguments as --argument when present', async () => {
    const { ctx, sessionHook } = makeCtx();
    runAetSafe.mockResolvedValue(okResult());
    applyResult.mockImplementation(async () => {});
    await registerCommandBeforeHook(ctx);
    const cb = sessionHook.mock.calls[0][1] as CapturedPromptHook;
    const event = { sessionID: 's', prompt: { text: '/design 做一个登录功能' } };
    await cb(event);

    expect(runAetSafe).toHaveBeenCalledWith(
      ['workflow', 'command-init', '--name', 'design', '--argument', '做一个登录功能', '--session-id', 's'],
      { cwd: expect.any(String) },
    );
  });

  it('omits --argument when arguments is whitespace-only', async () => {
    const { ctx, sessionHook } = makeCtx();
    runAetSafe.mockResolvedValue(okResult());
    applyResult.mockImplementation(async () => {});
    await registerCommandBeforeHook(ctx);
    const cb = sessionHook.mock.calls[0][1] as CapturedPromptHook;
    const event = { sessionID: 's', prompt: { text: '/design   ' } };
    await cb(event);

    expect(runAetSafe).toHaveBeenCalledWith(
      ['workflow', 'command-init', '--name', 'design', '--session-id', 's'],
      { cwd: expect.any(String) },
    );
  });

  it('passes through (no prompt mutation) on UNKNOWN_WORKFLOW', async () => {
    const { ctx, sessionHook } = makeCtx();
    runAetSafe.mockResolvedValue({
      ok: false,
      prompt: 'ERROR: UNKNOWN_WORKFLOW — no such workflow',
      events: [],
      error: { code: 'UNKNOWN_WORKFLOW', message: 'no such workflow' },
    });
    await registerCommandBeforeHook(ctx);
    const cb = sessionHook.mock.calls[0][1] as CapturedPromptHook;
    const event = { sessionID: 's', prompt: { text: '/aet-unknown' } };
    await cb(event);

    expect(applyResult).not.toHaveBeenCalled();
    // prompt.text left unchanged (pass-through to native command execute).
    expect(event.prompt.text).toBe('/aet-unknown');
  });

  it('passes /init through (no bootstrap injection, native command expansion)', async () => {
    const { ctx, sessionHook } = makeCtx();
    runAetSafe.mockResolvedValue({
      ok: false,
      prompt: 'ERROR: UNKNOWN_WORKFLOW — no such workflow',
      events: [],
      error: { code: 'UNKNOWN_WORKFLOW', message: 'no such workflow' },
    });
    await registerCommandBeforeHook(ctx);
    const cb = sessionHook.mock.calls[0][1] as CapturedPromptHook;
    const event = { sessionID: 's', prompt: { text: '/init' } };
    await cb(event);

    expect(runAetSafe).toHaveBeenCalledWith(
      ['workflow', 'command-init', '--name', 'init', '--session-id', 's'],
      { cwd: expect.any(String) },
    );
    expect(applyResult).not.toHaveBeenCalled();
    expect(event.prompt.text).toBe('/init');
  });

  it('bails on a non-slash prompt without spawning', async () => {
    const { ctx, sessionHook } = makeCtx();
    await registerCommandBeforeHook(ctx);
    const cb = sessionHook.mock.calls[0][1] as CapturedPromptHook;
    await cb({ sessionID: 's', prompt: { text: 'just a question' } });
    expect(runAetSafe).not.toHaveBeenCalled();
  });

  it('bails on an empty prompt text without spawning', async () => {
    const { ctx, sessionHook } = makeCtx();
    await registerCommandBeforeHook(ctx);
    const cb = sessionHook.mock.calls[0][1] as CapturedPromptHook;
    await cb({ sessionID: 's', prompt: { text: '' } });
    expect(runAetSafe).not.toHaveBeenCalled();
  });
});
