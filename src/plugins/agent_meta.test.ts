import { describe, expect, it } from 'vitest';
import { BUILTIN_AGENTS, resolveAgentMeta } from './agent_meta.js';

describe('resolveAgentMeta', () => {
  it('resolves a built-in id', () => {
    expect(resolveAgentMeta('opencode').id).toBe('opencode');
    expect(resolveAgentMeta('claude-code').id).toBe('claude-code');
    expect(resolveAgentMeta('omp').id).toBe('omp');
    expect(resolveAgentMeta('cursor').id).toBe('cursor');
  });

  it('is case-insensitive', () => {
    expect(resolveAgentMeta('OpenCode').id).toBe('opencode');
  });

  it('degrades unknown ids to fallback', () => {
    expect(resolveAgentMeta('totally-unknown').id).toBe('fallback');
  });

  it('degrades empty/undefined to fallback', () => {
    expect(resolveAgentMeta('').id).toBe('fallback');
    // @ts-expect-error runtime guard
    expect(resolveAgentMeta(undefined).id).toBe('fallback');
  });
});

describe('BUILTIN_AGENTS', () => {
  it('ships all five built-in entries', () => {
    expect(Object.keys(BUILTIN_AGENTS)).toEqual(['opencode', 'claude-code', 'omp', 'cursor', 'fallback']);
  });

  it('in-process agents default to json output', () => {
    expect(BUILTIN_AGENTS.opencode.defaultOutput).toBe('json');
    expect(BUILTIN_AGENTS.omp.defaultOutput).toBe('json');
    expect(BUILTIN_AGENTS.omp.pluginKind).toBe('in-process');
    expect(BUILTIN_AGENTS.fallback.defaultOutput).toBe('prompt');
  });
});