import { describe, expect, it } from 'vitest';
import { handleToolCall } from './tool_call.js';
import type { ToolCallEvent } from '../types.js';

/** Build a tool_call event for a bash command. */
function bashCall(command: string): ToolCallEvent {
  return { toolName: 'bash', input: { command, cwd: '/tmp' } };
}

describe('tool_call (pre-tool)', () => {
  it('rewrites an aet workflow command to append --output json', () => {
    const ret = handleToolCall(bashCall('aet workflow handover'));
    expect(ret?.input?.command).toBe('aet workflow handover --output json');
  });

  it('is idempotent — leaves a command that already has --output json untouched', () => {
    const ret = handleToolCall(bashCall('aet workflow init --name design --output json'));
    expect(ret).toBeUndefined();
  });

  it('recognizes the -o short form as already-present', () => {
    const ret = handleToolCall(bashCall('aet workflow status -o json'));
    expect(ret).toBeUndefined();
  });

  it('rewrites aet plugin init to append --agent omp', () => {
    const ret = handleToolCall(bashCall('aet plugin init'));
    expect(ret?.input?.command).toBe('aet plugin init --agent omp');
  });

  it('leaves a plugin init with an explicit --agent untouched', () => {
    const ret = handleToolCall(bashCall('aet plugin init --agent omp'));
    expect(ret).toBeUndefined();
  });

  it('passes through non-AET commands', () => {
    const ret = handleToolCall(bashCall('git status'));
    expect(ret).toBeUndefined();
  });

  it('ignores non-bash tools', () => {
    const ret = handleToolCall({ toolName: 'read', input: { command: 'aet workflow handover' } });
    expect(ret).toBeUndefined();
  });

  it('returns undefined when there is no command', () => {
    expect(handleToolCall({ toolName: 'bash', input: {} })).toBeUndefined();
    expect(handleToolCall({ toolName: 'bash', input: { command: '' } })).toBeUndefined();
  });
});
