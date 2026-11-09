import { describe, expect, it } from 'vitest';
import { decodePromptText, encodePromptText } from './prompt_text.js';

describe('decodePromptText', () => {
  it('passes through plain text', () => {
    expect(decodePromptText('/design 冒烟')).toEqual({ text: '/design 冒烟', encoded: false });
  });

  it('decodes the JSON-encoded string V2 sends in event.prompt.text', () => {
    const raw = JSON.stringify('/design 冒烟');
    expect(decodePromptText(raw)).toEqual({ text: '/design 冒烟', encoded: true });
  });

  it('joins array parts', () => {
    const raw = JSON.stringify([{ text: '/design' }, { content: ' 冒烟' }]);
    expect(decodePromptText(raw)).toEqual({ text: '/design\n 冒烟', encoded: true });
  });

  it('returns empty text for non-strings', () => {
    expect(decodePromptText(undefined)).toEqual({ text: '', encoded: false });
  });

  it('falls back to raw text when the JSON is malformed', () => {
    expect(decodePromptText('"/design')).toEqual({ text: '"/design', encoded: false });
  });
});

describe('encodePromptText', () => {
  it('restores the JSON encoding', () => {
    expect(encodePromptText('/design 冒烟', true)).toBe('"/design 冒烟"');
  });

  it('keeps plain text untouched', () => {
    expect(encodePromptText('/design 冒烟', false)).toBe('/design 冒烟');
  });
});
