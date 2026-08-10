/**
 * @file skills/aet-install/scripts/src/install.ts
 *
 * AET runtime bootstrap script, shipped alongside every host plugin as
 * `<plugin>/skills/aet-install/scripts/install.cjs` (esbuild output, CJS).
 * The `#!/usr/bin/env node` shebang is added by esbuild's `banner` at bundle
 * time (build.mjs / the test bundle), NOT authored in the source — so the
 * source stays a plain TS module and the built .cjs gets the shebang as its
 * first line.
 * Its job is the FIRST-TIME initialization of the AET runtime on the user's
 * machine:
 *
 *   1. Install the global `aet` CLI (from `<plugin>/cli/` via `npm i -g`) so
 *      both the agent and the user's own terminal can run bare `aet` commands.
 *   2. Copy the versioned AET runtime files (from `<plugin>/runtime/`) into
 *      `~/.aet/` — today that is `config/workflow.json` (the live config that
 *      actually runs), later design/ script templates etc. Runtime files are
 *      OVERWRITTEN on a version BUMP and left untouched on the SAME version
 *      (idempotent), so user edits to workflow.json survive within a version.
 *
 * It runs at `/init` time (the user-invoked AET init command), NOT at
 * session start — so it is a deliberate, user-present action with no
 * timeout pressure and no startup race. It uses `npm i -g` for the CLI
 * (cross-platform bin resolution / PATH wiring / global install location all
 * handled for us) and plain `node:fs` copies for the runtime. If the global
 * install fails (e.g. an unwritable default prefix), we do NOT silently
 * fall back to a secondary prefix — we fail loudly and let the agent tell the
 * user init failed, since a half-installed CLI is worse than a clear error.
 * After a successful install we re-verify `aet` resolves on PATH so a
 * not-on-PATH global bin dir is surfaced rather than silently re-installed on
 * every subsequent /init.
 *
 * Resolution order (each step MUST pass before the next):
 *   1. Node runtime present + >= engines.node (18). If absent → hard error,
 *      the caller surfaces it to the user ("install Node, then /init again").
 *   2. npm present. If absent → hard error (npm is the chosen installer).
 *   3. Global `aet` already installed AND version matches the bundled CLI →
 *      skip install (idempotent; no-op on every /init after the first).
 *   4. Otherwise `npm i -g <cliDir>`.
 *   5. Runtime sync: the runtime version tracks the INSTALLED CLI's version
 *      (both are stamped from the same root version at build time). We read the
 *      installed CLI's version via `aet --version` and copy from
 *      `<plugin>/runtime/` (overwrite) only when the runtime has NOT yet been
 *      synced for that version — determined by whether `~/.aet/config/` exists
 *      (the runtime's first top-level target). No marker file is kept: the
 *      installed CLI version IS the source of truth.
 *
 * Failure is NEVER silent: every error path prints a clear message to stderr
 * and exits non-zero, so the agent relays it verbatim to the user.
 *
 * Cross-platform: subprocesses are spawned via `cross-spawn` (bundled in by
 * esbuild), NOT raw `node:child_process`. On Windows `npm`/`aet` are `.cmd`
 * shims, not real executables; raw `spawnSync('npm')` fails with ENOENT.
 * cross-spawn's `parseNonShell` resolves the `.cmd` via PATH/PATHEXT and
 * delegates to `cmd.exe /d /s /c`, so bare `npm`/`aet` work on every platform.
 *
 * Compile: build.mjs bundles this TS → `install.cjs` (CJS, platform:node)
 * into the aet-install skill's scripts/ dir. The output keeps the zero-
 * dependency invariant — cross-spawn is inlined by esbuild, so the shipped
 * `.cjs` imports only `node:*` builtins.
 */

import spawn from 'cross-spawn';
import { existsSync, readFileSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Minimum Node major version, mirrored from root package.json `engines.node`.
// If the host's runtime is older we refuse to install / run — the CLI (and
// the plugin handlers) assume a modern Node.
const MIN_NODE_MAJOR = 18;

// Version of the bundled CLI, stamped at build time by build.mjs into
// `<plugin>/cli/package.json`. We read it from there (not hardcoded) so the
// check always compares against the copy that ships with THIS plugin.
function readBundledVersion(cliDir: string): string | null {
  try {
    const pkg = JSON.parse(readFileSync(join(cliDir, 'package.json'), 'utf8'));
    return pkg.version ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Print a fatal error to stderr and exit non-zero. Never silent. */
function fail(code: number, message: string): never {
  console.error(`[aet:ensure] ${message}`);
  process.exit(code);
}

/** Result of a spawned command. */
interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error: string | null;
}

/**
 * Run `cmd args` and return { status, stdout, stderr } without throwing.
 * Uses cross-spawn so `npm` / `aet` resolve correctly on Windows (`.cmd`
 * shims run via cmd.exe). `opts` are passed through to the spawn options.
 */
function run(cmd: string, args: string[], opts: Record<string, unknown> = {}): RunResult {
  const res = spawn.sync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  });
  return {
    status: res.status,
    stdout: (res.stdout || '').trim(),
    stderr: (res.stderr || '').trim(),
    error: res.error ? (res.error as Error).message : null,
  };
}

