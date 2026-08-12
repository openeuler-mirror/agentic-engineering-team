/**
 * Boundary unit tests for PythonHookWriter's string-literal escaping.
 *
 * Concern 5 of the maintainability audit: the previous implementation used
 * `p.replace(/"/g, '\\"')` which only escaped double-quotes — backslashes
 * in deny patterns (e.g. `C:\backup\`, `\path\to\secrets`) would be
 * silently corrupted by python's string-literal escape processing
 * (`\b` → backspace, `\t` → tab, `\n` → newline, etc.). The corruption
 * was UNDETECTABLE by the existing `python3 -c compile(...)` syntax check
 * in base-agent-tests.ts:392-403 because `\b` is a LEGAL python escape —
 * the script compiles fine but matches the wrong string.
 *
 * The fix (python-hook-base.ts) uses `JSON.stringify(p)` to produce a
 * python-safe string literal (JSON and python share string-literal
 * escaping for `\`, `"`, control chars, `\uXXXX`). These tests verify
 * the fix is correct by RUNNING the generated python script with
 * stdin payloads and checking exit codes:
 *   - exit 2 → match (deny)
 *   - exit 0 → no match (allow)
 *
 * This is stronger than the syntax-only check in base-agent-tests.ts
 * because it catches SEMANTIC corruption (legal python, wrong meaning).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import type { PermissionsFormat } from '../../base-agent';
import { PythonHookWriter } from './python-hook-base';
import type { PermissionWriterContext } from '../permission-writer';

/**
 * Minimal test-only subclass of PythonHookWriter that exposes the
 * generated python script for behavioral testing. We use a generic
 * preamble that picks up `command` OR `file_path` from `tool_input`
 * so we can exercise both hooks-of-arrows code paths.
 */
class TestPythonHookWriter extends PythonHookWriter {
  readonly format: PermissionsFormat = 'codex_hooks' as PermissionsFormat;
  protected readonly matcher = 'Bash|Edit|Write|Read';
  protected readonly eventName = 'PreToolUse' as const;
  protected readonly timeout = 5;
  protected readonly valueVar = 'v';
  protected buildPreamble(): string {
    return `ti=(d.get("tool_input")or{});v=(ti.get("file_path")or ti.get("command")or"")`;
  }
}

/** Parse the generated JSON file to extract the python command string. */
function extractPythonCommand(permPath: string): string {
  const j = JSON.parse(readFileSync(permPath, 'utf-8'));
  const arr = j.hooks?.PreToolUse ?? [];
  for (const entry of arr) {
    for (const h of entry.hooks ?? []) {
      if (typeof h.command === 'string' && h.command.startsWith('python3 -c ')) {
        return JSON.parse(h.command.slice('python3 -c '.length));
      }
    }
  }
  throw new Error('no python3 -c command found in generated hooks.json');
}

/** Run the python script with stdin payload, returning the exit code. */
function runPythonScript(script: string, stdinPayload: unknown): number {
  try {
    execSync(`python3 -c ${JSON.stringify(script)}`, {
      input: JSON.stringify(stdinPayload),
      stdio: ['pipe', 'ignore', 'ignore'],
      timeout: 5000,
    });
    return 0;  // exited normally → no match
  } catch (err: any) {
    if (err.status === 2) return 2;  // exit 2 → match (deny)
    if (err.status === 0) return 0;
    throw err;  // other exit codes are unexpected
  }
}

