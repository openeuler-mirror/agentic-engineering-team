import { describe, expect, it, vi } from 'vitest';
import type { EventBus } from '../../../core/event_bus.js';
import type { CommandResult } from '../../../definitions/events.js';
import { workflowInitSpec } from './init.js';
import { workflowHandoverSpec } from './handover.js';
import { workflowContinueSpec } from './continue.js';
import { workflowStatusSpec } from './status.js';
import { workflowAbortSpec } from './abort.js';
import { workflowListSpec } from './list.js';
import { workflowCommandInitSpec } from './command_init.js';

/** Fake bus: records the dispatched InputEvent and returns a canned result. */
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

describe.each([
  ['init', workflowInitSpec, ['--name', 'design']],
  ['handover', workflowHandoverSpec, ['--step', 's2']],
  ['continue', workflowContinueSpec, []],
  ['status', workflowStatusSpec, []],
  ['abort', workflowAbortSpec, ['--reason', 'why']],
  ['list', workflowListSpec, []],
])('%s spec', (_name, spec, argv) => {
  it('dispatches to the bus and encodes json output', async () => {
    const { bus } = fakeBus(true);
    const out = await spec.run(bus, [...argv, '--output', 'json']);
    expect(out.exitCode).toBe(0);
    expect(JSON.parse(out.stdout).ok).toBe(true);
  });

  it('uses exit 1 when the bus returns a failure', async () => {
    const { bus } = fakeBus(false);
    const out = await spec.run(bus, [...argv, '--output', 'json']);
    expect(out.exitCode).toBe(1);
  });
});

describe('workflow.init spec', () => {
  it('dispatches workflow.init with the name payload', async () => {
    const { bus, dispatches } = fakeBus(true);
    await workflowInitSpec.run(bus, ['--name', 'aet-design', '--output', 'json']);
    expect(dispatches[0].event).toBe('workflow.init');
    expect(dispatches[0].payload).toEqual({ name: 'aet-design' });
  });

  it('forwards --argument into the payload when supplied', async () => {
    const { bus, dispatches } = fakeBus(true);
    await workflowInitSpec.run(bus, ['--name', 'aet-design', '--argument', '做一个登录功能', '--output', 'json']);
    expect(dispatches[0].payload).toEqual({ name: 'aet-design', argument: '做一个登录功能' });
  });

  it('omits argument when --argument is not supplied', async () => {
    const { bus, dispatches } = fakeBus(true);
    await workflowInitSpec.run(bus, ['--name', 'aet-design', '--output', 'json']);
    expect(dispatches[0].payload).toEqual({ name: 'aet-design' });
  });

  it('does NOT forward --session-id from init (per-stage binding; init binds no session)', async () => {
    const { bus, dispatches } = fakeBus(true);
    await workflowInitSpec.run(bus, ['--name', 'aet-design', '--session-id', 'sess-A', '--output', 'json']);
    expect(dispatches[0].payload).toEqual({ name: 'aet-design' });
  });

  it('returns a usage error when --name is missing', async () => {
    const { bus } = fakeBus(true);
    const out = await workflowInitSpec.run(bus, ['--output', 'json']);
    expect(out.exitCode).toBe(1);
    expect(JSON.parse(out.stdout).error?.code).toBe('USAGE_ERROR');
  });
});

describe('workflow.handover spec', () => {
  it('dispatches workflow.handover with the step payload', async () => {
    const { bus, dispatches } = fakeBus(true);
    await workflowHandoverSpec.run(bus, ['--step', 's9', '--output', 'json']);
    expect(dispatches[0].event).toBe('workflow.handover');
    expect(dispatches[0].payload).toEqual({ step: 's9' });
  });

  it('omits the step field when not provided', async () => {
    const { bus, dispatches } = fakeBus(true);
    await workflowHandoverSpec.run(bus, ['--output', 'json']);
    expect(dispatches[0].payload).toEqual({});
  });

  it('forwards --session-id into the payload when supplied', async () => {
    const { bus, dispatches } = fakeBus(true);
    await workflowHandoverSpec.run(bus, ['--session-id', 'sess-A', '--output', 'json']);
    expect(dispatches[0].event).toBe('workflow.handover');
    expect(dispatches[0].payload).toEqual({ sessionId: 'sess-A' });
  });
});

describe('workflow.continue spec', () => {
  it('dispatches workflow.continue with an empty payload by default', async () => {
    const { bus, dispatches } = fakeBus(true);
    await workflowContinueSpec.run(bus, ['--output', 'json']);
    expect(dispatches[0].event).toBe('workflow.continue');
    expect(dispatches[0].payload).toEqual({});
  });

  it('forwards --session-id into the payload when supplied (re-bind current stage)', async () => {
    const { bus, dispatches } = fakeBus(true);
    await workflowContinueSpec.run(bus, ['--session-id', 'sess-B', '--output', 'json']);
    expect(dispatches[0].event).toBe('workflow.continue');
    expect(dispatches[0].payload).toEqual({ sessionId: 'sess-B' });
  });
});

describe('workflow.abort spec', () => {
  it('dispatches workflow.abort with the reason payload', async () => {
    const { bus, dispatches } = fakeBus(true);
    await workflowAbortSpec.run(bus, ['--reason', 'changed', '--output', 'json']);
    expect(dispatches[0].event).toBe('workflow.abort');
    expect(dispatches[0].payload).toEqual({ reason: 'changed' });
  });
});

describe('workflow.command-init spec', () => {
  it('is internal (hidden from help)', () => {
    expect(workflowCommandInitSpec.visibility).toBe('internal');
    expect(workflowCommandInitSpec.id).toBe('workflow.command-init');
  });

  it('dispatches the camelCase workflow.commandInit event', async () => {
    const { bus, dispatches } = fakeBus(true);
    await workflowCommandInitSpec.run(bus, ['--name', 'aet-design', '--output', 'json']);
    expect(dispatches[0].event).toBe('workflow.commandInit');
    expect(dispatches[0].payload).toEqual({ name: 'aet-design' });
  });

  it('forwards --argument into the commandInit payload when supplied', async () => {
    const { bus, dispatches } = fakeBus(true);
    await workflowCommandInitSpec.run(bus, ['--name', 'aet-design', '--argument', '做一个登录功能', '--output', 'json']);
    expect(dispatches[0].payload).toEqual({ name: 'aet-design', argument: '做一个登录功能' });
  });
});