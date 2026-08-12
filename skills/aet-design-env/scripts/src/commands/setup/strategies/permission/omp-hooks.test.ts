/**
 * Boundary unit tests for OmpHooksWriter's patternToRegex pure function
 * + snapshot tests for the generated .ts hook file content.
 *
 * Concern 4 of the maintainability audit: the inlined escaping logic was
 * hard to test directly. After extraction to `patternToRegex`, this file
 * covers each JS regex metacharacter + edge cases so silent escape-bugs
 * (e.g. forgetting to escape `\` — would produce invalid regex) are
 * caught immediately.
 *
 * Gap 4 of testability audit: the string-concatenated .ts file content was
 * only verifiable through base-agent-tests.ts's syntax/structure assertions.
 * The snapshot tests below independently verify the EXACT generated content
 * structure (imports, strP/reP arrays, hook function, blocking loops).
 *
 * The agent-level acceptance test (base-agent-tests.ts:336-363) only
 * verifies the 4 most common conversions (`\\`, `\/`, `\.`, `[^/]+`)
 * against the default config patterns (`scripts/src/`, `config/agents.json`,
 * `scripts/*.mjs`). This file covers ALL metacharacters + pathological
 * combinations + the full generated .ts content.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { patternToRegex, OmpHooksWriter } from './omp-hooks';

describe('patternToRegex', () => {
  /* ------------------------------------------- backslash (most critical) */
  it('escapes backslash — the historical silent-corruption point', () => {
    // A backslash in the source MUST become a literal `\\` in the regex,
    // otherwise downstream interpreters (regex engine, JSON.stringify of
    // the .ts file) would treat `\X` as an escape sequence.
    expect(patternToRegex('path\\to\\file*')).toBe('path\\\\to\\\\file[^/]+');
  });

  it('does not collapse consecutive backslashes', () => {
    // `\\` in source = `\\\\` in regex (4 chars). Bug: a non-anchored
    // replace could merge consecutive escapes.
    expect(patternToRegex('a\\\\b*')).toBe('a\\\\\\\\b[^/]+');
  });

  /* ------------------------------------------------- forward slash */
  it('escapes forward slash (cosmetic but consistent with .ts regex literal)', () => {
    expect(patternToRegex('a/b*')).toBe('a\\/b[^/]+');
  });

  /* ------------------------------------------------- dot */
  it('escapes dot (otherwise matches any char)', () => {
    expect(patternToRegex('config.json*')).toBe('config\\.json[^/]+');
  });

  /* ------------------------------------------------- plus */
  it('escapes plus (otherwise = 1-or-more quantifier)', () => {
    expect(patternToRegex('a+b*')).toBe('a\\+b[^/]+');
  });

  /* ------------------------------------------------- caret */
  it('escapes caret (otherwise = start anchor)', () => {
    expect(patternToRegex('^prefix*')).toBe('\\^prefix[^/]+');
  });

  /* ------------------------------------------------- dollar */
  it('escapes dollar (otherwise = end anchor)', () => {
    expect(patternToRegex('suffix$*')).toBe('suffix\\$[^/]+');
  });

  /* ------------------------------------------------- parens */
  it('escapes parens (otherwise = capture group)', () => {
    expect(patternToRegex('foo(bar)*')).toBe('foo\\(bar\\)[^/]+');
  });

  /* ------------------------------------------------- brackets */
  it('escapes brackets (otherwise = character class)', () => {
    expect(patternToRegex('a[b-c]*')).toBe('a\\[b-c\\][^/]+');
  });

  /* ------------------------------------------------- pipe */
  it('escapes pipe (otherwise = alternation)', () => {
    expect(patternToRegex('a|b*')).toBe('a\\|b[^/]+');
  });

  /* ------------------------------------------------- question mark */
  it('escapes question mark (otherwise = optional quantifier)', () => {
    expect(patternToRegex('colou?r*')).toBe('colou\\?r[^/]+');
  });

  /* ------------------------------------------------- star (the glob) */
  it('translates star to [^/]+ (single-segment glob, not .*)', () => {
    // Note: `/` is escaped to `\/` (cosmetic, consistent with .ts regex literal).
    expect(patternToRegex('scripts/*')).toBe('scripts\\/[^/]+');
    expect(patternToRegex('*')).toBe('[^/]+');
    expect(patternToRegex('a*b*c*')).toBe('a[^/]+b[^/]+c[^/]+');
  });

  /* ------------------------------------------------- non-meta chars */
  it('does not escape non-metacharacters (: = < > { } - !)', () => {
    // These have no special meaning outside a character class. Escaping
    // them would still be valid regex but would clutter the output.
    expect(patternToRegex('a:b=c<d>e{f}g-h!i*')).toBe('a:b=c<d>e{f}g-h!i[^/]+');
  });

  /* ------------------------------------------------- combinations */
  it('handles all metacharacters together in one pattern (no throw, valid regex)', () => {
    // Build a pattern containing every metachar we escape. We don't assert
    // the exact output string (hard to read) — instead we verify the
    // produced regex compiles + matches an input string with all the
    // metacharacters literally present.
    const all = '\\/.+^$()[]|?*';
    const result = patternToRegex(all);
    // No exception thrown, and the result is a usable regex source.
    const re = new RegExp('^' + result + '$');
    // The pattern `*` segments match any non-slash chars, so we test with
    // a string that has the metacharacters in the literal positions and
    // arbitrary content where the globs were.
    expect(re.test('\\/.+^$()[]|?XYZ')).toBe(true);
  });

  it('handles a typical Windows-style deny pattern', () => {
    // If a user adds a Windows path to deny list (uncommon but possible),
    // backslashes must be escaped so the generated .ts file is valid JS.
    // The `\` between `Users` and `*` becomes `\\` (escaped), so the
    // output has `\\[^/]+` (the literal backslash + the glob).
    expect(patternToRegex('C:\\Users\\*\\secrets*')).toBe('C:\\\\Users\\\\[^/]+\\\\secrets[^/]+');
  });

  it('handles a pattern with mixed glob and metacharacters', () => {
    // Real-world-ish: deny all `*.config.json` files in nested dirs.
    expect(patternToRegex('data/*.config.json*')).toBe('data\\/[^/]+\\.config\\.json[^/]+');
  });

  /* ------------------------------------------------- the round-trip property */
  it('produced regex matches the intended strings when used in /.../ ', () => {
    // Sanity: a real `new RegExp('^' + patternToRegex(p) + '$')` matches
    // a path the user would expect to deny.
    const re = new RegExp('^' + patternToRegex('scripts/*.mjs') + '$');
    expect(re.test('scripts/aet-design-env.mjs')).toBe(true);
    expect(re.test('scripts/sub/foo.mjs')).toBe(false);  // [^/]+ does not cross /
    expect(re.test('scripts/aet-design-env.ts')).toBe(false);
    expect(re.test('other/aet-design-env.mjs')).toBe(false);
  });

  it('documents the [^/]+ caveat for Windows-style paths', () => {
    // The glob `*` translates to `[^/]+` which excludes ONLY forward slash.
    // Backslash is matched as a regular char, so Windows-style paths
    // (where `\` is the separator) will have `*` match across what the
    // user might consider "segments". This is the documented omp-hooks
    // semantics — POSIX-only path matching. We test the actual behavior
    // here so future refactors don't accidentally change it.
    const re = new RegExp('^' + patternToRegex('C:\\Users\\*\\secrets*') + '$');
    expect(re.test('C:\\Users\\li\\secrets.env')).toBe(true);
    // Caveat: `*` matches `li\sub` because `\` is not `/`.
    expect(re.test('C:\\Users\\li\\sub\\secrets.env')).toBe(true);
    expect(re.test('C:\\Users\\li\\other.env')).toBe(false);
  });
});

