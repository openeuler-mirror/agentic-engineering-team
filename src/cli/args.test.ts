import { describe, expect, it } from 'vitest';
import { optionalFlag, parseArgs, requireFlag, requireOutputMode, UsageError } from './args.js';

describe('parseArgs', () => {
  it('parses --flag value', () => {
    expect(parseArgs(['--name', 'foo'])).toEqual({
      positionals: [],
      flags: { name: 'foo' },
    });
  });

  it('parses --flag=value', () => {
    expect(parseArgs(['--name=foo']).flags.name).toBe('foo');
  });

  it('parses a valueless boolean flag', () => {
    expect(parseArgs(['--json']).flags.json).toBe(true);
  });

  it('parses short flags', () => {
    expect(parseArgs(['-o', 'json'])).toEqual({
      positionals: [],
      flags: { o: 'json' },
    });
    expect(parseArgs(['-o=json']).flags.o).toBe('json');
  });

  it('collects positionals in order', () => {
    const r = parseArgs(['workflow', 'init', '--name', 'x']);
    expect(r.positionals).toEqual(['workflow', 'init']);
    expect(r.flags.name).toBe('x');
  });

  it('treats everything after `--` as raw', () => {
    const r = parseArgs(['workflow', 'init', '--', 'a --flag']);
    expect(r.positionals).toEqual(['workflow', 'init']);
    expect(r.raw).toBe('a --flag');
  });

  it('does not consume a flag-looking token as a value', () => {
    // `--name` then `--output` → name stays boolean, output gets value.
    const r = parseArgs(['--name', '--output', 'json']);
    expect(r.flags.name).toBe(true);
    expect(r.flags.output).toBe('json');
  });
});

describe('requireFlag', () => {
  it('returns the value when present', () => {
    expect(requireFlag(parseArgs(['--name', 'x']), 'name', 'label')).toBe('x');
  });

  it('throws UsageError when missing', () => {
    expect(() => requireFlag(parseArgs([]), 'name', 'workflow name')).toThrow(UsageError);
    expect(() => requireFlag(parseArgs([]), 'name', 'workflow name')).toThrow(/--name/);
  });

  it('treats valueless boolean as missing', () => {
    expect(() => requireFlag(parseArgs(['--name']), 'name', 'label')).toThrow(UsageError);
  });
});

describe('optionalFlag', () => {
  it('returns undefined when absent', () => {
    expect(optionalFlag(parseArgs([]), 'step')).toBeUndefined();
  });

  it('returns undefined for valueless boolean', () => {
    expect(optionalFlag(parseArgs(['--step']), 'step')).toBeUndefined();
  });

  it('returns the value when present', () => {
    expect(optionalFlag(parseArgs(['--step', 's2']), 'step')).toBe('s2');
  });
});

describe('requireOutputMode', () => {
  it('defaults to prompt', () => {
    expect(requireOutputMode(parseArgs([]))).toBe('prompt');
  });

  it('returns json for --output json', () => {
    expect(requireOutputMode(parseArgs(['--output', 'json']))).toBe('json');
  });

  it('throws UsageError for an invalid value', () => {
    expect(() => requireOutputMode(parseArgs(['--output', 'bogus']))).toThrow(UsageError);
  });
});