import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { CommandResult } from './types.js';

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));

vi.mock('node:child_process', () => ({ spawn }));

import { runAet, runAetSafe } from './cli.js';

interface FakeChild {
  stdout: EventEmitter;
  stderr: EventEmitter;
  on: EventEmitter['on'];
}

/** Build a fake child_process child whose I/O is driven by the returned emitters. */
function makeChild(): {
  child: FakeChild;
  stdout: EventEmitter;
  stderr: EventEmitter;
  childBus: EventEmitter;
} {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const childBus = new EventEmitter();
  const child = {
    stdout,
    stderr,
    on: childBus.on.bind(childBus),
  } as FakeChild;
  return { child, stdout, stderr, childBus };
}

function emitJson(stdout: EventEmitter, childBus: EventEmitter, result: CommandResult, code = 0): void {
  stdout.emit('data', Buffer.from(JSON.stringify(result)));
  childBus.emit('close', code);
}

describe('runAet', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('spawns with --output json appended and resolves the parsed result', async () => {
    const { child, stdout, childBus } = makeChild();
    spawn.mockReturnValue(child);

    const promise = runAet(['workflow', 'init', '--name', 'design']);
    emitJson(stdout, childBus, { ok: true, prompt: 'started', events: [] });

    const result = await promise;
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn.mock.calls[0][1]).toEqual(['workflow', 'init', '--name', 'design', '--output', 'json']);
    expect(result).toMatchObject({ ok: true, prompt: 'started' });
  });

  it('respects env/cwd options', async () => {
    const { child, stdout, childBus } = makeChild();
    spawn.mockReturnValue(child);
    const env = { AET_BIN: '/usr/local/bin/aet' };
    const promise = runAet(['status'], { env, cwd: '/tmp/x' });
    emitJson(stdout, childBus, { ok: true, prompt: 'ok', events: [] });
    await promise;
    expect(spawn.mock.calls[0][2]).toMatchObject({ env, cwd: '/tmp/x' });
  });

  it('rejects on a spawn error event', async () => {
    const { child, childBus } = makeChild();
    spawn.mockReturnValue(child);
    const promise = runAet(['status']);
    childBus.emit('error', new Error('ENOENT'));
    await expect(promise).rejects.toThrow(/failed to spawn 'aet'/);
  });

  it('rejects on empty stdout', async () => {
    const { child, childBus } = makeChild();
    spawn.mockReturnValue(child);
    const promise = runAet(['status']);
    childBus.emit('close', 1);
    await expect(promise).rejects.toThrow(/empty stdout/);
  });

  it('rejects on non-JSON stdout', async () => {
    const { child, stdout, childBus } = makeChild();
    spawn.mockReturnValue(child);
    const promise = runAet(['status']);
    stdout.emit('data', Buffer.from('not json'));
    childBus.emit('close', 0);
    await expect(promise).rejects.toThrow(/non-JSON stdout/);
  });
});

describe('runAetSafe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves normally on success', async () => {
    const { child, stdout, childBus } = makeChild();
    spawn.mockReturnValue(child);
    const promise = runAetSafe(['status']);
    emitJson(stdout, childBus, { ok: true, prompt: 'fine', events: [] });
    await expect(promise).resolves.toMatchObject({ ok: true });
  });

  it('converts a spawn failure into a synthetic error result (never rejects)', async () => {
    const { child, childBus } = makeChild();
    spawn.mockReturnValue(child);
    const promise = runAetSafe(['status']);
    childBus.emit('error', new Error('ENOENT'));
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('PLUGIN_SPAWN_FAILED');
  });
});