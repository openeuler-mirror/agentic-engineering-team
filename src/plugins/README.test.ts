import { describe, expect, it } from 'vitest';
import { getPluginManifest, PLUGINS, PLUGINS_NOTE } from './README.js';

describe('PLUGINS registry', () => {
  it('ships the three host manifests', () => {
    expect(PLUGINS.map((p) => p.host)).toEqual(['opencode', 'claude-code', 'omp']);
  });

  it('getPluginManifest returns a manifest by host', () => {
    expect(getPluginManifest('opencode')?.capabilityLevel).toBe('full');
    expect(getPluginManifest('claude-code')?.kind).toBe('in-process');
    expect(getPluginManifest('omp')?.kind).toBe('in-process');
    expect(getPluginManifest('omp')?.capabilityLevel).toBe('partial');
    // The fallback plugin was removed (fallback/prompt_only.md deleted); the
    // registry now covers only in-process hosts. Unknown hosts → undefined.
    expect(getPluginManifest('fallback')).toBeUndefined();
  });

  it('getPluginManifest returns undefined for an unknown host', () => {
    // @ts-expect-error runtime guard
    expect(getPluginManifest('nope')).toBeUndefined();
  });
});

describe('PLUGINS_NOTE', () => {
  it('is a non-empty string documenting the plugins', () => {
    expect(typeof PLUGINS_NOTE).toBe('string');
    expect(PLUGINS_NOTE.length).toBeGreaterThan(50);
    expect(PLUGINS_NOTE).toContain('opencode');
    expect(PLUGINS_NOTE).toContain('omp');
  });
});