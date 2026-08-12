import { describe, expect, it } from 'vitest';
import { resultToOmpContent } from './json_to_omp.js';
import type { CommandResult } from './types.js';

describe('resultToOmpContent', () => {
  it('returns null on omit_prompt (leave tool result untouched)', () => {
    const r: CommandResult = { ok: true, prompt: 'hidden', events: [{ id: 'omit_prompt', payload: {} }] };
    expect(resultToOmpContent(r)).toBeNull();
  });

  it('surfaces the top-level prompt as a text part', () => {
    const r: CommandResult = { ok: true, prompt: 'do step 1', events: [] };
    const parts = resultToOmpContent(r);
    expect(parts).toContainEqual({ type: 'text', text: 'do step 1' });
  });

  it('surfaces a tagged error on ok=false', () => {
    const r: CommandResult = {
      ok: false, prompt: '', events: [],
      error: { code: 'BOOM', message: 'it broke' },
    };
    const parts = resultToOmpContent(r) ?? [];
    expect(parts.some((p) => p.text === '[AET ERROR BOOM] it broke')).toBe(true);
  });

  it('returns null when ok=true with no prompt and no events', () => {
    const r: CommandResult = { ok: true, prompt: '', events: [] };
    expect(resultToOmpContent(r)).toBeNull();
  });

  it('prepends a lifecycle banner from data.status', () => {
    const r: CommandResult = {
      ok: true, prompt: 'task text', events: [],
      data: { status: 'workflow_complete', workflow: 'design' },
    };
    const parts = resultToOmpContent(r) ?? [];
    expect(parts.some((p) => p.text === '[AET] workflow complete: design — all steps done, no further handover needed')).toBe(true);
  });

  it('translates a prompt.inject event to a text part', () => {
    const r: CommandResult = {
      ok: true, prompt: '', events: [{ id: 'prompt.inject', payload: { text: 'injected note' } }],
    };
    const parts = resultToOmpContent(r) ?? [];
    expect(parts.some((p) => p.text === 'injected note')).toBe(true);
  });

  it('degrades context.clear to a text instruction', () => {
    const r: CommandResult = {
      ok: true, prompt: '', events: [{ id: 'context.clear', payload: { reason: 'step.clear' } }],
    };
    const parts = resultToOmpContent(r) ?? [];
    expect(parts.some((p) => p.text?.startsWith('[AET] Context cleared (reason: step.clear)'))).toBe(true);
  });

  it('degrades prompt.inject_system to a tagged note', () => {
    const r: CommandResult = {
      ok: true, prompt: '', events: [{ id: 'prompt.inject_system', payload: { text: 'sys note' } }],
    };
    const parts = resultToOmpContent(r) ?? [];
    expect(parts.some((p) => p.text === '[AET system note] sys note')).toBe(true);
  });

  it('silently ignores unknown events', () => {
    const r: CommandResult = {
      ok: true, prompt: '', events: [{ id: 'some-future-event', payload: { foo: 'bar' } }],
    };
    expect(resultToOmpContent(r)).toBeNull();
  });
});