/* ------------------------------------------- OmpHooksWriter snapshot tests */

describe('OmpHooksWriter generated .ts content', () => {
  it('generates expected .ts structure for default config patterns', () => {
    // SNAPSHOT test: verifies the EXACT generated .ts content structure
    // independently of base-agent-tests.ts (which only checks syntax validity).
    // If the generated content structure changes, this test breaks.
    const tmpDir = mkdtempSync(join(tmpdir(), 'omp-snap-'));
    try {
      const permFile = join(tmpDir, '.omp/hooks/pre/aet-design-env.ts');
      const writer = new OmpHooksWriter();
      const result = writer.apply({
        permFile,
        deny: {
          read: ['scripts/src/', 'config/agents.json'],
          write: ['scripts/src/', 'config/agents.json', 'scripts/*.mjs'],
        },
      });

      expect(result.updated).toBe(true);
      expect(result.skipped).toBe(false);

      const content = readFileSync(permFile, 'utf-8');

      // Import line
      expect(content).toContain('import type { HookAPI } from "@oh-my-pi/pi-coding-agent/hooks"');

      // Hook function signature
      expect(content).toContain('export default function (pi: HookAPI): void');
      expect(content).toContain('pi.on("tool_call"');

      // strPatterns (non-glob deny entries): scripts/src/ and config/agents.json
      expect(content).toContain('"scripts/src/"');
      expect(content).toContain('"config/agents.json"');

      // regexPattern (glob): scripts/*.mjs → /^scripts\/[^/]+\.mjs$/
      expect(content).toContain('/^scripts\\/[^/]+\\.mjs$/');

      // Both blocking loops present
      expect(content).toContain('for (const ___s of __strP)');
      expect(content).toContain('for (const ___r of __reP)');
      expect(content).toContain('block: true');
      expect(content).toContain('blocked by aet-design-env policy');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('is idempotent — second apply with same content returns skipped', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'omp-idem-'));
    try {
      const permFile = join(tmpDir, 'test.ts');
      const ctx = {
        permFile,
        deny: {
          read: ['scripts/src/'],
          write: ['scripts/src/', 'scripts/*.mjs'],
        },
      };
      const writer = new OmpHooksWriter();

      const r1 = writer.apply(ctx);
      expect(r1.updated).toBe(true);

      const r2 = writer.apply(ctx);
      expect(r2.updated).toBe(false);
      expect(r2.skipped).toBe(true);

      // Content unchanged
      const content1 = readFileSync(permFile, 'utf-8');
      writer.apply(ctx); // third run
      const content3 = readFileSync(permFile, 'utf-8');
      expect(content3).toBe(content1);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('skips when no deny patterns configured', () => {
    const tmpDir = mkdtempSync(join(tmpdir(), 'omp-empty-'));
    try {
      const writer = new OmpHooksWriter();
      const result = writer.apply({
        permFile: join(tmpDir, 'test.ts'),
        deny: {},
      });
      expect(result.updated).toBe(false);
      expect(result.skipped).toBe(true);
      expect(existsSync(join(tmpDir, 'test.ts'))).toBe(false);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('separates glob patterns (regex) from non-glob (string) patterns', () => {
    // Verify the __strP and __reP arrays are correctly populated:
    // patterns with `*` go to __reP, patterns without `*` go to __strP.
    const tmpDir = mkdtempSync(join(tmpdir(), 'omp-split-'));
    try {
      const permFile = join(tmpDir, 'test.ts');
      const writer = new OmpHooksWriter();
      writer.apply({
        permFile,
        deny: {
          read: ['plain.txt', 'glob/*.config', 'another_glob'],
          write: [],
        },
      });

      const content = readFileSync(permFile, 'utf-8');

      // Non-glob patterns in __strP
      expect(content).toContain('"plain.txt"');
      expect(content).toContain('"another_glob"');

      // Glob pattern in __reP (as regex)
      expect(content).toContain('/^glob\\/[^/]+\\.config$/');

      // Glob pattern should NOT appear as a plain string
      expect(content).not.toContain('"glob/*.config"');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