describe('PythonHookWriter backslash / control-char escaping', () => {
  let project: { root: string; cleanup: () => void };
  let originalCwd: string;

  beforeEach(() => {
    project = {
      root: mkdtempSync(join(tmpdir(), 'aet-pyhook-')),
      cleanup: () => rmSync(project.root, { recursive: true, force: true }),
    };
    originalCwd = process.cwd();
    process.chdir(project.root);
  });
  afterEach(() => {
    process.chdir(originalCwd);
    project.cleanup();
  });

  /* --------------------------------------------- backslash (the main bug) */
  it('correctly matches a deny pattern containing backslashes (no escape corruption)', () => {
    const writer = new TestPythonHookWriter();
    const ctx: PermissionWriterContext = {
      permFile: join(project.root, 'hooks.json'),
      deny: { read: ['C:\\backup\\secrets\\'], write: [] },
    };
    const r = writer.apply(ctx);
    expect(r.updated).toBe(true);

    const script = extractPythonCommand(ctx.permFile);

    // The literal `C:\backup\secrets\` in source must become a python
    // string `C:\\backup\\secrets\\` (each backslash doubled) so that
    // python parses it back to `C:\backup\secrets\` (the original).
    // The bug: previous code produced `"C:\backup\secrets\"` in the
    // python source, which python parses as `C:\x08ackup\secrets\`
    // (with `\b` → backspace). The match check would then look for
    // `C:<BS>ackup<\s>ecrets<\>` — wrong string.
    //
    // Behavioral check: matching input → exit 2, non-matching → exit 0.
    expect(runPythonScript(script, {
      tool_input: { file_path: 'C:\\backup\\secrets\\api.key' },
    })).toBe(2);  // matches → blocked

    expect(runPythonScript(script, {
      tool_input: { file_path: 'C:\\public\\readme.md' },
    })).toBe(0);  // no match → allowed
  });

  /* ----------------------------------------------- other python escapes */
  it('does not corrupt \\t, \\n, \\r, \\f, \\v, \\0, \\a in deny patterns', () => {
    // Each of these is a python string escape that would corrupt the
    // match string if not properly escaped.
    const writer = new TestPythonHookWriter();
    const weirdPatterns = [
      'path\\twith\\ntabs',
      'path\\rwith\\rcr',
      'path\\fwith\\ffeed',
      'path\\vwith\\vvtab',
      'path\\0with\\0null',
      'path\\awith\\abel',
    ];
    const ctx: PermissionWriterContext = {
      permFile: join(project.root, 'hooks.json'),
      deny: { read: weirdPatterns, write: [] },
    };
    expect(writer.apply(ctx).updated).toBe(true);

    const script = extractPythonCommand(ctx.permFile);

    // Each pattern should match its own literal form.
    for (const p of weirdPatterns) {
      expect(runPythonScript(script, {
        tool_input: { file_path: p + '/extra' },
      })).toBe(2);  // matches → blocked
    }
    // Unrelated path → no match.
    expect(runPythonScript(script, {
      tool_input: { file_path: 'completely/unrelated/path.md' },
    })).toBe(0);
  });

  /* ----------------------------------------------- double quotes in pattern */
  it('correctly escapes embedded double-quotes in deny patterns', () => {
    const writer = new TestPythonHookWriter();
    const ctx: PermissionWriterContext = {
      permFile: join(project.root, 'hooks.json'),
      deny: { read: ['file with "quotes" in name'], write: [] },
    };
    expect(writer.apply(ctx).updated).toBe(true);
    const script = extractPythonCommand(ctx.permFile);
    expect(runPythonScript(script, {
      tool_input: { file_path: 'file with "quotes" in name.txt' },
    })).toBe(2);
    expect(runPythonScript(script, {
      tool_input: { file_path: 'no quotes here' },
    })).toBe(0);
  });

  /* ----------------------------------------------- unicode in pattern */
  it('correctly escapes unicode chars in deny patterns', () => {
    const writer = new TestPythonHookWriter();
    const ctx: PermissionWriterContext = {
      permFile: join(project.root, 'hooks.json'),
      deny: { read: ['路径/机密/'], write: [] },
    };
    expect(writer.apply(ctx).updated).toBe(true);
    const script = extractPythonCommand(ctx.permFile);
    expect(runPythonScript(script, {
      tool_input: { file_path: '路径/机密/credentials.json' },
    })).toBe(2);
    expect(runPythonScript(script, {
      tool_input: { file_path: 'public/readme.md' },
    })).toBe(0);
  });

  /* ----------------------------------------------- default deny patterns still work */
  it('default deny patterns (forward-slash, no metachars) still work end-to-end', () => {
    // Regression guard: the JSON.stringify-based fix shouldn't break
    // the common case (forward-slash POSIX paths).
    const writer = new TestPythonHookWriter();
    const ctx: PermissionWriterContext = {
      permFile: join(project.root, 'hooks.json'),
      deny: {
        read: ['scripts/src/', 'config/agents.json'],
        write: ['scripts/*.mjs'],
      },
    };
    expect(writer.apply(ctx).updated).toBe(true);
    const script = extractPythonCommand(ctx.permFile);

    // Read deny: paths starting with `scripts/src/`
    expect(runPythonScript(script, {
      tool_input: { file_path: 'scripts/src/setup/base-agent.ts' },
    })).toBe(2);  // blocked
    expect(runPythonScript(script, {
      tool_input: { file_path: 'config/agents.json' },
    })).toBe(2);  // blocked
    expect(runPythonScript(script, {
      tool_input: { file_path: 'README.md' },
    })).toBe(0);  // allowed

    // Write deny with glob: `scripts/*.mjs` — the `*` is a literal char
    // in the pattern (not a python glob), so this only matches paths
    // literally containing `scripts/*.mjs` (which is unusual). For real
    // glob semantics the deny list would use `fnmatch`, but the python
    // check is `v.startswith(p) or fnmatch.fnmatch(v, "*"+p+"*")` — the
    // fnmatch call uses `*` as a shell glob, so `scripts/*.mjs` matches
    // `scripts/aet-design-env.mjs` via fnmatch.
    expect(runPythonScript(script, {
      tool_input: { file_path: 'scripts/aet-design-env.mjs' },
    })).toBe(2);  // blocked via fnmatch
  });
});
