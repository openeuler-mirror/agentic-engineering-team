import { describe, expect, it } from 'vitest';
import { encodeJson } from './json_encoder.js';
import { encodePrompt } from './prompt_encoder.js';
import { err, ok } from '../../definitions/events.js';

describe('encodeJson', () => {
  it('serializes a CommandResult to a single JSON string', () => {
    const result = ok('step 2', [], { status: 'step_advanced', currentStep: 's2', nextStep: null });
    expect(JSON.parse(encodeJson(result))).toMatchObject({
      ok: true,
      prompt: 'step 2',
      data: { status: 'step_advanced' },
    });
  });

  it('serializes an error envelope', () => {
    const r = encodeJson(err('BAD', 'oops'));
    expect(JSON.parse(r).ok).toBe(false);
    expect(JSON.parse(r).error).toEqual({ code: 'BAD', message: 'oops' });
  });
});

describe('encodePrompt', () => {
  it('returns prompt verbatim', () => {
    const text = '## Step 1\nline two';
    expect(encodePrompt(ok(text))).toBe(text);
  });

  it('surfaces error text for an error result', () => {
    const r = err('NO_ACTIVE', 'nothing');
    expect(encodePrompt(r)).toBe('ERROR: NO_ACTIVE — nothing');
  });
});