import { describe, expect, it, vi } from 'vitest';
import { registerToolAfterHook } from './tool_after.js';
import type { PluginContext } from '../types.js';

interface ToolAfterEvent {
  tool: string;
  sessionID: string;
  id: string;
  input: { command?: string; [k: string]: unknown } | null;
  status: 'completed' | 'error';
  result?: {
    output?: unknown;
    content?: string | ReadonlyArray<{ type: string; text?: string }> | ReadonlyArray<unknown>;
    metadata?: unknown;
    [k: string]: unknown;
  };
  error?: { message?: string };
}

interface CapturedToolAfterHook {
  (event: ToolAfterEvent): Promise<void>;
}

/** Build the V2 mock ctx, register the hook, and expose the captured callback. */
function makeHook(): CapturedToolAfterHook {
  const toolHook = vi.fn(async (_name: string, cb: CapturedToolAfterHook) => {
    captured = cb;
    return { dispose: vi.fn() };
  });
  let captured: CapturedToolAfterHook = vi.fn() as unknown as CapturedToolAfterHook;
  const ctx = { tool: { hook: toolHook } } as unknown as PluginContext;
  void registerToolAfterHook(ctx);
  // Return a wrapper that forwards the event to the captured callback.
  return (event: ToolAfterEvent) => captured(event);
}

function bashTool(command: string, output = ''): { event: ToolAfterEvent } {
  return {
    event: {
      tool: 'bash',
      sessionID: 's',
      id: 'c',
      input: { command },
      status: 'completed' as const,
      result: { content: output },
    },
  };
}

describe('V2 ctx.tool.hook("execute.after") — result.prompt replacement', () => {
  const hook = makeHook();

  it('replaces a workflow result with result.prompt (reassigns event.result.content)', async () => {
    const { event } = bashTool('aet workflow handover', JSON.stringify({ ok: true, prompt: 'step 2 task', events: [] }));
    await hook(event);
    expect(event.result!.content).toBe('step 2 task');
  });

  it('does NOT replace when omit_prompt is in events (degrade)', async () => {
    const raw = '{"ok":true,"prompt":"hidden","events":[{"id":"omit_prompt"}]}';
    const { event } = bashTool('aet workflow handover', raw);
    await hook(event);
    expect(event.result!.content).toBe(raw);
  });

  it('surfaces a synthetic error on unparseable stdout (R9)', async () => {
    const { event } = bashTool('aet workflow handover', 'not json');
    await hook(event);
    expect(event.result!.content).toContain('[AET ERROR PLUGIN_PARSE_FAILED]');
  });

  it('leaves the result untouched on empty stdout', async () => {
    const { event } = bashTool('aet workflow handover', '');
    await hook(event);
    expect(event.result!.content).toBe('');
  });

  it('leaves non-workflow commands untouched', async () => {
    const { event } = bashTool('git status', 'some text');
    await hook(event);
    expect(event.result!.content).toBe('some text');
  });

  it('ignores non-bash tools', async () => {
    const event: ToolAfterEvent = {
      tool: 'read', sessionID: 's', id: 'c',
      input: { command: 'aet workflow handover' },
      status: 'completed', result: { content: 'whatever' },
    };
    await hook(event);
    expect(event.result!.content).toBe('whatever');
  });

  it('synthesizes an error text when ok=false and prompt is empty', async () => {
    const { event } = bashTool('aet workflow handover', JSON.stringify({
      ok: false, prompt: '', events: [],
      error: { code: 'E1', message: 'boom' },
    }));
    await hook(event);
    expect(event.result!.content).toContain('[AET ERROR E1] boom');
  });

  it('ignores error-status events (only completed results are processed)', async () => {
    const event: ToolAfterEvent = {
      tool: 'bash', sessionID: 's', id: 'c',
      input: { command: 'aet workflow handover' },
      status: 'error', error: { message: 'crashed' },
      result: { content: 'partial' },
    };
    await hook(event);
    // status !== completed → no mutation.
    expect(event.result!.content).toBe('partial');
  });

  it('handles array content (extracts first text item, replaces whole result)', async () => {
    const event: ToolAfterEvent = {
      tool: 'bash', sessionID: 's', id: 'c',
      input: { command: 'aet workflow handover' },
      status: 'completed',
      result: { content: [{ type: 'text', text: JSON.stringify({ ok: true, prompt: 'array task', events: [] }) }] },
    };
    await hook(event);
    expect(event.result!.content).toBe('array task');
  });
});
