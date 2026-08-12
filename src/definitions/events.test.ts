import { describe, expect, it } from 'vitest';
import { err, out, ok } from './events.js';

describe('out()', () => {
  it('pairs an id with its payload', () => {
    expect(out('prompt.inject', { text: 'hi', type: 'task' })).toEqual({
      id: 'prompt.inject',
      payload: { text: 'hi', type: 'task' },
    });
  });

  it('builds a context.clear event', () => {
    expect(out('context.clear', { reason: 'step done' })).toEqual({
      id: 'context.clear',
      payload: { reason: 'step done' },
    });
  });
});

describe('err()', () => {
  it('builds a full error CommandResult', () => {
    const r = err('NO_ACTIVE_WORKFLOW', 'nothing active');
    expect(r.ok).toBe(false);
    expect(r.prompt).toBe('ERROR: NO_ACTIVE_WORKFLOW — nothing active');
    expect(r.error).toEqual({ code: 'NO_ACTIVE_WORKFLOW', message: 'nothing active' });
    expect(r.events).toEqual([{ id: 'error', payload: { code: 'NO_ACTIVE_WORKFLOW', message: 'nothing active' } }]);
    expect(r.data).toBeUndefined();
  });
});

describe('ok()', () => {
  it('defaults events to empty and omits data', () => {
    const r = ok('all good');
    expect(r).toEqual({ ok: true, prompt: 'all good', events: [] });
    expect(r.data).toBeUndefined();
  });

  it('carries events and data when given', () => {
    const events = [out('context.clear', { reason: 'x' })];
    const data = { status: 'step_advanced', currentStep: 's1', nextStep: null } as const;
    const r = ok('ok', events, data);
    expect(r.events).toEqual(events);
    expect(r.data).toEqual(data);
  });
});