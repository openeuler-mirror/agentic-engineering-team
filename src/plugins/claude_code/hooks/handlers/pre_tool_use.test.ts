import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CcHookInput } from '../../types.js';

const { emit, debugLog } = vi.hoisted(() => ({ emit: vi.fn(), debugLog: vi.fn() }));

vi.mock('./shared.js', () => ({
  emit,
  debugLog,
  AET_AGENT_ID: 'claude-code',
  AET_PLUGIN_INIT_RE: /aet\s+plugin\s+init\b/,
  AET_WORKFLOW_RE: /aet\s+workflow\s+\S+/,
}));

import { handlePreToolUse } from './pre_tool_use.js';

function bashInput(command: string): CcHookInput {
  return { tool_name: 'Bash', tool_input: { command } } as unknown as CcHookInput;
}

describe('handlePreToolUse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes through non-Bash tools', () => {
    handlePreToolUse({ tool_name: 'Read' } as unknown as CcHookInput);
    expect(emit).toHaveBeenCalledWith(null);
  });

  it('rewrites an aet workflow command to append --output json + allow', () => {
    handlePreToolUse(bashInput('aet workflow handover'));
    expect(emit).toHaveBeenCalledWith({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        updatedInput: { command: 'aet workflow handover --output json' },
      },
    });
  });

  it('appends --session-id on a workflow handover when session_id is present', () => {
    handlePreToolUse({
      tool_name: 'Bash',
      session_id: 'sess-9',
      tool_input: { command: 'aet workflow handover' },
    } as unknown as CcHookInput);
    const emitted = (emit as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0];
    const cmd = emitted?.hookSpecificOutput?.updatedInput?.command;
    expect(cmd).toContain('--output json');
    expect(cmd).toContain('--session-id sess-9');
  });

  it('appends --session-id on a workflow continue (re-bind current stage)', () => {
    handlePreToolUse({
      tool_name: 'Bash',
      session_id: 'sess-10',
      tool_input: { command: 'aet workflow continue' },
    } as unknown as CcHookInput);
    const emitted = (emit as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0];
    const cmd = emitted?.hookSpecificOutput?.updatedInput?.command;
    expect(cmd).toContain('--output json');
    expect(cmd).toContain('--session-id sess-10');
  });

  it('does NOT append --session-id on workflow init (per-stage binding)', () => {
    handlePreToolUse({
      tool_name: 'Bash',
      session_id: 'sess-11',
      tool_input: { command: 'aet workflow init --name design' },
    } as unknown as CcHookInput);
    const emitted = (emit as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0];
    const cmd = emitted?.hookSpecificOutput?.updatedInput?.command ?? '';
    expect(cmd).toContain('--output json');
    expect(cmd).not.toContain('--session-id');
  });

  it('is idempotent — leaves a command that already has --output json untouched', () => {
    handlePreToolUse(bashInput('aet workflow init --name design --output json'));
    expect(emit).toHaveBeenCalledWith(null);
  });

  it('recognizes the -o short form as already-present', () => {
    handlePreToolUse(bashInput('aet workflow status -o json'));
    expect(emit).toHaveBeenCalledWith(null);
  });

  it('rewrites a chained aet workflow command but does NOT auto-allow (no permissionDecision)', () => {
    // Shell-chaining must never be auto-approved: the whole chain would run
    // unprompted, including a malicious tail. The flag is still inserted on
    // the right command, but CC's normal permission flow applies.
    handlePreToolUse(bashInput('aet workflow status && echo done'));
    expect(emit).toHaveBeenCalledWith({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        updatedInput: { command: 'aet workflow status --output json && echo done' },
      },
    });
  });

  it('does not auto-allow a piped aet workflow command either', () => {
    handlePreToolUse(bashInput('aet workflow status | jq .workflow'));
    expect(emit).toHaveBeenCalledWith({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        updatedInput: { command: 'aet workflow status --output json | jq .workflow' },
      },
    });
    const args = (emit as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(args.hookSpecificOutput.permissionDecision).toBeUndefined();
  });

  it('does not auto-allow a chained aet plugin init either', () => {
    handlePreToolUse(bashInput('aet plugin init && chmod 777 .'));
    const args = (emit as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(args.hookSpecificOutput.updatedInput.command).toBe('aet plugin init --agent claude-code && chmod 777 .');
    expect(args.hookSpecificOutput.permissionDecision).toBeUndefined();
  });

  it('rewrites aet plugin init to append --agent', () => {
    handlePreToolUse(bashInput('aet plugin init'));
    expect(emit).toHaveBeenCalledWith({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        updatedInput: { command: 'aet plugin init --agent claude-code' },
      },
    });
  });

  it('leaves a plugin init with an explicit --agent untouched', () => {
    handlePreToolUse(bashInput('aet plugin init --agent opencode'));
    expect(emit).toHaveBeenCalledWith(null);
  });

  it('passes through non-AET commands', () => {
    handlePreToolUse(bashInput('git status'));
    expect(emit).toHaveBeenCalledWith(null);
  });
});