import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, copyFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { build } from 'esbuild';
import { describe, expect, it, beforeAll } from 'vitest';

// The bootstrap script is authored as TS (scripts/src/install.ts) and
// bundled to CJS at build time. The test bundles the TS source on-the-fly
// (same esbuild config as build.mjs) so it exercises the SOURCE, not a stale
// checked-in artifact, and needs no `npm run build` first.
const INSTALL_TS = join(__dirname, 'install.ts');
let INSTALL_SCRIPT = '';

beforeAll(async () => {
  const outfile = join(mkdtempSync(join(tmpdir(), 'aet-install-bundle-')), 'install.cjs');
  await build({
    entryPoints: [INSTALL_TS],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    outfile,
    banner: { js: '#!/usr/bin/env node' },
    minify: false,
    sourcemap: false,
    treeShaking: true,
    legalComments: 'none',
    logLevel: 'silent',
  });
  INSTALL_SCRIPT = outfile;
});

/**
 * Build a throwaway plugin dir with a controlled cli/ + runtime/ and run
 * install.cjs inside it against an isolated AET_GLOBAL_ROOT.
 *
 * Returns { status, stdout, aetRoot } where aetRoot is the temp ~/.aet dir.
 */
function runEnsure(opts: {
  cliVersion?: string;
  installedAetVersion?: string;
  preExistingConfig?: boolean;
  preExistingWorkflow?: string;
  whitelist?: string[];
  extraRuntimeFiles?: Record<string, string>; // relPath → content
  extraPreExisting?: Record<string, string>; // ~/.aet relPath → content
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'aet-ensure-test-'));
  mkdirSync(join(root, 'bin'));
  const cliDir = join(root, 'cli');
  mkdirSync(cliDir);
  writeFileSync(
    join(cliDir, 'package.json'),
    JSON.stringify(
      { name: 'aet-cli', version: opts.cliVersion ?? '9.9.9', bin: { aet: './aet.js' } },
      null,
      2,
    ),
    'utf8',
  );

  // runtime/ — config/workflow.json + optional extra files + runtime-meta.json
  // whitelist. The runtime shares the CLI's version (cli/package.json); no
  // separate runtime version marker is shipped.
  const runtimeDir = join(root, 'runtime');
  mkdirSync(join(runtimeDir, 'config'), { recursive: true });
  writeFileSync(join(runtimeDir, 'config', 'workflow.json'), JSON.stringify({ test: true }), 'utf8');
  for (const relPath of Object.keys(opts.extraRuntimeFiles ?? {})) {
    const full = join(runtimeDir, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, opts.extraRuntimeFiles![relPath], 'utf8');
  }
  writeFileSync(
    join(runtimeDir, 'runtime-meta.json'),
    JSON.stringify({ whitelist: opts.whitelist ?? [] }, null, 2),
    'utf8',
  );

  copyFileSync(INSTALL_SCRIPT, join(root, 'bin', 'install.cjs'));

  const aetRoot = mkdtempSync(join(tmpdir(), 'aet-ensure-homedir-'));
  const env: NodeJS.ProcessEnv = { ...process.env, AET_GLOBAL_ROOT: aetRoot };
  // If a fake installed `aet` should be on PATH, write it BEFORE calling the
  // script so the CLI step reads the version we control. We also stub `npm` in
  // the same bin dir so the CLI-upgrade path never touches the developer's real
  // global npm — `npm i -g` is intercepted and faked to succeed without side
  // effects (hermetic test; no global install pollution).
  if (opts.installedAetVersion !== undefined) {
    const fakeBin = mkdtempSync(join(tmpdir(), 'aet-fakebin-'));
    writeFileSync(join(fakeBin, 'aet'), `#!/usr/bin/env node\nconsole.log("aet ${opts.installedAetVersion} (test)")\n`, { mode: 0o755 });
    writeFileSync(
      join(fakeBin, 'npm'),
      `#!/usr/bin/env node\nconst a = process.argv.slice(2);\nif (a.includes('--version')) { console.log('10.8.2'); process.exit(0); }\n// 'install -g <dir>' — pretend success with no real global side effects.\nprocess.exit(0);\n`,
      { mode: 0o755 },
    );
    env.PATH = `${fakeBin}:${env.PATH ?? ''}`;
  }

  // Pre-seed an existing runtime (simulate a prior install) if requested.
  if (opts.preExistingConfig && opts.preExistingWorkflow !== undefined) {
    mkdirSync(join(aetRoot, '.aet', 'config'), { recursive: true });
    writeFileSync(join(aetRoot, '.aet', 'config', 'workflow.json'), opts.preExistingWorkflow, 'utf8');
  }
  for (const relPath of Object.keys(opts.extraPreExisting ?? {})) {
    const full = join(aetRoot, '.aet', relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, opts.extraPreExisting![relPath], 'utf8');
  }

  try {
    const stdout = execFileSync('node', [join(root, 'bin', 'install.cjs')], {
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, aetRoot };
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    return { status: e.status ?? 1, stdout: e.stdout ?? '', aetRoot };
  }
}

