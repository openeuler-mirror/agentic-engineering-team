import { describe, expect, it, beforeEach } from 'vitest';
import { handleToolResult } from './tool_result.js';
import { handleToolCall } from './tool_call.js';
import type { MessagePart, ToolResultEvent } from '../types.js';

/** Build a tool_result event for a bash command whose content is `output`. */
function bashResult(output: string): ToolResultEvent {
  const content: MessagePart[] = output ? [{ type: 'text', text: output }] : [];
  return { toolName: 'bash', content, isError: false };
}

/**
 * Simulate the full omp flow for an `aet workflow` bash call: run the
 * tool_call hook (which records the workflow signal in cmd_state), then the
 * tool_result hook on `output`. Returns handleToolResult's return value.
 */
function aetWorkflowResult(output: string) {
  handleToolCall({ toolName: 'bash', input: { command: 'aet workflow status' } });
  return handleToolResult(bashResult(output));
}

describe('tool_result (post-tool)', () => {
  beforeEach(() => {
    // Ensure a clean slate between tests: no leftover workflow signal from a
    // prior test bleeding into the next.
    handleToolCall({ toolName: 'bash', input: { command: 'echo reset' } });
  });

  it('replaces a workflow result with result.prompt', () => {
    const raw = JSON.stringify({ ok: true, prompt: 'step 2 task', events: [] });
    const ret = aetWorkflowResult(raw);
    expect(ret?.content).toEqual([{ type: 'text', text: 'step 2 task' }]);
  });

  it('does NOT replace when omit_prompt is in events (degrade)', () => {
    const raw = JSON.stringify({ ok: true, prompt: 'hidden', events: [{ id: 'omit_prompt' }] });
    const ret = aetWorkflowResult(raw);
    expect(ret).toBeUndefined();
  });

  it('surfaces a synthetic error on mangled AET workflow output (R9)', () => {
    const ret = aetWorkflowResult('{ ok: true, broken');
    expect(ret?.content?.[0]?.text).toContain('[AET ERROR PLUGIN_PARSE_FAILED]');
  });

  it('surfaces a synthetic error on EMPTY AET workflow output (R9)', () => {
    const ret = aetWorkflowResult('');
    expect(ret?.content?.[0]?.text).toContain('[AET ERROR PLUGIN_PARSE_FAILED]');
  });

  it('leaves plain-text bash output untouched (no synthetic error)', () => {
    // `git status` / `ls` / `npm test` output is not JSON and is NOT an AET
    // result — it must pass through unchanged. Pre-fix this was clobbered with
    // a synthetic PLUGIN_PARSE_FAILED, breaking normal omp bash usage.
    const ret = handleToolResult(bashResult('On branch main\n nothing to commit'));
    expect(ret).toBeUndefined();
  });

  it('leaves the result untouched on empty content for a non-AET call', () => {
    handleToolCall({ toolName: 'bash', input: { command: 'ls' } });
    const ret = handleToolResult(bashResult(''));
    expect(ret).toBeUndefined();
  });

  it('leaves non-AET JSON untouched (no ok/prompt/events/data shape)', () => {
    // Unrelated JSON bash output (e.g. a piped tool) must not be clobbered.
    handleToolCall({ toolName: 'bash', input: { command: 'jq . file.json' } });
    const ret = handleToolResult(bashResult(JSON.stringify({ files: ['a.ts', 'b.ts'] })));
    expect(ret).toBeUndefined();
  });

  it('ignores non-bash tools', () => {
    const ret = handleToolResult({ toolName: 'read', content: [{ type: 'text', text: JSON.stringify({ ok: true, prompt: 'x', events: [] }) }], isError: false });
    expect(ret).toBeUndefined();
  });

  it('synthesizes an error text when ok=false and prompt is empty', () => {
    const ret = aetWorkflowResult(JSON.stringify({
      ok: false, prompt: '', events: [],
      error: { code: 'E1', message: 'boom' },
    }));
    expect(ret?.content?.[0]?.text).toContain('[AET ERROR E1] boom');
  });

  it('surfaces the lifecycle banner alongside the prompt', () => {
    const ret = aetWorkflowResult(JSON.stringify({
      ok: true, prompt: 'step-1 task',
      events: [],
      data: { status: 'step_advanced', workflow: 'design', currentStep: 's1', nextStep: 's2' },
    }));
    const text = ret?.content?.map((c) => c.text).join('\n') ?? '';
    expect(text).toContain('[AET] step advanced: s1 — next: s2');
    expect(text).toContain('step-1 task');
  });
});
