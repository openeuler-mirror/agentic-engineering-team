import { describe, expect, it, vi } from 'vitest';
import { registerToolBeforeHook } from './tool_before.js';
import type { PluginContext } from '../types.js';

interface ToolBeforeEvent {
  tool: string;
  sessionID: string;
  id: string;
  input: { command?: string; cwd?: string; [k: string]: unknown } | null;
}

interface CapturedToolBeforeHook {
  (event: ToolBeforeEvent): Promise<void>;
}

/** Build the V2 mock ctx, register the hook, and expose the captured callback. */
function makeHook(): { hook: CapturedToolBeforeHook; ctx: PluginContext } {
  const toolHook = vi.fn(async (_name: string, cb: CapturedToolBeforeHook) => {
    captured = cb;
    return { dispose: vi.fn() };
  });
  let captured: CapturedToolBeforeHook = vi.fn() as unknown as CapturedToolBeforeHook;
  const ctx = { tool: { hook: toolHook } } as unknown as PluginContext;
  // Register and capture synchronously (the register fn awaits the hook).
  void registerToolBeforeHook(ctx);
  return {
    get hook() {
      return captured;
    },
    ctx,
  } as unknown as { hook: CapturedToolBeforeHook; ctx: PluginContext };
}

function bashArgs(command: string) {
  return { input: { command, cwd: '/tmp' } };
}

describe('V2 ctx.tool.hook("execute.before") — AET Bash arg rewriting', () => {
  // Register ONCE per suite; the captured callback is reused. The register
  // fn awaits ctx.tool.hook which we mock synchronously-resolved.
  const { hook } = makeHook();

  it('rewrites an aet workflow handover to append --output json and --session-id', async () => {
    const event = { tool: 'bash', sessionID: 's', id: 'c', input: { command: 'aet workflow handover', cwd: '/tmp' } };
    await hook(event);
    expect(event.input!.command).toBe('aet workflow handover --session-id s --output json');
  });

  it('appends --session-id to a workflow handover with an existing --output json', async () => {
    const event = { tool: 'bash', sessionID: 's', id: 'c', input: { command: 'aet workflow handover --output json', cwd: '/tmp' } };
    await hook(event);
    const cmd = event.input!.command!;
    expect(cmd).toContain('--session-id s');
    expect(cmd).toContain('--output json');
  });

  it('appends --session-id to a workflow continue (re-bind current stage)', async () => {
    const event = { tool: 'bash', sessionID: 's2', id: 'c', input: { command: 'aet workflow continue', cwd: '/tmp' } };
    await hook(event);
    expect(event.input!.command).toBe('aet workflow continue --session-id s2 --output json');
  });

  it('does not append --session-id to non-stage-entry workflow commands', async () => {
    const event = { tool: 'bash', sessionID: 's', id: 'c', input: { command: 'aet workflow status', cwd: '/tmp' } };
    await hook(event);
    expect(event.input!.command).toBe('aet workflow status --output json');
    // init does NOT bind a session (per-stage model) — no --session-id appended.
    const event2 = { tool: 'bash', sessionID: 's', id: 'c', input: { command: 'aet workflow init --name design', cwd: '/tmp' } };
    await hook(event2);
    expect(event2.input!.command).toContain('--output json');
    expect(event2.input!.command).not.toContain('--session-id');
  });

  it('is idempotent — leaves a command that already has --output json untouched', async () => {
    const event = bashArgs('aet workflow init --name design --output json') as unknown as ToolBeforeEvent;
    event.tool = 'bash'; event.sessionID = 's'; event.id = 'c';
    await hook(event);
    expect(event.input!.command).toBe('aet workflow init --name design --output json');
  });

  it('recognizes the -o short form as already-present', async () => {
    const event = bashArgs('aet workflow status -o json') as unknown as ToolBeforeEvent;
    event.tool = 'bash'; event.sessionID = 's'; event.id = 'c';
    await hook(event);
    expect(event.input!.command).toBe('aet workflow status -o json');
  });

  it('rewrites aet plugin init to append --agent opencode', async () => {
    const event = bashArgs('aet plugin init') as unknown as ToolBeforeEvent;
    event.tool = 'bash'; event.sessionID = 's'; event.id = 'c';
    await hook(event);
    expect(event.input!.command).toBe('aet plugin init --agent opencode');
  });

  it('leaves a plugin init with an explicit --agent untouched', async () => {
    const event = bashArgs('aet plugin init --agent opencode') as unknown as ToolBeforeEvent;
    event.tool = 'bash'; event.sessionID = 's'; event.id = 'c';
    await hook(event);
    expect(event.input!.command).toBe('aet plugin init --agent opencode');
  });

  it('passes through non-AET commands', async () => {
    const event = bashArgs('git status') as unknown as ToolBeforeEvent;
    event.tool = 'bash'; event.sessionID = 's'; event.id = 'c';
    await hook(event);
    expect(event.input!.command).toBe('git status');
  });

  it('ignores non-bash tools', async () => {
    const event = bashArgs('aet workflow handover') as unknown as ToolBeforeEvent;
    event.tool = 'read'; event.sessionID = 's'; event.id = 'c';
    await hook(event);
    expect(event.input!.command).toBe('aet workflow handover');
  });

  it('returns without throwing when input is null', async () => {
    const event: ToolBeforeEvent = { tool: 'bash', sessionID: 's', id: 'c', input: null };
    await expect(hook(event)).resolves.toBeUndefined();
    const nullEvent = { tool: 'bash', sessionID: 's', id: 'c', input: null } as unknown as ToolBeforeEvent;
    await expect(hook(nullEvent)).resolves.toBeUndefined();
  });
});