describe('install.cjs Bootstrap', () => {
  it('syncs the runtime on first run (no pre-existing ~/.aet)', () => {
    const res = runEnsure({ cliVersion: '0.2.0', installedAetVersion: '0.2.0' });
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/syncing AET runtime/);
    // Runtime config landed in ~/.aet/.
    expect(existsSync(join(res.aetRoot, '.aet', 'config', 'workflow.json'))).toBe(true);
  });

  it('syncs every run but PRESERVES a user-edited whitelisted workflow.json', () => {
    const res = runEnsure({
      cliVersion: '0.2.0',
      installedAetVersion: '0.2.0',
      whitelist: ['config/workflow.json'],
      preExistingConfig: true,
      preExistingWorkflow: '{"userEdits":true}',
    });
    expect(res.status).toBe(0);
    // Sync happens (no version gating), but the whitelisted file is preserved.
    expect(res.stdout).toMatch(/syncing AET runtime/);
    expect(readFileSync(join(res.aetRoot, '.aet', 'config', 'workflow.json'), 'utf8')).toBe('{"userEdits":true}');
  });

  it('declares a CLI upgrade (older installed CLI) and still syncs runtime', () => {
    const res = runEnsure({
      cliVersion: '0.3.0',
      installedAetVersion: '0.2.0', // installed CLI older than bundled
      preExistingConfig: true,
      preExistingWorkflow: '{"userEdits":true}',
      whitelist: [], // EMPTY whitelist → everything overwritten
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/is older than bundled .*upgrading/);
    expect(res.stdout).toMatch(/syncing AET runtime/);
    // Empty whitelist → workflow.json is overwritten with the bundled template.
    expect(readFileSync(join(res.aetRoot, '.aet', 'config', 'workflow.json'), 'utf8')).toBe('{"test":true}');
  });

  it('skips the CLI install when a global aet is already installed', () => {
    const res = runEnsure({
      cliVersion: '0.1.0',
      installedAetVersion: '0.2.0',
      whitelist: [],
      preExistingConfig: true,
      preExistingWorkflow: '{"syncIt":true}',
    });
    expect(res.stdout).toMatch(/already installed/);
    // Even with the CLI already installed, /init still syncs runtime.
    expect(res.stdout).toMatch(/syncing AET runtime/);
  });

  it('preserves a user-edited WHITELISTED runtime file on a re-sync', () => {
    const res = runEnsure({
      cliVersion: '0.3.0',
      installedAetVersion: '0.2.0',
      whitelist: ['config/workflow.json'],
      preExistingConfig: true,
      preExistingWorkflow: '{"userEdits":true}',
    });
    expect(res.stdout).toMatch(/syncing AET runtime/);
    // Whitelisted + present → preserved, NOT overwritten.
    expect(readFileSync(join(res.aetRoot, '.aet', 'config', 'workflow.json'), 'utf8')).toBe('{"userEdits":true}');
  });

  it('adds a WHITELISTED runtime file when it is missing from ~/.aet', () => {
    const res = runEnsure({
      cliVersion: '0.3.0',
      installedAetVersion: '0.2.0',
      whitelist: ['config/workflow.json'],
      extraRuntimeFiles: { 'design/tpl.json': '{"tpl":true}' },
      preExistingConfig: true,
      preExistingWorkflow: '{"cfg":true}',
    });
    // Whitelisted file missing in ~/.aet → added.
    expect(existsSync(join(res.aetRoot, '.aet', 'config', 'workflow.json'))).toBe(true);
    // Non-whitelisted extra file → also copied.
    expect(readFileSync(join(res.aetRoot, '.aet', 'design', 'tpl.json'), 'utf8')).toBe('{"tpl":true}');
  });

  it('overwrites (never preserves) a NON-whitelisted runtime file on a re-sync', () => {
    const res = runEnsure({
      cliVersion: '0.3.0',
      installedAetVersion: '0.2.0',
      whitelist: ['config/workflow.json'], // ONLY workflow.json is whitelisted
      extraRuntimeFiles: { 'design/tpl.json': '{"bundledNew":true}' },
      preExistingConfig: true,
      // Pre-seed an OLD non-whitelisted design/tpl.json in ~/.aet.
      extraPreExisting: { 'design/tpl.json': '{"userOld":true}' },
    });
    // Non-whitelisted design/tpl.json was overwritten with the bundled copy.
    expect(readFileSync(join(res.aetRoot, '.aet', 'design', 'tpl.json'), 'utf8')).toBe('{"bundledNew":true}');
  });

  it('does NOT copy runtime-meta.json into ~/.aet (it is meta, not content)', () => {
    const res = runEnsure({ cliVersion: '0.2.0', installedAetVersion: '0.2.0', whitelist: ['config/workflow.json'] });
    expect(existsSync(join(res.aetRoot, '.aet', 'runtime-meta.json'))).toBe(false);
  });

  // ── Cross-platform spawn (Windows) ────────────────────────────────────────
  // npm/aet are `.cmd` shims on Windows, not real executables. Raw
  // `node:child_process.spawnSync('npm')` fails with ENOENT there; the script
  // MUST use cross-spawn (bundled in by esbuild), whose parseNonShell resolves
  // the `.cmd` via PATH/PATHEXT and delegates to `cmd.exe /d /s /c`. These
  // tests guard that the compiled artifact keeps the cross-spawn path.

  it('bundle uses cross-spawn, not raw spawnSync, for subprocess spawning (Windows .cmd shims)', () => {
    const bundle = readFileSync(INSTALL_SCRIPT, 'utf8');
    // cross-spawn's win32 shim path is inlined: it resolves .cmd/.bat via
    // PATHEXT and rewrites to `cmd.exe /d /s /c`. Absent these markers the
    // script regressed to raw spawnSync and would break on Windows.
    expect(bundle).toContain('cmd.exe');
    expect(bundle).toContain('PATHEXT');
    expect(bundle).toContain('windowsVerbatimArguments');
    // The script must not call spawnSync directly on npm/aet — only through
    // cross-spawn's sync wrapper. (cross-spawn itself requires child_process,
    // but a bare `spawnSync(` at top level would be the raw path.)
    expect(bundle).not.toMatch(/spawnSync\(\s*['"]npm/);
  });

  it('resolves a `.cmd`-named shim on PATH (the cross-spawn mechanism Windows needs)', () => {
    // Cross-platform harness: put an executable named `fake-cmd-tool.cmd` on
    // PATH. On Windows a `.cmd` is only runnable through cmd.exe (cross-spawn's
    // parseNonShell path); on POSIX it is a plain executable. This verifies the
    // spawn layer resolves PATH entries by name rather than hardcoding an
    // extensionless binary — the same mechanism that makes `npm`/`aet` work on
    // Windows.
    const shimDir = mkdtempSync(join(tmpdir(), 'aet-cmdshim-'));
    writeFileSync(join(shimDir, 'fake-cmd-tool.cmd'), '#!/usr/bin/env node\nprocess.stdout.write("cmd-shim-ok\\n")\n', { mode: 0o755 });
    const out = execFileSync('node', ['-e', `
      const spawn = require(process.argv[1]);
      const r = spawn.sync('fake-cmd-tool.cmd', [], { encoding: 'utf8' });
      process.stdout.write(r.stdout || r.error?.message || '');
    `, require.resolve('cross-spawn')], {
      env: { ...process.env, PATH: `${shimDir}:${process.env.PATH ?? ''}` },
      encoding: 'utf8',
    });
    expect(out).toContain('cmd-shim-ok');
  });
});