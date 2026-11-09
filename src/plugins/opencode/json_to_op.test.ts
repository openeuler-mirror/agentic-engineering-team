import { describe, expect, it } from 'vitest';
import { applyEventsInHook } from './json_to_op.js';
import { out } from '../../definitions/events.js';
import type { MessagePart, OutputEvent } from './types.js';

// `out(...)` returns the discriminated-union OutputEvent from core definitions
// (typed payloads like ContextClearPayload). `applyEventsInHook` consumes the
// plugin-local OutputEvent shape (`payload: Record<string, unknown>`). The two
// are structurally compatible at runtime but TS flags the payload index-signature
// mismatch — cast through the local type to bridge the one-way dependency
// (plugins → definitions, NOT plugins → core; per 新方案.md §2.3).
const ev = (id: Parameters<typeof out>[0], payload: Parameters<typeof out>[1]): OutputEvent =>
  ({ id, payload } as unknown as OutputEvent);

function newOutput() {
  return { parts: [] as MessagePart[] };
}

function partsText(output: { parts: MessagePart[] }): string[] {
  return output.parts.filter((p) => p.type === 'text').map((p) => (p as { text: string }).text);
}

describe('applyEventsInHook', () => {
  it('appends prompt.inject text', () => {
    const o = newOutput();
    applyEventsInHook(o, [ev('prompt.inject', { text: 'silent', type: 'task' })]);
    expect(partsText(o)).toEqual(['silent']);
  });

  it('appends prompt.inject_system to system[] when present', () => {
    const o = { parts: [], system: [] as string[] };
    applyEventsInHook(o, [ev('prompt.inject_system', { text: 'sys' })]);
    expect(o.system).toEqual(['sys']);
    expect(o.parts).toEqual([]);
  });

  it('degrades prompt.inject_system to a text part when no system channel', () => {
    const o = newOutput();
    applyEventsInHook(o, [ev('prompt.inject_system', { text: 'sys' })]);
    expect(partsText(o)).toEqual(['sys']);
  });

  it('appends hook.prompt text', () => {
    const o = newOutput();
    applyEventsInHook(o, [ev('hook.prompt', { text: 'confirm?' })]);
    expect(partsText(o)).toEqual(['confirm?']);
  });

  it('emits an instruction part for hook.func', () => {
    const o = newOutput();
    applyEventsInHook(o, [ev('hook.func', { command: 'node', args: ['-v'], cwd: '/tmp' })]);
    expect(partsText(o).join(' ')).toContain('node -v');
  });

  it('emits an instruction part for context.clear', () => {
    const o = newOutput();
    applyEventsInHook(o, [ev('context.clear', { reason: 'next step' })]);
    expect(partsText(o).join(' ')).toContain('新会话');
  });

  it('surfaces error events as text (R9)', () => {
    const o = newOutput();
    applyEventsInHook(o, [ev('error', { code: 'E1', message: 'bad' })]);
    expect(partsText(o).join(' ')).toContain('[AET ERROR E1] bad');
  });

  it('ignores unknown event ids', () => {
    const o = newOutput();
    applyEventsInHook(o, [{ id: 'mystery' } as unknown as OutputEvent]);
    expect(o.parts).toEqual([]);
  });

  it('skips empty prompt.inject text', () => {
    const o = newOutput();
    applyEventsInHook(o, [ev('prompt.inject', { text: '', type: 'task' })]);
    expect(o.parts).toEqual([]);
  });

  it('does not mutate when given an empty events list', () => {
    const o = newOutput();
    applyEventsInHook(o, []);
    expect(o.parts).toEqual([]);
  });
});