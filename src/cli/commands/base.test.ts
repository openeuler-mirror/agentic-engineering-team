import { describe, expect, it } from 'vitest';
import { cliError, encodeResult } from './base.js';
import { ok, err } from '../../definitions/events.js';

describe('cliError', () => {
  it('builds an exit-1 JSON error output', () => {
    const out = cliError('boom', 'E_CODE');
    expect(out.exitCode).toBe(1);
    expect(JSON.parse(out.stdout)).toMatchObject({ ok: false, error: { code: 'E_CODE', message: 'boom' } });
  });
});

describe('encodeResult', () => {
  it('encodes json mode with exit 0 on success', () => {
    const out = encodeResult(ok('please continue', [], { status: 'step_advanced' }), 'json');
    expect(out.exitCode).toBe(0);
    expect(JSON.parse(out.stdout).prompt).toBe('please continue');
  });

  it('encodes prompt mode, using exit 0 on success', () => {
    const out = encodeResult(ok('bare text'), 'prompt');
    expect(out.exitCode).toBe(0);
    expect(out.stdout).toBe('bare text');
  });

  it('uses exit 1 for a non-ok result in both modes', () => {
    // Build a fail result manually (err() gives prompt + ok=false).
    const result = { ok: false, prompt: 'ERROR: X — y', events: [], error: { code: 'X', message: 'y' } } as const;
    expect(encodeResult(result, 'json').exitCode).toBe(1);
    expect(encodeResult(result, 'prompt').exitCode).toBe(1);
  });
});