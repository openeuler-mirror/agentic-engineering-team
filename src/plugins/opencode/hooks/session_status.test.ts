import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PluginContext, CommandResult } from '../types.js';

const { runAetSafe } = vi.hoisted(() => ({ runAetSafe: vi.fn() }));

vi.mock('../cli.js', () => ({ runAetSafe }));

import { registerSessionStatusHook } from './session_status.js';

function makeCtx(): {
  ctx: PluginContext;
  hook: (input: unknown) => Promise<void>;
  prompt: ReturnType<typeof vi.fn>;
} {
  const prompt = vi.fn(async () => {});
  const ctx = {
    client: {
      app: { log: vi.fn(async () => {}) },
      session: { create: vi.fn(), prompt },
    },
  } as unknown as PluginContext;
  const hook = registerSessionStatusHook(ctx);
  return { ctx, hook, prompt };
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

describe('ca.stop guard — single message.updated judge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fires ca.stop on a naturally-completed assistant message (no tool, no abort error)', async () => {
    const { ctx, hook, prompt } = makeCtx();
    runAetSafe.mockResolvedValue(stopResult('## AET 工作流进行中 — 请勿停止\n...'));

    await hook({
      event: { type: 'message.updated', sessionID: 'sess-1', properties: { info: finalAssistantMessage() } },
    });

    expect(runAetSafe).toHaveBeenCalledWith(
      ['event', 'ca-stop', '--session-id', 'sess-1'],
      { cwd: expect.any(String) },
    );
    expect(prompt).toHaveBeenCalledWith({
      sessionID: 'sess-1',
      prompt: { parts: [{ type: 'text', text: '## AET 工作流进行中 — 请勿停止\n...' }] },
    });
  });

  it('does NOT fire ca.stop on a user-interrupt message (error.name === MessageAbortedError)', async () => {
    const { ctx, hook } = makeCtx();
    runAetSafe.mockResolvedValue(stopResult('guidance'));

    await hook({
      event: {
        type: 'message.updated',
        sessionID: 'sess-2',
        properties: { info: finalAssistantMessage({ error: { name: 'MessageAbortedError' } }) },
      },
    });

    expect(runAetSafe).not.toHaveBeenCalled();
  });

  it('does NOT fire ca.stop when the assistant message has a pending tool call (mid-workflow)', async () => {
    const { ctx, hook } = makeCtx();
    runAetSafe.mockResolvedValue(stopResult('guidance'));

    await hook({
      event: {
        type: 'message.updated',
        sessionID: 'sess-3',
        properties: { info: finalAssistantMessage({ content: [{ type: 'tool' }] }) },
      },
    });

    expect(runAetSafe).not.toHaveBeenCalled();
  });

  it('does NOT fire ca.stop on a non-final assistant message (time.completed absent)', async () => {
    const { ctx, hook } = makeCtx();
    await hook({
      event: {
        type: 'message.updated',
        sessionID: 'sess-4',
        properties: { info: { role: 'assistant', time: { created: 1 }, content: [] } },
      },
    });
    expect(runAetSafe).not.toHaveBeenCalled();
  });

  it('does NOT fire ca.stop on a user message or non-assistant message', async () => {
    const { ctx, hook } = makeCtx();
    await hook({
      event: {
        type: 'message.updated',
        sessionID: 'sess-5',
        properties: { info: { role: 'user', time: { created: 1, completed: 2 } } },
      },
    });
    await hook({
      event: { type: 'message.updated', sessionID: 'sess-5', properties: { info: undefined } },
    });
    expect(runAetSafe).not.toHaveBeenCalled();
  });

  it('injects nothing when ca.stop returns an empty prompt (no session match)', async () => {
    const { ctx, hook, prompt } = makeCtx();
    runAetSafe.mockResolvedValue(stopResult(''));

    await hook({
      event: { type: 'message.updated', sessionID: 'sess-6', properties: { info: finalAssistantMessage() } },
    });

    expect(runAetSafe).toHaveBeenCalled();
    expect(prompt).not.toHaveBeenCalled();
  });

  it('does NOT fire ca.stop on session.idle (ambiguous with user interrupt and post-tool idle)', async () => {
    const { ctx, hook } = makeCtx();
    runAetSafe.mockResolvedValue(stopResult('guidance'));

    await hook({ event: { type: 'session.idle', sessionID: 'sess-7' } });
    await hook({
      event: { type: 'session.status', sessionID: 'sess-7', properties: { status: { type: 'idle' } } },
    });

    expect(runAetSafe).not.toHaveBeenCalled();
  });

  it('does nothing for unrelated events', async () => {
    const { ctx, hook } = makeCtx();
    await hook({ event: { type: 'session.updated', sessionID: 'sess-8' } });
    await hook({ event: { type: 'session.created', sessionID: 'sess-8' } });
    expect(runAetSafe).not.toHaveBeenCalled();
  });

  it('does nothing when no sessionID is present', async () => {
    const { ctx, hook } = makeCtx();
    await hook({ event: { type: 'message.updated', properties: { info: finalAssistantMessage() } } });
    expect(runAetSafe).not.toHaveBeenCalled();
  });
});