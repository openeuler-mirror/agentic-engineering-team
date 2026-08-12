import { describe, expect, it, vi } from 'vitest';
import type { EventBus } from '../../../core/event_bus.js';
import type { CommandResult } from '../../../definitions/events.js';
import { eventDispatchSpec } from './dispatch.js';

function fakeBus(okResult: boolean): { bus: EventBus; dispatches: any[] } {
  const dispatches: any[] = [];
  const result: CommandResult = { ok: okResult, prompt: 'ok', events: [] };
  const bus = {
    dispatch: vi.fn(async (event: any) => {
      dispatches.push(event);
      return result;
    }),
    registry: {},
    config: {},
  } as unknown as EventBus;
  return { bus, dispatches };
}

describe('event dispatch spec', () => {
  it('normalizes a hyphenated event name and dispatches with the sessionId payload', async () => {
    const { bus, dispatches } = fakeBus(true);
    await eventDispatchSpec.run(bus, ['ca-stop', '--session-id', 'sess-A', '--output', 'json']);
    expect(dispatches[0].event).toBe('ca.stop');
    expect(dispatches[0].payload).toEqual({ sessionId: 'sess-A' });
  });

  it('encodes json output', async () => {
    const { bus } = fakeBus(true);
    const out = await eventDispatchSpec.run(bus, ['ca-stop', '--session-id', 'sess-A', '--output', 'json']);
    expect(out.exitCode).toBe(0);
    expect(JSON.parse(out.stdout).ok).toBe(true);
  });

  it('uses exit 1 when the bus returns a failure', async () => {
    const { bus } = fakeBus(false);
    const out = await eventDispatchSpec.run(bus, ['ca-stop', '--session-id', 'sess-A', '--output', 'json']);
    expect(out.exitCode).toBe(1);
  });

  it('dispatches ca.stop with an empty payload when --session-id is omitted', async () => {
    const { bus, dispatches } = fakeBus(true);
    const out = await eventDispatchSpec.run(bus, ['ca-stop', '--output', 'json']);
    expect(out.exitCode).toBe(0);
    expect(dispatches[0].event).toBe('ca.stop');
    expect(dispatches[0].payload).toEqual({});
  });

  it('errors with USAGE_ERROR when no event name is given', async () => {
    const { bus, dispatches } = fakeBus(true);
    const out = await eventDispatchSpec.run(bus, ['--output', 'json']);
    expect(out.exitCode).toBe(1);
    expect(JSON.parse(out.stdout).error.code).toBe('USAGE_ERROR');
    expect(dispatches).toHaveLength(0);
  });

  it('rejects workflow.* events (dedicated `aet workflow ...` commands exist)', async () => {
    const { bus, dispatches } = fakeBus(true);
    const out = await eventDispatchSpec.run(bus, ['workflow-init', '--output', 'json']);
    expect(out.exitCode).toBe(1);
    expect(JSON.parse(out.stdout).error.code).toBe('USAGE_ERROR');
    expect(dispatches).toHaveLength(0);
  });

  it('falls through to the bus with an empty payload for unknown non-workflow events', async () => {
    const { bus, dispatches } = fakeBus(true);
    await eventDispatchSpec.run(bus, ['not-a-real-event', '--output', 'json']);
    // The dispatcher is a thin shell — the bus is the single authority for
    // unknown events (NOT_IMPLEMENTED), so we still dispatch.
    expect(dispatches[0].event).toBe('not.a.real.event');
    expect(dispatches[0].payload).toEqual({});
  });
});
