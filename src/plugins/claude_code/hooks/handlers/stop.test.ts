import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CcHookInput } from '../../types.js';
import type { CommandResult } from '../../../../definitions/events.js';

const { emit, debugLog, emitStopBlock, runAet } = vi.hoisted(() => ({
  emit: vi.fn(),
  debugLog: vi.fn(),
  emitStopBlock: vi.fn(),
  runAet: vi.fn(),
}));

vi.mock('./shared.js', () => ({
  emit,
  debugLog,
  emitStopBlock,
  runAet,
  AET_AGENT_ID: 'claude-code',
  AET_PLUGIN_INIT_RE: /aet\s+plugin\s+init\b/,
  AET_WORKFLOW_RE: /aet\s+workflow\s+\S+/,
}));

import { handleStop } from './stop.js';

function stopInput(session_id: string): CcHookInput {
  return { hook_event_name: 'Stop', session_id, cwd: '/tmp' } as unknown as CcHookInput;
}

function guidance(status: string, currentStep?: string): CommandResult {
  return {
    ok: true,
    prompt: '## AET 工作流进行中 — 请勿停止\n...',
    events: [],
    data: { status: status as never, currentStep },
  };
}

describe('handleStop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports the stopping session and BLOCKS the stop with the guidance as reason', async () => {
    runAet.mockResolvedValue(guidance('active', 's1'));
    await handleStop(stopInput('sess-1'));

    expect(runAet).toHaveBeenCalledWith(
      ['event', 'ca-stop', '--session-id', 'sess-1', '--output', 'json'],
      '/tmp',
    );
    // The guidance is fed back as the Stop decision `reason` (block), NOT
    // additionalContext.
    expect(emitStopBlock).toHaveBeenCalledWith('## AET 工作流进行中 — 请勿停止\n...');
    expect(emit).not.toHaveBeenCalledWith(expect.objectContaining({ hookSpecificOutput: expect.anything() }));
  });

  it('emits null (lets the stop proceed) when ca.stop returns an empty prompt', async () => {
    runAet.mockResolvedValue({ ok: true, prompt: '', events: [] });
    await handleStop(stopInput('sess-2'));
    expect(emit).toHaveBeenCalledWith(null);
    expect(emitStopBlock).not.toHaveBeenCalled();
  });

  it('emits null when there is no session_id', async () => {
    await handleStop({ hook_event_name: 'Stop' } as unknown as CcHookInput);
    expect(runAet).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(null);
    expect(emitStopBlock).not.toHaveBeenCalled();
  });

  it('emits null (does not block the stop) when the CLI spawn fails', async () => {
    runAet.mockResolvedValue(null);
    await handleStop(stopInput('sess-3'));
    expect(emit).toHaveBeenCalledWith(null);
    expect(emitStopBlock).not.toHaveBeenCalled();
  });
});