/** Compare two dot-separated versions; returns true if a >= b (best-effort). */
function gte(a: string, b: string): boolean {
  // Normalize: strip any leading non-numeric prefix (e.g. `aet 0.5.3 (...)` →
  // `0.5.3`) so version tokens compare numerically regardless of the CLI's
  // `--version` banner format.
  const norm = (s: string): number[] => String(s || '').replace(/^[^\d]*/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pa = norm(a);
  const pb = norm(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  // 0. Locate bundled assets next to this script: <plugin>/cli and <plugin>/runtime.
  const selfDir = __dirname; // <plugin>/skills/aet-install/scripts
  const cliDir = join(selfDir, '..', 'cli');
  const runtimeDir = join(selfDir, '..', 'runtime');
  const installSrc = cliDir;

  // 1. Node runtime check. If the user has no Node, nothing else works —
  //    the CLI and all handlers are Node programs. Bail out loudly.
  if (!process.versions?.node) {
    fail(41, 'Node.js is required but not available. Install Node.js >= 18, then run /init again.');
  }
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  if (nodeMajor < MIN_NODE_MAJOR) {
    fail(41, `AET requires Node.js >= ${MIN_NODE_MAJOR}; found ${process.versions.node}. Please upgrade Node.js, then run /init again.`);
  }

  // 2. npm check. npm is our chosen cross-platform installer; without it we
  //    cannot guarantee a PATH-correct global `aet`. Bail rather than guess.
  const npm = run('npm', ['--version']);
  if (npm.error || !npm.stdout) {
    fail(42, `npm is required to install the AET CLI but was not found (${npm.error || 'no version output'}). Install npm / Node.js, then run /init again.`);
  }

  // Preconditions passed. Determine whether we actually need to install.
  const bundledVersion = readBundledVersion(cliDir);
  if (!bundledVersion) {
    fail(43, `Bundled AET CLI package not found at ${installSrc}. Reinstall the plugin, then run /init again.`);
  }

  // 3. Global `aet` CLI — install only if missing or older than bundled.
  //    (Idempotent: an up-to-date install is skipped on every /init.)
  //    We capture the PRE-INSTALL observed CLI version. If it is missing or
  //    older than bundled we upgrade; either way `installedVersion < bundled`
  //    afterwards signals the runtime must re-sync to the bundled version.
  let installedVersion: string | null = null;
  const existing = run('aet', ['--version']);
  if (!existing.error && existing.stdout) {
    installedVersion = existing.stdout.trim();
    if (gte(installedVersion, bundledVersion)) {
      console.log(`[aet:ensure] AET CLI ${installedVersion} already installed (need >= ${bundledVersion}); skipping install.`);
    } else {
      console.log(`[aet:ensure] global AET CLI ${installedVersion} is older than bundled ${bundledVersion}; upgrading.`);
      installCli(installSrc);
    }
  } else {
    console.log('[aet:ensure] global AET CLI not found; installing.');
    installCli(installSrc);
  }

  // 4. Runtime sync. Every /init syncs; the runtime-meta.json whitelist
  //    decides per-file (whitelisted+present → preserve, whitelisted+missing →
  //    add, else → overwrite). A version bump flows new runtime files in; a
  //    same-version re-run stays idempotent because whitelisted edits survive.
  //    No marker file and no CLI-version gating (the CLI is always latest after
  //    step 3, so gating on it would be circular).
  syncRuntime(runtimeDir);
}

/**
 * Install the bundled CLI globally via npm. Exits on failure — the caller's
 * agent relays the error verbatim to the user ("init failed"). On success,
 * RE-VERIFIES that `aet` is now resolvable on PATH before declaring success:
 * a successful `npm i -g` does not guarantee the global bin dir is on the
 * user's PATH, and a silently-unusable install would make every subsequent
 * /init re-enter this install path forever.
 */
function installCli(installSrc: string): void {
  const res = run('npm', ['install', '-g', installSrc], {
    env: { ...process.env, npm_config_fund: 'false', npm_config_audit: 'false' },
  });

  if (res.status !== 0) {
    // Final failure — surface the real npm output so the agent can act on it.
    fail(44, `npm install -g failed.\n  stdout: ${res.stdout || '(empty)'}\n  stderr: ${res.stderr || res.error || '(empty)'}\n\nAET init failed: the CLI could not be installed. Check the npm output above (often a permissions issue — consider fixing your global npm prefix), then run /init again.`);
  }

  // Verify the installed `aet` is actually resolvable. If the global bin dir
  // is not on PATH, the install "succeeded" but `aet` is unusable — that is a
  // hard failure, surfaced to the user rather than silently glossed over.
  const check = run('aet', ['--version']);
  if (check.error || !check.stdout) {
    fail(45, `AET CLI was installed globally but the \`aet\` command could not be found on PATH.\n  npm said: ${res.stdout || res.stderr || '(no output)'}\n  check said: ${check.error || '(no version output)'}\n\nAET init failed: add npm's global bin directory to your PATH, then run /init again.`);
  }

  console.log(`[aet:ensure] AET CLI ${check.stdout} installed globally. You can now run \`aet\` from your terminal.`);
}

// ---------------------------------------------------------------------------
// Runtime sync
// ---------------------------------------------------------------------------

/** Resolve the AET global root dir (~/.aet by default; AET_GLOBAL_ROOT overrides). */
function globalAetDir(): string {
  const base = process.env.AET_GLOBAL_ROOT || (process.env.HOME || '');
  return join(base, '.aet');
}

/**
 * Copy a runtime file into ~/.aet/, applying the whitelist:
 *   - whitelisted file that ALREADY exists in ~/.aet/ → preserve (skip);
 *   - whitelisted file MISSING in ~/.aet/ → copy (add it);
 *   - non-whitelisted file → always copy (overwrite).
 * Returns true when the file was copied, false when preserved or skipped.
 */
function copyRuntimeFile(relPath: string, srcFile: string, destFile: string, whitelist: string[]): boolean {
  const destExists = existsSync(destFile);
  if (whitelist.includes(relPath) && destExists) {
    console.log(`[aet:ensure]    keep existing ${relPath} (whitelisted)`);
    return false;
  }
  mkdirSync(dirname(destFile), { recursive: true });
  copyFileSync(srcFile, destFile);
  return true;
}

/**
 * Recursively sync the bundled runtime files into ~/.aet/, applying the
 * whitelist from runtime-meta.json. Walks the runtime dir tracking each file's
 * RELATIVE path; whitelisted paths that already exist are preserved (user
 * edits survive), whitelisted-but-missing paths are added, everything else is
 * overwritten. `runtime-meta.json` itself is meta, never copied as content.
 */
function syncRuntimeTree(runtimeDir: string, aetDir: string, whitelist: string[]): { copied: number; kept: number } {
  let copied = 0;
  let kept = 0;
  const walk = (srcDir: string, relPrefix: string): void => {
    for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
      if (entry.name === 'runtime-meta.json') continue; // meta, not content
      const s = join(srcDir, entry.name);
      const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(s, relPath);
      } else if (entry.isFile()) {
        const destFile = join(aetDir, relPath);
        if (copyRuntimeFile(relPath, s, destFile, whitelist)) copied++;
        else kept++;
      }
    }
  };
  walk(runtimeDir, '');
  return { copied, kept };
}

