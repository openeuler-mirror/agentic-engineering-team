import { describe, expect, it } from 'vitest';
import { registerToolAfterHook } from './tool_after.js';
import type { PluginContext } from '../types.js';

/** Build the hook handler and return it so tests can invoke it with a payload. */
function makeHook(): (input: unknown, output: unknown) => Promise<void> {
  return registerToolAfterHook({} as PluginContext);
}

function bashTool(command: string, output = '') {
  return {
    input: { tool: 'bash', sessionID: 's', callID: 'c', args: { command } },
    output: { title: 'Bash', output, metadata: {} },
  };
}

describe('tool.execute.after', () => {
  const hook = makeHook();

  it('replaces a workflow result with result.prompt', () => {
    const { input, output } = bashTool('aet workflow handover', JSON.stringify({ ok: true, prompt: 'step 2 task', events: [] }));
    hook(input, output);
    expect(output.output).toBe('step 2 task');
  });

  it('does NOT replace when omit_prompt is in events (degrade)', () => {
    const raw = '{"ok":true,"prompt":"hidden","events":[{"id":"omit_prompt"}]}';
    const { input, output } = bashTool('aet workflow handover', raw);
    hook(input, output);
    expect(output.output).toBe(raw);
  });

  it('surfaces a synthetic error on unparseable stdout (R9)', () => {
    const { input, output } = bashTool('aet workflow handover', 'not json');
    hook(input, output);
    expect(output.output).toContain('[AET ERROR PLUGIN_PARSE_FAILED]');
  });

  it('leaves the result untouched on empty stdout', () => {
    const { input, output } = bashTool('aet workflow handover', '');
    hook(input, output);
    expect(output.output).toBe('');
  });

  it('leaves non-workflow commands untouched', () => {
    const { input, output } = bashTool('git status', 'some text');
    hook(input, output);
    expect(output.output).toBe('some text');
  });

  it('ignores non-bash tools', () => {
    const input = { tool: 'read', sessionID: 's', callID: 'c', args: { command: 'aet workflow handover' } };
    const output = { title: 'Read', output: 'whatever', metadata: {} };
    hook(input, output);
    expect(output.output).toBe('whatever');
  });

  it('synthesizes an error text when ok=false and prompt is empty', () => {
    const { input, output } = bashTool('aet workflow handover', JSON.stringify({
      ok: false, prompt: '', events: [],
      error: { code: 'E1', message: 'boom' },
    }));
    hook(input, output);
    expect(output.output).toContain('[AET ERROR E1] boom');
  });
});