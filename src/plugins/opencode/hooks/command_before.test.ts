import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandResult, PluginContext } from '../types.js';

const { runAetSafe, applyResult } = vi.hoisted(() => ({
  runAetSafe: vi.fn(),
  applyResult: vi.fn(),
}));

vi.mock('../cli.js', () => ({ runAetSafe }));
vi.mock('../json_to_op.js', () => ({ applyResult }));

import { registerCommandBeforeHook } from './command_before.js';

function makeCtx(): { ctx: PluginContext; hook: (input: unknown, output: unknown) => Promise<void>; log: ReturnType<typeof vi.fn> } {
  const log = vi.fn(async () => {});
  const ctx = { client: { app: { log } } } as unknown as PluginContext;
  const hook = registerCommandBeforeHook(ctx);
  return { ctx, hook, log };
}

function okResult(): CommandResult {
  return {
    ok: true,
    prompt: '## banner\nstep-1 task',
    events: [{ id: 'prompt.inject', payload: { text: 'step-1 task' } }],
    data: { status: 'step_advanced', workflow: 'design', currentStep: 's1', nextStep: null },
  };
}

describe('command.execute.before', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs command-init for a registered command and applies events in-hook', async () => {
    const { ctx, hook } = makeCtx();
    runAetSafe.mockResolvedValue(okResult());
    const output = { parts: [] as unknown[] };
    await hook({ command: 'design', sessionID: 's', arguments: '' }, output);

    expect(runAetSafe).toHaveBeenCalledWith(
      ['workflow', 'command-init', '--name', 'design'],
      { cwd: expect.any(String) },
    );
    expect(applyResult).toHaveBeenCalledWith(ctx, expect.objectContaining({ ok: true }), 'in-hook', {
      parts: output.parts,
    });
  });

  it('forwards the user arguments as --argument when present (string)', async () => {
    const { hook } = makeCtx();
    runAetSafe.mockResolvedValue(okResult());
    const output = { parts: [] as unknown[] };
    await hook({ command: 'design', sessionID: 's', arguments: '做一个登录功能' }, output);

    expect(runAetSafe).toHaveBeenCalledWith(
      ['workflow', 'command-init', '--name', 'design', '--argument', '做一个登录功能'],
      { cwd: expect.any(String) },
    );
  });

  it('forwards the user arguments as --argument when present (string[])', async () => {
    const { hook } = makeCtx();
    runAetSafe.mockResolvedValue(okResult());
    const output = { parts: [] as unknown[] };
    await hook({ command: 'design', sessionID: 's', arguments: ['做一个', '登录功能'] }, output);

    expect(runAetSafe).toHaveBeenCalledWith(
      ['workflow', 'command-init', '--name', 'design', '--argument', '做一个 登录功能'],
      { cwd: expect.any(String) },
    );
  });

  it('omits --argument when arguments is whitespace-only', async () => {
    const { hook } = makeCtx();
    runAetSafe.mockResolvedValue(okResult());
    const output = { parts: [] as unknown[] };
    await hook({ command: 'design', sessionID: 's', arguments: '   ' }, output);

    expect(runAetSafe).toHaveBeenCalledWith(
      ['workflow', 'command-init', '--name', 'design'],
      { cwd: expect.any(String) },
    );
  });

  it('passes through (no injection) on UNKNOWN_WORKFLOW', async () => {
    const { hook } = makeCtx();
    runAetSafe.mockResolvedValue({
      ok: false,
      prompt: 'ERROR: UNKNOWN_WORKFLOW — no such workflow',
      events: [],
      error: { code: 'UNKNOWN_WORKFLOW', message: 'no such workflow' },
    });
    const output = { parts: [] as unknown[] };
    await hook({ command: 'aet-unknown', sessionID: 's', arguments: '' }, output);

    expect(applyResult).not.toHaveBeenCalled();
    expect(output.parts).toEqual([]);
  });

  it('passes /enable through (no bootstrap injection, native command expansion)', async () => {
    const { hook } = makeCtx();
    runAetSafe.mockResolvedValue({
      ok: false,
      prompt: 'ERROR: UNKNOWN_WORKFLOW — no such workflow',
      events: [],
      error: { code: 'UNKNOWN_WORKFLOW', message: 'no such workflow' },
    });
    const output = { parts: [] as unknown[] };
    await hook({ command: 'enable', sessionID: 's', arguments: '' }, output);

    // /enable passes through to native command rendering (enable.md → aet-install
    // skill); no bootstrap text is injected by the hook.
    expect(runAetSafe).toHaveBeenCalledWith(
      ['workflow', 'command-init', '--name', 'enable'],
      { cwd: expect.any(String) },
    );
    expect(applyResult).not.toHaveBeenCalled();
    expect(output.parts).toEqual([]);
  });

  it('bails on a malformed payload without spawning', async () => {
    const { hook, log } = makeCtx();
    await hook({ command: '', sessionID: 's' }, { parts: [] });
    expect(runAetSafe).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalled();
  });
});