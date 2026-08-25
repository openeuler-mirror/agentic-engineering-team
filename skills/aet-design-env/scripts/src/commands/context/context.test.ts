/**
 * UT for context.ts — dispatcher behavior: plugin selection, --root
 * override, no-data handling. (Helper-function UTs live in
 * `context/project-analysis.test.ts`.)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runContext } from './context';

function makeTempProject(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'aet-ctx-dispatch-ut-'));
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function ensureAnalysisDir(root: string): string {
  const dir = join(root, '.aet', 'project-analysis');
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('runContext --root override', () => {
  let project: { root: string; cleanup: () => void };
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let exitSpy: any;

  beforeEach(() => {
    project = makeTempProject();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: string | number | null) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
  });
  afterEach(() => {
    project.cleanup();
    logSpy.mockRestore();
    errSpy.mockRestore();
    exitSpy.mockRestore();
  });

  function setupFixture(root: string): string {
    const dir = ensureAnalysisDir(root);
    const archPath = join(dir, 'Architecture.md');
    writeFileSync(archPath, '# Arch\n');
    // Canonicalize any symlinks (e.g. macOS /var → /private/var) so the path
    // we assert against matches what formatProjectAnalysis emits (which uses
    // resolve() on the project root).
    return realpathSync(archPath);
  }

  it('uses --root <path> as project root (no plugin name)', () => {
    const archPath = setupFixture(project.root);
    runContext(['--root', project.root]);
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toContain('<project-analysis>');
    expect(out).toContain(`<path>${archPath}</path>`);
  });

  it('uses --root when combined with plugin name (name then --root)', () => {
    const archPath = setupFixture(project.root);
    runContext(['project-analysis', '--root', project.root]);
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toContain(`<path>${archPath}</path>`);
  });

  it('uses --root when combined with plugin name (--root then name)', () => {
    const archPath = setupFixture(project.root);
    runContext(['--root', project.root, 'project-analysis']);
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toContain(`<path>${archPath}</path>`);
  });

  it('accepts --root=<path> (= form)', () => {
    const archPath = setupFixture(project.root);
    runContext(['project-analysis', `--root=${project.root}`]);
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toContain(`<path>${archPath}</path>`);
  });

  it('resolves path to absolute in output', () => {
    const archPath = setupFixture(project.root);
    runContext(['project-analysis', '--root', project.root]);
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    // Output paths must be absolute (start with /).
    expect(out).toContain(`<path>${archPath}</path>`);
  });

  it('defaults to cwd when no --root given', () => {
    const archPath = setupFixture(project.root);
    const origCwd = process.cwd();
    try {
      process.chdir(project.root);
      runContext(['project-analysis']);
      const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
      expect(out).toContain(`<path>${archPath}</path>`);
    } finally {
      process.chdir(origCwd);
    }
  });

  it('reports no data via stderr when named plugin finds nothing (no exit)', () => {
    // project.root has no .aet/project-analysis → plugin returns null.
    // With a named plugin, runContext prints "[<name>] no data found" to
    // stderr and does NOT call process.exit (exit only fires in the
    // no-args-all-plugins branch).
    runContext(['project-analysis', '--root', project.root]);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('no data found'));
  });

  it('does NOT exit 1 when project has no .aet/ — library-status plugins always report status', () => {
    // Semantic change introduced by the three library-status plugins
    // (scenario-lib / function-lib / sdr-lib): they ALWAYS return an XML
    // block with <exists>true|false</exists>, so the agent learns the
    // library status even when the YAML is absent. Hence context with no
    // plugin args no longer exits 1 merely because project-analysis has
    // no data — it produces the three library-status XML blocks instead.
    expect(() => runContext(['--root', project.root])).not.toThrow();
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toContain('<scenario-library>');
    expect(out).toContain('<exists>false</exists>');
    expect(out).toContain('<function-library>');
    expect(out).toContain('<sdr-library>');
    expect(errSpy).not.toHaveBeenCalledWith(expect.stringContaining('No context metadata'));
  });

  it('lists available plugins in --help-style error when unknown plugin name given', () => {
    runContext(['nonexistent-plugin', '--root', project.root]);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown plugins: nonexistent-plugin'));
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Available context plugins:'));
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('project-analysis'));
  });

  it('treats an existing directory positional arg as a PLUGIN NAME, not project root', () => {
    // Disambiguation regression: a subdirectory named `scenario-lib` exists
    // in the project root. The OLD parser would have treated `scenario-lib`
    // as the project root (= ./scenario-lib) and run ALL plugins. The NEW
    // parser treats it as a plugin name. Since `scenario-lib` IS a
    // registered plugin, the run succeeds and emits only the scenario-lib
    // block — proving no directory-name collision can hijack the root.
    mkdirSync(join(project.root, 'scenario-lib')); // colliding subdir
    runContext(['scenario-lib', '--root', project.root]);
    const out = logSpy.mock.calls.map((c) => String(c[0])).join('\n');
    expect(out).toContain('<scenario-library>');
    // Did NOT run all plugins (no <function-library>, no <project-analysis>)
    expect(out).not.toContain('<function-library>');
  });
});

describe('runContext --root error handling', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let exitSpy: any;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: string | number | null) => {
      throw new Error(`process.exit(${code})`);
    }) as never);
  });
  afterEach(() => {
    logSpy.mockRestore();
    errSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('errors out when --root has no following value', () => {
    expect(() => runContext(['--root'])).toThrow('process.exit(1)');
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('--root requires a value'));
  });

  it('errors out when --root points to a non-existent path', () => {
    const bogus = join(tmpdir(), 'aet-ctx-no-such-path-xyz');
    expect(() => runContext(['--root', bogus])).toThrow('process.exit(1)');
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('--root must point to an existing directory'));
  });

  it('errors out when --root points to a file (not a directory)', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'aet-ctx-file-root-'));
    try {
      const filePath = join(tmp, 'not-a-dir');
      writeFileSync(filePath, 'data');
      expect(() => runContext(['--root', filePath])).toThrow('process.exit(1)');
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('--root must point to an existing directory'));
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
