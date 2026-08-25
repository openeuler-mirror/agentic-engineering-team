/**
 * UT for path-safe.ts — path validation invariants ported from Spec Kit's
 * manifest.py `_validate_rel_path` and update-agent-context.sh's path checks.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  assertRelative,
  assertNoBackslash,
  assertNoDotDot,
  assertSafeRelativePath,
  isPathInside,
} from './path-safe';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function makeTempProject(prefix = 'aet-path-safe-ut-'): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), prefix));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

describe('path-safe.ts invariants', () => {
  let project: { root: string; cleanup: () => void };
  beforeEach(() => { project = makeTempProject(); });
  afterEach(() => { project.cleanup(); });

  describe('assertRelative', () => {
    it('rejects POSIX absolute paths', () => {
      expect(() => assertRelative('/etc/passwd')).toThrow();
      expect(() => assertRelative('/foo')).toThrow();
    });
    it('rejects Windows drive-qualified paths', () => {
      expect(() => assertRelative('C:/Windows')).toThrow();
      expect(() => assertRelative('C:\\Windows')).toThrow();
    });
    it('accepts relative paths', () => {
      expect(() => assertRelative('foo')).not.toThrow();
      expect(() => assertRelative('foo/bar')).not.toThrow();
      expect(() => assertRelative('.claude/agents/rule.md')).not.toThrow();
    });
  });

  describe('assertNoBackslash', () => {
    it('rejects backslash separators (cross-platform safety)', () => {
      expect(() => assertNoBackslash('foo\\bar')).toThrow();
      expect(() => assertNoBackslash('foo\\bar\\baz')).toThrow();
    });
    it('accepts forward slashes', () => {
      expect(() => assertNoBackslash('foo/bar')).not.toThrow();
    });
  });

  describe('assertNoDotDot', () => {
    it('rejects leading .. ', () => {
      expect(() => assertNoDotDot('../foo')).toThrow();
    });
    it('rejects middle .. segments even when not escaping', () => {
      expect(() => assertNoDotDot('foo/../bar')).toThrow();
    });
    it('accepts paths without ..', () => {
      expect(() => assertNoDotDot('foo/bar')).not.toThrow();
      expect(() => assertNoDotDot('.claude/agents/rule.md')).not.toThrow();
    });
  });

  describe('assertSafeRelativePath (combined)', () => {
    it('rejects absolute paths', () => {
      expect(() => assertSafeRelativePath('/etc/passwd', project.root)).toThrow();
    });
    it('rejects .. segments', () => {
      expect(() => assertSafeRelativePath('../foo', project.root)).toThrow();
      expect(() => assertSafeRelativePath('foo/../../../etc', project.root)).toThrow();
    });
    it('rejects backslash separators', () => {
      expect(() => assertSafeRelativePath('foo\\bar', project.root)).toThrow();
    });
    it('accepts valid relative paths', () => {
      expect(() => assertSafeRelativePath('.claude/agents/rule.md', project.root)).not.toThrow();
      expect(() => assertSafeRelativePath('.codexignore', project.root)).not.toThrow();
      expect(() => assertSafeRelativePath('AGENTS.md', project.root)).not.toThrow();
    });
  });

  describe('isPathInside containment', () => {
    it('returns true for child paths', () => {
      expect(isPathInside(join(project.root, 'foo'), project.root)).toBe(true);
      expect(isPathInside(join(project.root, 'foo', 'bar'), project.root)).toBe(true);
    });
    it('returns false for the root itself (not "inside")', () => {
      expect(isPathInside(project.root, project.root)).toBe(false);
    });
    it('returns false for sibling/external paths', () => {
      expect(isPathInside('/etc', project.root)).toBe(false);
      expect(isPathInside(join(project.root, '..', 'sibling'), project.root)).toBe(false);
    });
  });
});