/**
 * Read the whitelist from the bundled runtime's runtime-meta.json.
 * Returns an array of relative paths; an unreadable/absent meta degrades to
 * an EMPTY whitelist (everything overwritten — safe default).
 */
function readWhitelist(runtimeDir: string): string[] {
  const metaPath = join(runtimeDir, 'runtime-meta.json');
  if (!existsSync(metaPath)) return [];
  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { whitelist?: unknown };
    return Array.isArray(meta.whitelist) ? (meta.whitelist as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Sync the bundled runtime files into ~/.aet/. No version gating: every /init
 * syncs, and the runtime-meta.json whitelist decides per-file behavior —
 * whitelisted files already present in ~/.aet/ are PRESERVED (user edits
 * survive), whitelisted-but-missing files are added, everything else is
 * overwritten. A version bump therefore flows new runtime files in naturally,
 * while a same-version re-run stays idempotent (whitelisted edits untouched).
 */
function syncRuntime(runtimeDir: string): void {
  if (!existsSync(runtimeDir)) {
    console.log(`[aet:ensure] runtime dir not found at ${runtimeDir}; skipping runtime sync.`);
    return;
  }

  const aetDir = globalAetDir();

  // Copy runtime/* into ~/.aet/ (each top-level entry maps to ~/.aet/<name>),
  // honoring the whitelist for per-file preserve-vs-overwrite decisions.
  const whitelist = readWhitelist(runtimeDir);
  console.log(`[aet:ensure] syncing AET runtime → ${aetDir} ...`);
  const { copied, kept } = syncRuntimeTree(runtimeDir, aetDir, whitelist);
  console.log(`[aet:ensure] AET runtime synced to ${aetDir}; ${copied} copied, ${kept} preserved.`);
}

main();