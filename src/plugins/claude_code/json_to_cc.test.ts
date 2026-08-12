import { describe, expect, it } from 'vitest';
import { resultToCcOutput, resultToCcPostToolOutput } from './json_to_cc.js';
import { err, out, ok } from '../../definitions/events.js';
import type { CommandResult } from '../../definitions/events.js';

function makeResult(prompt: string, opts: Partial<CommandResult> = {}): CommandResult {
  return { ok: true, prompt, events: [], ...opts };
}

describe('resultToCcOutput', () => {
  it('returns null when omit_prompt is present', () => {
    const r = makeResult('visible?', { events: [out('omit_prompt', {})] });
    expect(resultToCcOutput(r)).toBeNull();
  });

  it('returns null when there is nothing to inject', () => {
    expect(resultToCcOutput(makeResult(''))).toBeNull();
  });

  it('injects prompt text and sets the event name', () => {
    const r = makeResult('## Next step');
    const cc = resultToCcOutput(r, 'UserPromptSubmit');
    expect(cc?.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
    expect(cc?.hookSpecificOutput.additionalContext).toContain('## Next step');
  });

  it('prepends an error tag when ok=false', () => {
    const r = err('UNKNOWN_WORKFLOW', 'no such workflow');
    const cc = resultToCcOutput(r);
    expect(cc?.hookSpecificOutput.additionalContext).toContain('[AET ERROR UNKNOWN_WORKFLOW] no such workflow');
    // err() also populates prompt with the ERROR line — both appear.
    expect(cc?.hookSpecificOutput.additionalContext).toContain('ERROR: UNKNOWN_WORKFLOW');
  });

  it('prepends a lifecycle banner from data.status', () => {
    const r = makeResult('step text', {
      data: { status: 'step_advanced', workflow: 'design', currentStep: 's2', nextStep: 's3' },
    });
    const cc = resultToCcOutput(r);
    const text = cc!.hookSpecificOutput.additionalContext;
    expect(text).toContain('[AET] step advanced: s2 — next: s3');
    expect(text).toContain('step text');
  });

  it('maps event payloads to additionalContext fragments', () => {
    const r = makeResult('', {
      events: [
        out('prompt.inject', { text: 'injected', type: 'task' }),
        out('context.clear', { reason: 'step done' }),
        out('hook.func', { command: 'scripts/lint.ts', args: ['--fix'], cwd: '/tmp' }),
        out('interrupt_execution', {}),
      ],
    });
    const cc = resultToCcOutput(r);
    const text = cc!.hookSpecificOutput.additionalContext;
    expect(text).toContain('injected');
    expect(text).toContain('[AET] Context cleared (reason: step done)');
    expect(text).toContain('hook.func declared');
    expect(text).toContain('scripts/lint.ts --fix');
    expect(text).toContain('interrupt_execution requested');
  });
});

describe('resultToCcPostToolOutput', () => {
  it('replaces stdout with prompt text and a complete BashOutput shape', () => {
    const r = makeResult('clean step text');
    const cc = resultToCcPostToolOutput(r);
    expect(cc?.hookSpecificOutput).toEqual({
      hookEventName: 'PostToolUse',
      updatedToolOutput: { stdout: 'clean step text', stderr: '', interrupted: false },
    });
  });

  it('returns null when omit_prompt is present', () => {
    const r = makeResult('hidden', { events: [out('omit_prompt', {})] });
    expect(resultToCcPostToolOutput(r)).toBeNull();
  });

  it('returns null when prompt empty and no error', () => {
    expect(resultToCcPostToolOutput(makeResult(''))).toBeNull();
  });

  it('synthesizes an error string when prompt empty but ok=false with error', () => {
    const r = { ok: false, prompt: '', events: [], error: { code: 'E', message: 'm' } } as const;
    const cc = resultToCcPostToolOutput(r);
    expect(cc?.hookSpecificOutput.updatedToolOutput.stdout).toBe('[AET ERROR E] m');
  });
});