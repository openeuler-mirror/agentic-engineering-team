import { describe, expect, it } from 'vitest';
import { registerToolBeforeHook } from './tool_before.js';
import type { PluginContext } from '../types.js';

/** Build the hook handler and return it so tests can invoke it with a payload. */
function makeHook(): (input: unknown, output: unknown) => Promise<void> {
  return registerToolBeforeHook({} as PluginContext);
}

function bashArgs(command: string) {
  return { args: { command, cwd: '/tmp' } };
}

describe('tool.execute.before', () => {
  const hook = makeHook();

  it('rewrites an aet workflow handover to append --output json and --session-id', () => {
    const input = { tool: 'bash', sessionID: 's', callID: 'c' };
    const output = bashArgs('aet workflow handover');
    hook(input, output);
    expect(output.args.command).toBe('aet workflow handover --session-id s --output json');
  });

  it('appends --session-id to a workflow handover with an existing --output json', () => {
    const input = { tool: 'bash', sessionID: 's', callID: 'c' };
    const output = bashArgs('aet workflow handover --output json');
    hook(input, output);
    const cmd = output.args.command;
    expect(cmd).toContain('--session-id s');
    expect(cmd).toContain('--output json');
  });

  it('appends --session-id to a workflow continue (re-bind current stage)', () => {
    const input = { tool: 'bash', sessionID: 's2', callID: 'c' };
    const output = bashArgs('aet workflow continue');
    hook(input, output);
    expect(output.args.command).toBe('aet workflow continue --session-id s2 --output json');
  });

  it('does not append --session-id to non-stage-entry workflow commands', () => {
    const input = { tool: 'bash', sessionID: 's', callID: 'c' };
    const output = bashArgs('aet workflow status');
    hook(input, output);
    expect(output.args.command).toBe('aet workflow status --output json');
    // init does NOT bind a session (per-stage model) — no --session-id appended.
    const output2 = bashArgs('aet workflow init --name design');
    hook(input, output2);
    expect(output2.args.command).toContain('--output json');
    expect(output2.args.command).not.toContain('--session-id');
  });

  it('is idempotent — leaves a command that already has --output json untouched', () => {
    const output = bashArgs('aet workflow init --name design --output json');
    hook({ tool: 'bash' }, output);
    expect(output.args.command).toBe('aet workflow init --name design --output json');
  });

  it('recognizes the -o short form as already-present', () => {
    const output = bashArgs('aet workflow status -o json');
    hook({ tool: 'bash' }, output);
    expect(output.args.command).toBe('aet workflow status -o json');
  });

  it('rewrites aet plugin init to append --agent opencode', () => {
    const output = bashArgs('aet plugin init');
    hook({ tool: 'bash' }, output);
    expect(output.args.command).toBe('aet plugin init --agent opencode');
  });

  it('leaves a plugin init with an explicit --agent untouched', () => {
    const output = bashArgs('aet plugin init --agent opencode');
    hook({ tool: 'bash' }, output);
    expect(output.args.command).toBe('aet plugin init --agent opencode');
  });

  it('passes through non-AET commands', () => {
    const output = bashArgs('git status');
    hook({ tool: 'bash' }, output);
    expect(output.args.command).toBe('git status');
  });

  it('ignores non-bash tools', () => {
    const output = bashArgs('aet workflow handover');
    hook({ tool: 'read', sessionID: 's', callID: 'c' }, output);
    expect(output.args.command).toBe('aet workflow handover');
  });

  it('returns without throwing when args is null', () => {
    expect(() => hook({ tool: 'bash' }, { args: null })).not.toThrow();
    expect(() => hook(null, { args: null })).not.toThrow();
  });
});