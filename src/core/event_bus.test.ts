import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEventBus, EventBus } from './event_bus.js';
import type { InputEvent } from '../definitions/events.js';

function freshBus(): EventBus {
  const root = mkdtempSync(join(tmpdir(), 'aet-bus-'));
  return createEventBus({ projectRoot: root, globalRoot: join(root, 'no-global') });
}

describe('EventBus', () => {
  it('routes workflow.init to the engine', async () => {
    const bus = freshBus();
    const r = await bus.dispatch({ event: 'workflow.init', payload: { name: 'design' } });
    expect(r.ok).toBe(true);
    expect(r.data?.status).toBe('workflow_started');
  });

  it('routes workflow.status after an init', async () => {
    const bus = freshBus();
    await bus.dispatch({ event: 'workflow.init', payload: { name: 'design' } });
    const r = await bus.dispatch({ event: 'workflow.status', payload: {} });
    expect(r.data?.status).toBe('active');
  });

  it('hands an unknown event to a NOT_IMPLEMENTED error (never throws)', async () => {
    const bus = freshBus();
    const input = { event: 'workflow.bogus' } as unknown as InputEvent;
    const r = await bus.dispatch(input);
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('NOT_IMPLEMENTED');
  });

  it('converts a handler exception into an INTERNAL error', async () => {
    const bus = freshBus();
    bus.register('workflow.init', async () => {
      throw new Error('boom');
    });
    const r = await bus.dispatch({ event: 'workflow.init', payload: { name: 'design' } });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('INTERNAL');
    expect(r.error?.message).toContain('boom');
  });

  it('has() reflects registered handlers', () => {
    const bus = freshBus();
    expect(bus.has('workflow.init')).toBe(true);
    expect(bus.has('semantic.query')).toBe(false);
  });

  it('exposes the config + registry accessors', () => {
    const bus = freshBus();
    expect(bus.config).toBeTruthy();
    expect(bus.registry.getWorkflow('design')).toBeTruthy();
  });

  it('allows registering a custom handler', async () => {
    const bus = freshBus();
    bus.register('workflow.list', async () => ({ ok: true, prompt: 'custom', events: [] }));
    const r = await bus.dispatch({ event: 'workflow.list', payload: {} });
    expect(r.prompt).toBe('custom');
  });
});