import { beforeEach, describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';
import type { CcHookInput } from '../../types.js';

const { emit, debugLog } = vi.hoisted(() => ({
  emit: vi.fn(),
  debugLog: vi.fn(),
}));

vi.mock('./shared.js', () => ({
  emit,
  debugLog,
  AET_AGENT_ID: 'claude-code',
  AET_COMMANDS_DIR: '.claude/commands',
  AET_PLUGIN_INIT_RE: /aet\s+plugin\s+init\b/,
  AET_WORKFLOW_RE: /aet\s+workflow\s+\S+/,
}));

// Mock the filesystem + homedir so the test asserts the EXACT mkdir call
// without touching the real home dir.
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, mkdirSync: vi.fn() };
});
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => '/home/fake' };
});

import { mkdirSync } from 'node:fs';
import { handleSessionStart } from './session_start.js';

function sessionInput(cwd: string): CcHookInput {
  return { hook_event_name: 'SessionStart', cwd } as unknown as CcHookInput;
}

describe('handleSessionStart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mkdirSync as ReturnType<typeof vi.fn>).mockClear();
  });

  it('creates the global commands dir', async () => {
    handleSessionStart(sessionInput('/proj'));

    expect(mkdirSync).toHaveBeenCalledWith(
      join('/home/fake', '.claude', 'commands'),
      { recursive: true },
    );
  });

  it('does not touch the project dir', () => {
    handleSessionStart(sessionInput('/proj'));

    const calls = (mkdirSync as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(calls).not.toContain(join('/proj', '.claude', 'commands'));
  });

  it('does not crash when the dir cannot be created', () => {
    (mkdirSync as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('EACCES');
    });

    expect(() => handleSessionStart(sessionInput('/proj'))).not.toThrow();
    expect(debugLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ensure_global_commands_dir_failed' }),
    );
  });
});