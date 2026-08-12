/**
 * @file src/plugins/dialect.test.ts
 *
 * Tests for the host hook dialect layer: built-in dialects, `extends`
 * inheritance, canonical→host and host→canonical direction, and the
 * registered built-ins match the verified real-world differences.
 */
import { describe, expect, it } from 'vitest';

import { DIALECTS, resolveDialect, DIALECT_ID } from './dialect.js';

describe('dialect defaults', () => {
  it('active dialect id is claude under non-esbuild runs (dev/test)', () => {
    expect(DIALECT_ID).toBe('claude');
  });

  it('unknown dialect ids resolve as a claude-identity fallback', () => {
    const d = resolveDialect('does-not-exist');
    expect(d.id).toBe('does-not-exist');
    expect(d.toHostEvent('PostToolUse')).toBe('PostToolUse');
    expect(d.postToolUseOutput).toBe('updatedToolOutput');
  });
});

describe('claude dialect (identity)', () => {
  const d = resolveDialect('claude');

  it('maps every canonical event to itself', () => {
    for (const e of ['UserPromptSubmit', 'SessionStart', 'PreToolUse', 'PostToolUse']) {
      expect(d.toHostEvent(e as never)).toBe(e);
    }
  });

  it('reverse-maps every host name to the same canonical name', () => {
    expect(d.fromHostEvent('PostToolUse')).toBe('PostToolUse');
    expect(d.fromHostEvent('UserPromptSubmit')).toBe('UserPromptSubmit');
  });

  it('keeps the claude post-tool output field name', () => {
    expect(d.postToolUseOutput).toBe('updatedToolOutput');
  });

  it('supports the full permission surface', () => {
    expect(d.permissions).toEqual(['allow', 'deny', 'ask', 'defer']);
  });
});

describe('codex dialect (extends claude, zero overrides)', () => {
  it('is registered and equals identity', () => {
    expect(DIALECTS.codex).toBeDefined();
    const d = resolveDialect('codex');
    expect(d.toHostEvent('PreToolUse')).toBe('PreToolUse');
    expect(d.postToolUseOutput).toBe('updatedToolOutput');
  });
});

describe('codeagent dialect (extends claude, zero overrides — aligned with claude)', () => {
  const d = resolveDialect('codeagent');

  it('maps every canonical event to itself (all 11 claude events, identity)', () => {
    for (const e of [
      'UserPromptSubmit',
      'SessionStart',
      'PreToolUse',
      'PostToolUse',
      'PermissionRequest',
      'Notification',
      'Stop',
      'SubagentStop',
      'PreCompact',
      'Setup',
      'SessionEnd',
    ] as const) {
      expect(d.toHostEvent(e)).toBe(e);
    }
  });

  it('keeps the claude post-tool output field name (updatedToolOutput)', () => {
    expect(d.postToolUseOutput).toBe('updatedToolOutput');
  });

  it('reverse-maps every host name to the same canonical name (identity)', () => {
    for (const e of [
      'PostToolUse',
      'PreToolUse',
      'UserPromptSubmit',
      'PermissionRequest',
      'Notification',
      'Stop',
      'SubagentStop',
      'PreCompact',
      'Setup',
      'SessionStart',
      'SessionEnd',
    ] as const) {
      expect(d.fromHostEvent(e)).toBe(e);
    }
  });

  it('inherits permissions from claude when not overridden', () => {
    expect(d.permissions).toEqual(['allow', 'deny', 'ask', 'defer']);
  });
});

describe('resolveDialect with a raw dialect object', () => {
  it('applies overrides on top of claude identity', () => {
    const d = resolveDialect({
      id: 'custom',
      hookEventNames: { PostToolUse: 'AfterToolUse' },
      hookSpecificOutput: { updatedToolOutput: 'updatedMCPToolOutput' },
    });
    expect(d.id).toBe('custom');
    expect(d.toHostEvent('PostToolUse')).toBe('AfterToolUse');
    expect(d.toHostEvent('PreToolUse')).toBe('PreToolUse');
    expect(d.postToolUseOutput).toBe('updatedMCPToolOutput');
  });

  it('inherits from an extends chain', () => {
    const d = resolveDialect({ id: 'nested', extends: 'codeagent' });
    // codeagent is aligned with claude (identity), so inheritance yields identity.
    expect(d.toHostEvent('PostToolUse')).toBe('PostToolUse');
    expect(d.postToolUseOutput).toBe('updatedToolOutput');
  });

  it('throws on a circular extends chain', () => {
    DIALECTS._circ_a = { id: '_circ_a', extends: '_circ_b' };
    DIALECTS._circ_b = { id: '_circ_b', extends: '_circ_a' };
    try {
      expect(() => resolveDialect('_circ_a')).toThrow(/circular/);
    } finally {
      delete DIALECTS._circ_a;
      delete DIALECTS._circ_b;
    }
  });
});