/**
 * @file scripts/build.mjs
 *
 * Bundler for `@aet/workflow-core`.
 *
 * Produces three categories of artifact under `dist/`:
 *
 *   1. CLI bundle — `dist/bin/aet.js` (ESM, executable).
 *      Entry: `src/bin/aet.ts`. This is the canonical AET CLI; package.json
 *      `bin.aet` points here. Invoked as `aet workflow init ...`.
 *
 *   2. Per-host plugin bundles — `dist/plugins/<host>/...`.
 *      Entries: `src/plugins/<host>/index.ts` (opencode) and
 *      `src/plugins/claude_code/hooks/handlers/aet_handler.ts` (CC handler).
 *      These are the Layer 2 plugin runtimes (新方案.md §2.3 / §5 Phase 1/3).
 *
 *   3. Static plugin artifacts — settings.json, slash commands, docs.
 *      Copied as-is from `src/plugins/<host>/` to `dist/plugins/<host>/`.
 *
 * Build-time zero-dependency invariant (AET_REFACTOR_ARCH.md §6.5.4 step 3):
 * each bundle is scanned for `require(...)` / `import ... from '...'` whose
 * target is not a Node builtin; the build fails if any are found. This
 * keeps the deployment surface truly zero-dep.
 */

import { build } from 'esbuild';
import { accessSync, readFileSync } from 'node:fs';
import { chmod, copyFile, cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

/**
 * @typedef {{ hostId: string, entryFile: string, outputDir: string, outputFile: string, format: 'esm'|'cjs', executable?: boolean }}
 */

// CLI bundle — always built. This is the user-facing entry point.
const CLI_MANIFEST = {
  hostId: 'cli',
  entryFile: 'src/bin/aet.ts',
  outputDir: 'dist/bin/',
  outputFile: 'aet.js',
  format: 'esm',
  executable: true,
};

// Per-host plugin bundles. There is no generic in-process bundle list
// anymore: every host is assembled by its own function below —
//   - OpenCode → assembleOpencodePlugin() (self-contained package:
//     package.json main → bin/aet_handler.js, skills/, commands/).
//   - CC-family + Codex → the CC_DISTRIBUTIONS loop (handler bundle +
//     assemblePlugin / assembleCodexMarketplace), with a per-distribution
//     `define: { __AET_AGENT_ID__: ... }` baked in (so SessionStart writes
//     slash commands into the matching host's commands dir).
// See CC_HANDLER_ENTRY + CC_DISTRIBUTIONS below.

// Static plugin artifacts copied verbatim into dist/. With the native CC
// plugin assembled by assemblePlugin() and the scatter-install path
// removed, the only remaining static copy is the plugins README source.
const STATIC_ARTIFACTS = [
  { src: 'src/plugins/README.ts', dest: 'dist/plugins/README.ts' },
];

// CC native plugin assembly — emits ONE self-contained plugin directory per
// CC_DISTRIBUTIONS row, each with its OWN handler bundle built with a
// per-distribution `define` injection (so the SessionStart hook inside
// each bundle bakes a different agent id → writes slash commands into the
// matching host's commands dir: .claude/commands/ vs .cac/commands/).
// All rows follow the CC plugins-reference layout ({manifestDir}/plugin.json,
// hooks/hooks.json using ${ROOT_VAR}, bin/, commands/, skills/, README.md).
//
// SINGLE SOURCE OF TRUTH: every host's facets (dialect + distribution +
// agent) are declared together in `src/plugins/hosts.json`. This array is
// DERIVED from the hosts that declare a `distribution` facet — no per-row
// edits here. Adding a new CC-compatible runtime = adding one host block in
// hosts.json (distribution + dialect); buildOne/assemblePlugin need no change.
const CC_HANDLER_ENTRY = 'src/plugins/claude_code/hooks/handlers/aet_handler.ts';
const SKILLS_SRC = 'skills';
const COMMANDS_SRC = 'src/commands';
// Runtime source of truth — the files copied into the aet-install skill's
// runtime/ (currently config/workflow.json; extensions under src/extensions/*/
// add more). workflow.json is NOT whitelist-protected (always overwritten on
// sync); extension-provided runtime-meta.json may declare whitelists for its
// own files. No default runtime-meta.json is shipped.
const RUNTIME_SRC = 'src/config';

// OpenCode self-contained plugin package. The entry is the ported handler
// (aet_handler.ts); assembleOpencodePlugin() wraps its bundle with a
// package.json (`main` → bin/aet_handler.js), skills/, commands/ + README so
// OpenCode can load the whole directory as one plugin (superpowers-style).
const OPENCODE_ENTRY = 'src/plugins/opencode/aet_handler.ts';
const OPENCODE_TARGET_DIR = 'dist/plugins/opencode';

// omp (Oh My Pi) self-contained extension package. The entry is the ported
// handler (aet_handler.ts); assembleOmpPlugin() wraps its bundle with a
// package.json (`omp.extensions` → [./bin/aet_handler.js]), skills/, commands/
// + README so omp loads the whole directory as one hook extension. omp's hook
// model is an in-process TS module (HookAPI pi.on) — architecturally a sibling
// of OpenCode, NOT a CC stdin-JSON dialect — so it gets its own plugin + its
// own assemble function (NOT the CC_DISTRIBUTIONS loop).
const OMP_ENTRY = 'src/plugins/omp/aet_handler.ts';
const OMP_TARGET_DIR = 'dist/plugins/omp';

// Canonical AET tagline — the single description used in every generated
// plugin.json manifest AND the one-line pitch of every plugin README. Kept
// in sync with src/README.md's opening blockquote so the dist plugins and
// the source-of-truth README describe the product identically.
const AET_TAGLINE = 'AET (Agentic Engineering Team) 全流程 AI 辅助研发底座/引擎：通过多个专用 AI 智能体有序协作，覆盖从需求分析、设计、编码、测试到发布、运维的软件研发全生命周期。';

const HOSTS = JSON.parse(readFileSync('src/plugins/hosts.json', 'utf8')).hosts;
// Dialects section of hosts.json — single source of truth for the canonical→host
// hook-namespace remap (event names + post-tool output field). Mirrors the
// resolution logic in src/plugins/dialect.ts (flatten `extends` inheritance),
// but reimplemented here as pure data because build.mjs is a .mjs and cannot
// import the TS module. Used by assemblePlugin / assembleCodexMarketplace to
// generate hooks.json with the host's REAL event keys (identity for the
// currently-registered dialects — claude/codex/codeagent are all aligned 1:1),
// and to keep the handler-bundle define (`__AET_DIALECT_ID__`) and the
// generated hooks.json in sync from one source — a host that renames events
// MUST see those renamed keys in its hooks.json, or the runtime fires events
// the hook never registered for.
const DIALECTS = JSON.parse(readFileSync('src/plugins/hosts.json', 'utf8')).dialects;

/**
 * Resolve a dialect id into a flat canonical→host event-name map (with
 * `extends` inheritance applied). Identity for `claude` (no overrides).
 * @param {string} id dialect id
 * @returns {{ eventNames: Record<string,string>, postToolUseOutput: string }}
 */
function resolveDialect(id) {
  const flat = { eventNames: {}, hookSpecificOutput: {} };
  const chain = [];
  for (let cur = DIALECTS[id] ?? { id }; cur && cur.extends && cur.extends !== cur.id; cur = DIALECTS[cur.extends]) {
    chain.unshift(cur);
  }
  chain.unshift(DIALECTS[id] ?? { id });
  for (const d of chain) {
    if (d.hookEventNames) Object.assign(flat.eventNames, d.hookEventNames);
    if (d.hookSpecificOutput) Object.assign(flat.hookSpecificOutput, d.hookSpecificOutput);
  }
  return {
    eventNames: flat.eventNames,
    postToolUseOutput: flat.hookSpecificOutput.updatedToolOutput ?? 'updatedToolOutput',
  };
}

/** Canonical (claude) event name → this host's hook event name (identity for claude). */
function toHostEvent(dialectId, canonical) {
  const { eventNames } = resolveDialect(dialectId);
  return eventNames[canonical] ?? canonical;
}

const CC_DISTRIBUTIONS = Object.entries(HOSTS)
  .filter(([, h]) => h.distribution)
  .map(([id, h]) => ({
    label: h.label,
    agentId: id,
    dialectId: h.dialect,
    kind: h.distribution.kind,
    targetDir: h.distribution.targetDir,
    manifestDirs: h.distribution.manifestDirs,
    rootVar: h.distribution.rootVar,
    commandsDir: h.distribution.commandsDir,
    installPath: h.distribution.installPath,
  }));

const NODE_BUILTINS = new Set([
  'fs', 'fs/promises', 'path', 'crypto', 'child_process', 'os', 'util', 'stream', 'events',
  'url', 'assert', 'buffer', 'querystring', 'string_decoder', 'timers', 'zlib',
  'http', 'https', 'net', 'tls', 'dns', 'perf_hooks', 'worker_threads',
  'process', 'console',
]);

function fileExists(path) {
  try { accessSync(path); return true; } catch { return false; }
}

/**
 * Scan a bundle for external (non-Node-builtin) requires/imports.
 * Works for both ESM (`import ... from '...'`) and CJS (`require('...')`).
 * Returns the set of violating package names (empty = invariant holds).
 */
function findExternalDeps(code) {
  const violations = new Set();
  // CJS require(...)
  for (const m of code.matchAll(/require\(\s*["']([^.][^"']*)["']\s*\)/g)) {
    const p = m[1].replace(/^node:/, '');
    if (!NODE_BUILTINS.has(p)) violations.add(p);
  }
  // ESM import ... from '...'
  for (const m of code.matchAll(/from\s+["']([^.][^"']*)["']/g)) {
    const p = m[1].replace(/^node:/, '');
    if (!NODE_BUILTINS.has(p)) violations.add(p);
  }
  // ESM bare import '...' (side-effect)
  for (const m of code.matchAll(/(^|\n)\s*import\s+["']([^.][^"']*)["']/g)) {
    const p = m[2].replace(/^node:/, '');
    if (!NODE_BUILTINS.has(p)) violations.add(p);
  }
  return [...violations];
}

/**
 * Build one bundle.
 *
 * @param {m} manifest — hostId / entryFile / outputDir / outputFile / format / executable.
 * @param {define} optional — esbuild `define` map for build-time identifier
 *        substitution. Used by the CC_DISTRIBUTIONS loop to bake a per-
 *        distribution agent id into the handler bundle (e.g.
 *        `{ __AET_AGENT_ID__: '"claude-code"' }`). Omit for bundles with no
 *        build-time placeholders.
 */
async function buildOne(m, define) {
  const outfile = join(m.outputDir, m.outputFile);
  await mkdir(m.outputDir, { recursive: true });

  // ── 1. esbuild bundle ──
  // workflow-core has zero npm runtime deps (only `node:*` builtins), so
  // the default `bundle: true` is sufficient — local imports are inlined
  // and `node:*` builtins stay external via `platform: 'node'`.
  // `define` performs token-level substitution at build time — used to bake
  // the agent id into CC handler bundles (per-distribution).
  const banner = m.executable ? { js: '#!/usr/bin/env node' } : undefined;
  await build({
    entryPoints: [m.entryFile],
    bundle: true,
    platform: 'node',
    format: m.format,
    target: 'node20',
    outfile,
    banner,
    define: define ?? {},
    // Keep bundles readable for debugging; flip to `true` for production.
    minify: false,
    sourcemap: true,
    treeShaking: true,
    legalComments: 'none',
    logLevel: 'info',
  });

  // ── 2. Zero-dependency invariant check (§6.5.4 step 3) ──
  const code = await readFile(outfile, 'utf8');
  const external = findExternalDeps(code);
  if (external.length > 0) {
    throw new Error(
      `[aet:build] ${m.hostId} bundle violates zero-dependency invariant. ` +
      `External deps found: ${external.join(', ')}`
    );
  }

  // ── 3. Per-dist package.json override ──
  // Root package.json has `"type": "module"`. For CJS bundles we override
  // locally so `require('./dist/<host>/aet.js')` works without renaming.
  const pkgJsonPath = join(m.outputDir, 'package.json');
  const pkgType = m.format === 'cjs' ? 'commonjs' : 'module';
  await writeFile(pkgJsonPath, JSON.stringify({ type: pkgType }, null, 2) + '\n', 'utf8');

  // ── 4. Make CLI bundle executable ──
  if (m.executable) {
    await chmod(outfile, 0o755);
  }

  console.log(`[aet:build] ${m.hostId.padEnd(12)} → ${outfile} (${m.format})${m.executable ? ' [exec]' : ''}`);
}

async function copyStatic(src, dest) {
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(src, dest);
  console.log(`[aet:build] ${relative('.', src).padEnd(40)} → ${dest} (copy)`);
}

/**
 * Copy the skills/ tree into a host's skills/ dir, excluding non-distributable
 * files (test files, .DS_Store). Skill dirs are shipped as plugin content, so
 * tests/editor cruft must not leak into dist.
 */
async function copySkills(src, dest) {
  await mkdir(dest, { recursive: true });
  const walk = async (s, d) => {
    for (const e of await readdir(s, { withFileTypes: true })) {
      if (e.name === '.DS_Store') continue;
      // aet-install/scripts/src/ — TS source for the install bootstrap, NOT
      // distributable. The built .cjs (esbuild output) is what ships.
      if (e.name === 'src' && s.endsWith('aet-install/scripts')) continue;
      const srcPath = join(s, e.name);
      const destPath = join(d, e.name);
      if (e.isDirectory()) {
        await walk(srcPath, destPath);
      } else if (e.isFile()) {
        if (/\.test\.(ts|js|cjs|mjs)$/.test(e.name)) continue; // no tests in dist
        await mkdir(dirname(destPath), { recursive: true });
        await copyFile(srcPath, destPath);
      }
    }
  };
  await walk(src, dest);
}

// ---------------------------------------------------------------------------
// Bundled CLI self-install (enable-time bootstrap)
// ---------------------------------------------------------------------------

// The aet-install skill lives under skills/aet-install/ and is copied into every
// host by SKILLS_SRC (the whole skills/ tree). Its scripts/install.cjs is
// PRE-BUILT by the skill's own toolchain
// (skills/aet-install/scripts/src/build.mjs — aet-design-env pattern) and
// COMMITTED to the repo; copySkills carries it into dist verbatim (644, called
// via `node scripts/install.cjs`). assembleCliSelfInstall does NOT touch
// install.cjs — it only assembles cli/ (npm-installable aet CLI package) +
// runtime/ (base config synced to ~/.aet/), which depend on main repo artifacts
// (dist/bin/aet.js, src/config/) and so cannot live in the skill. The TS source
// + build toolchain are kept OUT of dist (copySkills explicitly skips .../scripts/src/).

/**
 * Stamp the AET install resources into `<pluginDir>/skills/aet-install/`.
 *
 * The aet-install skill is the SINGLE installation carrier for AET:
 *
 *   <pluginDir>/skills/aet-install/
 *   ├── SKILL.md                  # install instructions (from skills/aet-install/, via SKILLS_SRC copy)
 *   ├── scripts/install.cjs       # bootstrap script (PRE-BUILT by skill's own build.mjs, committed to repo)
 *   ├── runtime/                  # src/config/workflow.json + extensions merged (runtime-meta merged)
 *   └── cli/                      # npm-installable aet CLI package
 *
 * `install.cjs` resolves its assets relative to `__dirname` (`../cli`,
 * `../runtime`), so this layout matches its expectations with no path rewiring.
 * The script is executed by the agent following the aet-install skill, so NO
 * plugin absolute path is injected by any hook.
 *
 * MUST run AFTER the SKILLS_SRC → skills/ copy (which brings SKILL.md and any
 * author-authored skill files) so it does not get clobbered by it.
 *
 * @param {string} pluginDir — the plugin's root dir (e.g. dist/plugins/codeagent3).
 * @param {{version: string}} rootPkg — root package.json (version source).
 * @param {string} label — host label for log lines.
 */
async function assembleCliSelfInstall(pluginDir, rootPkg, label) {
  const installDir = join(pluginDir, 'skills', 'aet-install');
  const cliDir = join(installDir, 'cli');
  const runtimeDir = join(installDir, 'runtime');

  // 1. cli/ — the npm-installable package wrapping the CLI bundle.
  await mkdir(cliDir, { recursive: true });
  const cliPkg = {
    name: 'aet-cli',
    version: rootPkg.version,
    description: 'AET (aet-cli): event-driven CLI + Core for orchestrating multi-agent coding workflows.',
    type: 'module',
    bin: { aet: './aet.js' },
    engines: { node: '>=18.0.0' },
  };
  await writeFile(join(cliDir, 'package.json'), JSON.stringify(cliPkg, null, 2) + '\n', 'utf8');
  await copyFile('dist/bin/aet.js', join(cliDir, 'aet.js'));
  await chmod(join(cliDir, 'aet.js'), 0o755);
  await writeFile(
    join(cliDir, 'README.md'),
    `# aet-cli\n\nSelf-installable AET CLI bundle for \`${label}\`. Installed globally by the \`/init\` flow via \`npm i -g <this dir>\`.\n`,
    'utf8',
  );
  console.log(`[aet:build] ${label.padEnd(12)} → ${join(cliDir, 'package.json')} + aet.js (cli self-install)`);

  // 2. runtime/ — the base AET runtime files, copied to ~/.aet/ at bootstrap.
  //    Base source: src/config/workflow.json → runtime/config/workflow.json,
  //    src/config/repository.json → runtime/config/repository.json.
  //    Extension-provided runtime files (src/extensions/*/runtime) are merged
  //    on top by mergeAetPluginExtensions (with their runtime-meta.json
  //    whitelist unioned). workflow.json is NOT whitelist-protected (overwritten
  //    on every sync); repository.json IS whitelist-protected via the top-level
  //    src/extensions/runtime-meta.json (kept — user token edits survive).
  await mkdir(join(runtimeDir, 'config'), { recursive: true });
  await copyFile(join(RUNTIME_SRC, 'workflow.json'), join(runtimeDir, 'config', 'workflow.json'));
  await copyFile(join(RUNTIME_SRC, 'repository.json'), join(runtimeDir, 'config', 'repository.json'));
  console.log(`[aet:build] ${label.padEnd(12)} → ${join(runtimeDir, 'config/{workflow,repository}.json')} (copy base runtime, v${rootPkg.version})`);
}

// ---------------------------------------------------------------------------
// AET-plugin extension merge (src/extensions/<aet-plugin>/ → every host dist)
// ---------------------------------------------------------------------------

// User-defined AET-plugin extensions, merged into every coding-agent host dist.
// This directory is NOT shipped in the repo by default: a user with custom
// needs clones the repo, drops their extension(s) under src/extensions/<name>/
// (each with skills/, commands/, runtime/ subdirs), then runs the build. The
// build reads it only if present; absent → no extensions, normal build.
const EXTENSIONS_SRC = 'src/extensions';

// Extension subdirs we merge from src/extensions/<name>/ into every host dist.
// codex uses a plugins/aet/ marketplace layout (NOT its own claude-style
// commands/ dir — codex has no commands concept), so it merges skills+runtime
// into plugins/aet/ and skips commands.
const EXTENSION_SUBDIRS = ['skills', 'commands', 'runtime'];

/**
 * Every coding-agent host dist root + the subdir path that extension content
 * merges into. codex is special (self-contained plugin under plugins/aet/);
 * the others are flat plugin trees.
 *
 * Extension RUNTIME merges into the aet-install skill's runtime/ dir (the
 * single install carrier) rather than the plugin root; skills/commands merge
 * into the host's own skills/commands dirs.
 */
const HOST_DIST_TARGETS = [
  { dist: 'dist/plugins/claude-code' },
  { dist: 'dist/plugins/codeagent3' },
  { dist: 'dist/plugins/codex/plugins/aet', noCommands: true },
  { dist: 'dist/plugins/opencode' },
  { dist: 'dist/plugins/omp' },
];

/** Map an extension subdir to the target subdir within a host dist. */
function extensionDest(distRoot, sub) {
  // runtime lives inside the aet-install skill (single install carrier).
  if (sub === 'runtime') return join(distRoot, 'skills', 'aet-install', 'runtime');
  return join(distRoot, sub);
}

/**
 * Merge extension content from every `src/extensions/<aet-plugin>/` into every
 * coding-agent host dist. Each subdir of src/extensions/ (skills/, commands/,
 * runtime/) is an aet-plugin extension source: ANY host-independent content
 * the author drops in src/extensions/<name>/{skills,commands,runtime} flows into
 * ALL dists automatically. On conflicts the extension OVERWRITES the base
 * (global skills/src/commands/src/config) copy. For runtime/, runtime-meta.json
 * is MERGED (union of whitelists) across the base + every extension rather
 * than overwritten, so per-aet-plugin user-mutable files stay listed.
 * Absent `src/extensions/` dir → no-op.
 */
async function mergeAetPluginExtensions() {
  if (!fileExists(EXTENSIONS_SRC)) return;

  // Top-level runtime-meta.json (src/extensions/runtime-meta.json) — a shared
  // whitelist for the BASE runtime files, merged into every host's runtime/
  // BEFORE any per-extension meta. It lets the base config (e.g.
  // config/repository.json) be whitelist-protected without shipping a default
  // runtime-meta.json in the base runtime. Absent → no-op.
  const rootMeta = join(EXTENSIONS_SRC, 'runtime-meta.json');
  if (fileExists(rootMeta)) {
    for (const targetCfg of HOST_DIST_TARGETS) {
      const dest = extensionDest(targetCfg.dist, 'runtime');
      await mergeRuntimeMetas(EXTENSIONS_SRC, dest);
    }
  }

  const names = (await readdir(EXTENSIONS_SRC, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  for (const name of names) {
    for (const sub of EXTENSION_SUBDIRS) {
      const src = join(EXTENSIONS_SRC, name, sub);
      if (!fileExists(src)) continue;

      for (const targetCfg of HOST_DIST_TARGETS) {
        if (sub === 'commands' && targetCfg.noCommands) continue;
        const dest = extensionDest(targetCfg.dist, sub);
        await mergeExtTo(`src/extensions/${name}`, sub, src, dest);
      }
    }
  }
}

/** Merge one extension subdir into one host dist subdir. */
async function mergeExtTo(pluginPath, sub, src, dest) {
  await mkdir(dest, { recursive: true });
  // runtime-meta.json is special: merge the whitelist across sources rather
  // than overwrite, so the union of all extensions' user-mutable entries is kept.
  if (sub === 'runtime') {
    await mergeRuntimeMetas(src, dest);
  }
  // Copy the extension content (excluding runtime-meta.json, handled above).
  // dest is the target subdir (e.g. dist/plugins/xxx/skills); cp each entry
  // into it by NAME so a file entry lands as <dest>/<name> and a dir recurses.
  for (const entry of await readdir(src, { withFileTypes: true })) {
    if (entry.name === 'runtime-meta.json') continue;
    await cp(join(src, entry.name), join(dest, entry.name), { recursive: true });
  }
  console.log(`[aet:build] extension ${pluginPath}/${sub} → ${dest} (merge)`);
}

/**
 * Merge runtime-meta.json: union the `whitelist` arrays written so far in
 * dest with the ones from this extension's runtime-meta.json (if any).
 * result: arrays deduped, preserving extension entries. runtime-meta.json in
 * the SOURCE is still a meta file — never copied as a content file.
 */
async function mergeRuntimeMetas(src, dest) {
  const srcMeta = join(src, 'runtime-meta.json');
  const destMeta = join(dest, 'runtime-meta.json');

  const readWhitelist = (p) => {
    if (!fileExists(p)) return [];
    try {
      const j = JSON.parse(readFileSync(p, 'utf8'));
      return Array.isArray(j.whitelist) ? j.whitelist : [];
    } catch { return []; }
  };

  const p = readWhitelist(destMeta); // current accumulated state (base + earlier extensions)
  const s = readWhitelist(srcMeta);
  if (p.length === 0 && s.length === 0) return; // nothing to merge

  const merged = [...new Set([...p, ...s])];
  // Preserve the _comment/docstring from the base (dest) when present.
  let base = {};
  try { base = JSON.parse(readFileSync(destMeta, 'utf8')); } catch { base = {}; }
  await writeFile(
    destMeta,
    JSON.stringify({ ...base, whitelist: merged }, null, 2) + '\n',
    'utf8',
  );
}

/**
 * Coding-agent identity for the README substitution. src/README.md is the
 * byte-for-byte source of truth for every dist plugin README; the ONLY thing
 * that varies per host is the coding-agent's CLI command and display name
 * (the "coding agent 名称自适应" substitution). Keyed by host label
 * (hosts.json `label`).
 */
const README_AGENT_BY_LABEL = {
  'Claude Code': { cli: 'claude', display: 'Claude Code' },
  'CodeAgent3': { cli: 'codeagent', display: 'CodeAgent3' },
  'Codex': { cli: 'codex', display: 'Codex' },
  'OpenCode': { cli: 'opencode', display: 'OpenCode' },
  'omp (Oh My Pi)': { cli: 'omp', display: 'omp' },
};

/**
 * Dist plugin README — src/README.md taken VERBATIM (the single source of
 * truth), with only the coding-agent identity substituted: the CLI command
 * (`codeagent` → host) and display name (`CodeAgent3` → host). No invented
 * install section, no truncated 快速上手 — the generated README is exactly
 * src/README.md except for the coding-agent 名称自适应.
 *
 * @param {string} label — host display name (hosts.json `label`).
 * @returns {string} README.md content
 */
function buildHostReadme(label) {
  let readme = readFileSync('src/README.md', 'utf8');
  const agent = README_AGENT_BY_LABEL[label];
  if (agent) {
    // src/README.md names the coding agent as `codeagent` / CodeAgent3;
    // substitute the host's CLI command and display name everywhere they
    // appear. For CodeAgent3 both are identity → byte-for-byte identical.
    readme = readme.split('codeagent').join(agent.cli).split('CodeAgent3').join(agent.display);
  }
  return readme;
}

/**
 * Build the README for an assembled plugin dir (claude-code / codeagent3 /
 * codex). The README is src/README.md taken verbatim, with only the
 * coding-agent name adapted for the target distribution (see
 * buildHostReadme). No character is invented or dropped: the generated
 * README is byte-for-byte src/README.md except the coding-agent identity.
 *
 * @param {{label: string}} opts — label (host display name).
 * @returns {string} README.md content
 */
function buildPluginReadme({ label }) {
  return buildHostReadme(label);
}


/**
 * Copy src/commands/ into a dist commands dir, substituting build-time
 * version placeholders. init.md carries a `__AET_PLUGIN_VERSION__`
 * placeholder (the plugin's current version, shown to the user deciding
 * whether to re-run the install step); the placeholder is replaced with the
 * real root package version here so the shipped command reports the actual
 * plugin version.
 *
 * @param {string} commandsDest — target commands dir (host plugin commands/).
 * @param {string} version — root @aet/workflow-core version (plugin version).
 * @param {string} label — host label for log lines.
 */
async function copyCommandsWithVersion(commandsDest, version, label) {
  await mkdir(commandsDest, { recursive: true });
  if (!fileExists(COMMANDS_SRC)) {
    console.log(`[aet:build] ${label.padEnd(12)} → ${commandsDest} (empty, ${COMMANDS_SRC} not found)`);
    return;
  }
  await cp(COMMANDS_SRC, commandsDest, { recursive: true });
  const cmdFiles = (await readdir(commandsDest, { withFileTypes: true }))
    .filter((e) => e.isFile()).length;
  console.log(`[aet:build] ${label.padEnd(12)} → ${commandsDest} (copy, ${cmdFiles} files)`);

  // Substitute the plugin version placeholder in every shipped command file.
  const initPath = join(commandsDest, 'init.md');
  if (fileExists(initPath)) {
    const prev = await readFile(initPath, 'utf8');
    const next = prev.split('__AET_PLUGIN_VERSION__').join(version);
    if (next !== prev) {
      await writeFile(initPath, next, 'utf8');
      console.log(`[aet:build] ${label.padEnd(12)} → ${join(commandsDest, 'init.md')} (stamp v${version})`);
    }
  }
}

/**
 * Assemble a self-contained CC-style plugin directory at `opts.targetDir`.
 *
 * Emits {manifestDir}/plugin.json for each manifestDir, hooks/hooks.json
 * referencing the handler via ${opts.rootVar}, creates an empty commands/
 * dir, recursively copies skills/, and writes opts.readme as README.md.
 *
 * bin/ is NOT touched here — the caller (main()'s CC_DISTRIBUTIONS loop)
 * must have already run buildOne() with the per-distribution `define` to
 * write aet_handler.js + .map + package.json into <targetDir>/bin/ (the
 * handler's shebang + 0755 are applied by buildOne via `executable: true`).
 *
 * @param {{targetDir: string, label: string, manifestDirs: string[], rootVar: string, dialectId: string, readme: string}} opts
 * @param {{ version: string, name?: string }} rootPkg — root package.json, used for plugin version.
 */
async function assemblePlugin(opts, rootPkg) {
  const { targetDir, label, manifestDirs, rootVar, dialectId, readme } = opts;

  // Subdirs required by CC plugins-reference. The manifestDirs list
  // controls which discovery manifest(s) this distribution ships to —
  // claude-code emits only .claude-plugin; codeagent3 emits only
  // .cac-plugin. hooks/, bin/, commands/, skills/ are common to all.
  const subdirs = [...manifestDirs, 'hooks', 'bin', 'commands', 'skills'];
  for (const d of subdirs) {
    await mkdir(join(targetDir, d), { recursive: true });
  }

    // 1. {manifestDir}/plugin.json — the manifest the host auto-discovers.
  //    Identical content across all manifest dirs within a distribution
  //    (the canonical dir ships the same bytes to both .claude-plugin
  //    and .cac-plugin so one install loads under both runtimes).
  const pluginJson = {
    name: 'aet',
    description: AET_TAGLINE,
    version: rootPkg.version,
  };
  for (const manifestDir of manifestDirs) {
    await writeFile(
      join(targetDir, manifestDir, 'plugin.json'),
      JSON.stringify(pluginJson, null, 2) + '\n',
      'utf8',
    );
    console.log(`[aet:build] ${label.padEnd(12)} → ${join(targetDir, `${manifestDir}/plugin.json`)} (gen)`);

    // 1b. {manifestDir}/marketplace.json — a per-plugin marketplace catalog,
    //     GENERATED HERE (not a hardcoded root template) so each coding-agent
    //     plugin is self-describing: `claude plugin marketplace add <targetDir>`
    //     reads `<targetDir>/.claude-plugin/marketplace.json`, and the plugin's
    //     `source: "./"` resolves to the plugin tree itself (which ships the
    //     same manifestDir/plugin.json above). Each host's dist plugin carries
    //     its OWN marketplace.json, so the catalog filename never collides
    //     across hosts (omp ships dist/plugins/omp/.claude-plugin/marketplace.json
    //     alongside this one). Format is Claude Code's marketplace schema —
    //     omp's marketplace reuses the same format/location per its docs.
    const marketplaceJson = {
      name: 'aet',
      owner: { name: 'Agentic Engineering Team' },
      plugins: [
        {
          name: 'aet',
          source: './',
          description: AET_TAGLINE,
        },
      ],
    };
    await writeFile(
      join(targetDir, manifestDir, 'marketplace.json'),
      JSON.stringify(marketplaceJson, null, 2) + '\n',
      'utf8',
    );
    console.log(`[aet:build] ${label.padEnd(12)} → ${join(targetDir, `${manifestDir}/marketplace.json`)} (gen)`);
  }

  // 2. hooks/hooks.json — references handler via ${rootVar}, so no
  //    hardcoded node_modules path. The host substitutes the variable
  //    at hook fire time. The command is prefixed with `node ` rather
  //    than relying on the shebang + executable bit: the +x on
  //    bin/aet_handler.js may be stripped when the plugin is copied
  //    into the host's plugin dir, which would make a bare-command
  //    form fail with "Permission denied". `node <path>` runs the
  //    bundle regardless of file mode.
  //    Four hooks registered, keyed by the HOST's event names (resolved
  //    from the dialect in hosts.json — identity for all currently-registered
  //    dialects: claude, codex, and codeagent are aligned 1:1).
  //    The event KEY in hooks.json is the name the runtime sends on stdin
  //    as hook_event_name; the handler normalizes it back to canonical via
  //    dialect.fromHostEvent() before dispatch. Mismatching the key to the
  //    host's namespace means the hook never fires.
  //      - SessionStart (matcher="")     → boot mode: auto-run
  //        `aet plugin init --agent <baked-id>` (the agent id is baked per-
  //        distribution via esbuild define at build time: `claude-code` for
  //        the CC dist, `codeagent3` for the .cac dist) to generate slash
  //        command files for all configured workflows (baseline + custom).
  //      - UserPromptSubmit (matcher="") → active mode: capture /aet-*
  //        slash commands and run command-init.
  //      - PreToolUse (matcher="Bash")   → passive mode pre: rewrite
  //        `aet workflow ...` commands to append `--output json`.
  //      - PostToolUse (matcher="Bash")  → passive mode post: parse JSON
  //        stdout and inject `result.prompt` as additionalContext.
  //    All four point at the same handler script; it dispatches internally
  //    on `hookEventName`. The variable name differs by distribution
  //    (CLAUDE_PLUGIN_ROOT for claude-code, CODEAGENT3_PLUGIN_ROOT for
  //    codeagent3) — the host runtime must substitute the matching var.
  const HANDLER_CMD = `node \${${rootVar}}/bin/aet_handler.js`;
  const hooksJson = {
    description: 'AET workflow hooks (SessionStart auto-init + active UserPromptSubmit + passive PreToolUse/PostToolUse)',
    hooks: {
      [toHostEvent(dialectId, 'SessionStart')]: [
        {
          matcher: '',
          hooks: [{ type: 'command', command: HANDLER_CMD, timeout: 30 }],
        },
      ],
      [toHostEvent(dialectId, 'UserPromptSubmit')]: [
        {
          matcher: '',
          hooks: [{ type: 'command', command: HANDLER_CMD, timeout: 30 }],
        },
      ],
      [toHostEvent(dialectId, 'PreToolUse')]: [
        {
          matcher: 'Bash',
          hooks: [{ type: 'command', command: HANDLER_CMD, timeout: 30 }],
        },
      ],
      [toHostEvent(dialectId, 'PostToolUse')]: [
        {
          matcher: 'Bash',
          hooks: [{ type: 'command', command: HANDLER_CMD, timeout: 30 }],
        },
      ],
      [toHostEvent(dialectId, 'Stop')]: [
        {
          matcher: '',
          hooks: [{ type: 'command', command: HANDLER_CMD, timeout: 30 }],
        },
      ],
    },
  };
  await writeFile(
    join(targetDir, 'hooks', 'hooks.json'),
    JSON.stringify(hooksJson, null, 2) + '\n',
    'utf8',
  );
  console.log(`[aet:build] ${label.padEnd(12)} → ${join(targetDir, 'hooks/hooks.json')} (gen)`);

  // 3. bin/ — built in-place by the per-distribution buildOne() call in
  //    main()'s CC_DISTRIBUTIONS loop. esbuild writes aet_handler.js +
  //    .map directly into <targetDir>/bin/, and buildOne's
  //    `executable: true` applies the shebang + 0755. bin/package.json
  //    (type:commonjs override) is also written by buildOne. So nothing
  //    to copy here — this step is a layout-parity log line only (the
  //    bin/ dir was already mkdir'd in the subdirs loop above).
  console.log(`[aet:build] ${label.padEnd(12)} → ${join(targetDir, 'bin/')} (in-place from build step)`);

  // 4. commands/ — static slash command files shipped from src/commands/
  //    (e.g. init.md). cp() recursively so additions under src/commands/
  //    flow through automatically.
  const commandsDest = join(targetDir, 'commands');
  await copyCommandsWithVersion(commandsDest, rootPkg.version, label);

  // 5. skills/ — recursive copy of all AET skill subdirectories from the
  //    repo's top-level `skills/` dir. Each subdirectory contains a
  //    SKILL.md (required by CC) plus optional references/ / scripts/ /
  //    assets/ that CC auto-discovers per the plugins-reference layout.
  //    CC does NOT require skills to be listed in plugin.json — the
  //    directory convention alone is the contract. With ~40 skills this
  //    is the largest single artifact in the assembled plugin; copySkills
  //    (filtering tests/.DS_Store) is the simplest correct implementation
  //    and lets new skills added under `skills/<name>/` flow through
  //    automatically without touching this script.
  const skillsDest = join(targetDir, 'skills');
  await copySkills(SKILLS_SRC, skillsDest);
  const skillCount = (await readdir(skillsDest, { withFileTypes: true }))
    .filter((e) => e.isDirectory()).length;
  console.log(`[aet:build] ${label.padEnd(12)} → ${skillsDest} (copy, recursive, ${skillCount} skills)`);

  // 5b. aet-install skill resources — stamp cli/, scripts/, runtime/ into
  //    skills/aet-install/ AFTER the SKILLS_SRC copy above (so it is not
  //    clobbered). This is the single self-contained install carrier.
  await assembleCliSelfInstall(targetDir, rootPkg, label);

  // 6. README.md — install instructions tailored to this distribution.
  await writeFile(join(targetDir, 'README.md'), readme, 'utf8');
  console.log(`[aet:build] ${label.padEnd(12)} → ${join(targetDir, 'README.md')} (gen)`);
}

/**
 * Assemble the Codex marketplace distribution at `targetDir`.
 *
 * Codex does NOT auto-discover a plugin dir — plugins install through a
 * marketplace registered with `codex plugin marketplace add <dir>`, whose
 * manifest is `marketplace.json` at the root. The plugin itself is
 * SELF-CONTAINED under `plugins/aet/`: Codex resolves `plugin.json`'s
 * relative fields (`skills`) against the PLUGIN root, and the default hooks
 * config file is `<pluginRoot>/hooks/hooks.json`. So — unlike the
 * claude/codeagent shared-tree layout — hooks/bin/skills all live INSIDE
 * `plugins/aet/`, alongside the handler bundle already built there by the
 * caller (buildOne → plugins/aet/bin/).
 *
 * Per the Codex hooks spec (verified via ctx7): hook event names stay
 * CamelCase (PreToolUse/PostToolUse — the codex dialect maps them 1:1), the
 * Bash matcher is a REGEX (`^Bash$`), and plugin hooks run with `PLUGIN_ROOT`
 * injected, so the command is `node ${PLUGIN_ROOT}/bin/aet_handler.js` (node
 * prefix — the +x bit on bin/aet_handler.js may be stripped on install).
 *
 * @param {{targetDir: string, label: string, rootVar: string, commandsDir: string, agentId: string, installPath: string}} dist
 * @param {{ version: string, name?: string }} rootPkg
 * @param {string} readme — prebuilt README content (buildPluginReadme kind='codex').
 */
async function assembleCodexMarketplace(dist, rootPkg, readme) {
  const { targetDir, label } = dist;
  const pluginDir = join(targetDir, 'plugins', 'aet');

  // Plugin-relative dirs (Codex resolves skills/hooks against the plugin root).
  await mkdir(join(pluginDir, 'hooks'), { recursive: true });
  await mkdir(join(pluginDir, 'skills'), { recursive: true });

  // marketplace.json — GENERATED HERE (per-plugin self-describing catalog),
  // no longer copied from a root `.codex-plugin/` template. Consumed by
  // `codex plugin marketplace add <targetDir>`. Codex's marketplace schema
  // differs from Claude Code/omp (source is an object, not a bare path) so
  // this catalog is codex-specific — each coding-agent plugin carries its
  // own marketplace.json in its own dist tree, no cross-host filename clash.
  const marketplaceJson = {
    name: 'aet',
    interface: { displayName: 'AET' },
    plugins: [
      {
        name: 'aet',
        source: { source: 'local', path: './plugins/aet' },
        policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
        category: 'Productivity',
      },
    ],
    description: 'Agentic Engineering Team (AET) — workflow-driven coding agent plugin for Codex. Stateful Core tracks step state in <projectRoot>/.aet/core-checkpoint/; the CLI (aet workflow init / handover) is agent-agnostic. Plugin provides 4 hooks (SessionStart auto-init, UserPromptSubmit active-mode, Pre/PostToolUse passive-mode JSON rewrite + prompt injection) and ~43 skills. Install: `codex plugin marketplace add <this-dir>` then `codex plugin install aet`.',
  };
  await writeFile(
    join(targetDir, 'marketplace.json'),
    JSON.stringify(marketplaceJson, null, 2) + '\n',
    'utf8',
  );
  console.log(`[aet:build] ${label.padEnd(12)} → ${join(targetDir, 'marketplace.json')} (gen)`);

  // plugins/aet/plugin.json — Codex RawPluginManifest shape. `hooks` is
  // OMITTED so Codex defaults to <pluginRoot>/hooks/hooks.json
  // (DEFAULT_HOOKS_CONFIG_FILE). `skills` points at the plugin-relative dir.
  const pluginJson = {
    name: 'aet',
    version: rootPkg.version,
    description: AET_TAGLINE,
    skills: './skills',
  };
  await writeFile(
    join(pluginDir, 'plugin.json'),
    JSON.stringify(pluginJson, null, 2) + '\n',
    'utf8',
  );
  console.log(`[aet:build] ${label.padEnd(12)} → ${join(pluginDir, 'plugin.json')} (gen)`);

  // plugins/aet/hooks/hooks.json — four hooks, regex Bash matcher, and the
  // handler referenced via ${PLUGIN_ROOT} (Codex injects PLUGIN_ROOT — plus
  // CLAUDE_* compat vars — into plugin-hook subprocesses). `node ` prefix —
  // the +x bit on bin/aet_handler.js may be stripped on install. Event keys are
  // the host's names via the dialect (codex is identity → PreToolUse etc.).
  const HANDLER_CMD = 'node ${PLUGIN_ROOT}/bin/aet_handler.js';
  const hooksJson = {
    description: 'AET workflow hooks (SessionStart auto-init + active UserPromptSubmit + passive PreToolUse/PostToolUse)',
    hooks: {
      [toHostEvent(dist.dialectId, 'SessionStart')]: [
        { matcher: '', hooks: [{ type: 'command', command: HANDLER_CMD, timeout: 30 }] },
      ],
      [toHostEvent(dist.dialectId, 'UserPromptSubmit')]: [
        { matcher: '', hooks: [{ type: 'command', command: HANDLER_CMD, timeout: 30 }] },
      ],
      [toHostEvent(dist.dialectId, 'PreToolUse')]: [
        { matcher: '^Bash$', hooks: [{ type: 'command', command: HANDLER_CMD, timeout: 30 }] },
      ],
      [toHostEvent(dist.dialectId, 'PostToolUse')]: [
        { matcher: '^Bash$', hooks: [{ type: 'command', command: HANDLER_CMD, timeout: 30 }] },
      ],
      [toHostEvent(dist.dialectId, 'Stop')]: [
        { matcher: '', hooks: [{ type: 'command', command: HANDLER_CMD, timeout: 30 }] },
      ],
    },
  };
  await writeFile(
    join(pluginDir, 'hooks', 'hooks.json'),
    JSON.stringify(hooksJson, null, 2) + '\n',
    'utf8',
  );
  console.log(`[aet:build] ${label.padEnd(12)} → ${join(pluginDir, 'hooks/hooks.json')} (gen)`);

  // bin/ — built in place by the caller's buildOne (plugins/aet/bin/). Log
  // for parity with assemblePlugin.
  console.log(`[aet:build] ${label.padEnd(12)} → ${join(pluginDir, 'bin/')} (in-place from build step)`);

  // skills/ — plugin-relative copy (plugin.json `skills: "./skills"`).
  await copySkills(SKILLS_SRC, join(pluginDir, 'skills'));
  const skillCount = (await readdir(join(pluginDir, 'skills'), { withFileTypes: true }))
    .filter((e) => e.isDirectory()).length;
  console.log(`[aet:build] ${label.padEnd(12)} → ${join(pluginDir, 'skills')} (copy, recursive, ${skillCount} skills)`);

  // aet-install skill resources — stamp cli/, scripts/, runtime/ into
  // skills/aet-install/ AFTER the SKILLS_SRC copy above. Single install carrier.
  await assembleCliSelfInstall(pluginDir, rootPkg, label);

  // README.md — codex install instructions (marketplace add + plugin install).
  await writeFile(join(targetDir, 'README.md'), readme, 'utf8');
  console.log(`[aet:build] ${label.padEnd(12)} → ${join(targetDir, 'README.md')} (gen)`);
}

/**
 * README for the self-contained OpenCode plugin package — src/README.md
 * verbatim, coding-agent name adapted to OpenCode.
 *
 * @returns {string} README.md content
 */
function buildOpencodeReadme() {
  return buildHostReadme('OpenCode');
}

/**
 * Assemble the self-contained OpenCode plugin package at OPENCODE_TARGET_DIR.
 *
 * OpenCode loads a plugin from a directory whose \`package.json\` \`main\` field
 * points at a plugin module (superpowers convention). This emits:
 *   - \`bin/aet_handler.js\` — ESM plugin entry built from OPENCODE_ENTRY
 *   - \`package.json\`       — \`{ main: "bin/aet_handler.js", ... }\` so OpenCode
 *                             resolves the plugin entry
 *   - \`skills/\`            — recursive copy of all AET skills (the plugin's
 *                             \`config\` hook registers this dir via
 *                             \`config.skills.paths\`)
 *   - \`commands/\`          — copy of src/commands/ (the \`config\` hook registers
 *                             each file as a \`config.command\` template)
 *   - \`README.md\`          — install instructions
 *
 * The plugin resolves \`skills/\` / \`commands/\` RELATIVE to its own bundled file
 * (\`import.meta.url\` → bin/aet_handler.js → ../skills), so the package is
 * location-independent — no hardcoded machine paths.
 *
 * @param {{ version: string, name?: string }} rootPkg — root package.json (version).
 */
async function assembleOpencodePlugin(rootPkg) {
  const targetDir = OPENCODE_TARGET_DIR;
  const binDir = join(targetDir, 'bin');

  // 1. Plugin entry bundle (ESM). buildOne also writes bin/package.json
  //    ({type:'module'}) and runs the zero-dependency invariant check.
  await buildOne({
    hostId: 'opencode',
    entryFile: OPENCODE_ENTRY,
    outputDir: binDir,
    outputFile: 'aet_handler.js',
    format: 'esm',
  });

  // 2. Root package.json — OpenCode resolves the plugin entry via `main`.
  const pkgJson = {
    name: '@aet/opencode',
    version: rootPkg.version,
    description: 'AET workflow orchestration for OpenCode (skills + workflow command interception + aet Bash rewriting).',
    type: 'module',
    main: 'bin/aet_handler.js',
    keywords: ['opencode', 'plugin', 'skills', 'workflow'],
  };
  await writeFile(join(targetDir, 'package.json'), JSON.stringify(pkgJson, null, 2) + '\n', 'utf8');
  console.log(`[aet:build] ${'opencode'.padEnd(12)} → ${join(targetDir, 'package.json')} (gen)`);

  // 3. skills/ — recursive copy (the config hook registers it via skills.paths).
  const skillsDest = join(targetDir, 'skills');
  await copySkills(SKILLS_SRC, skillsDest);
  const skillCount = (await readdir(skillsDest, { withFileTypes: true }))
    .filter((e) => e.isDirectory()).length;
  console.log(`[aet:build] ${'opencode'.padEnd(12)} → ${skillsDest} (copy, recursive, ${skillCount} skills)`);

  // 4. commands/ — copy of src/commands/ (the config hook registers each as a
  //    config.command template).
  const commandsDest = join(targetDir, 'commands');
  await copyCommandsWithVersion(commandsDest, rootPkg.version, 'opencode');

  // 5. README.md — install instructions.
  await writeFile(join(targetDir, 'README.md'), buildOpencodeReadme(), 'utf8');
  console.log(`[aet:build] ${'opencode'.padEnd(12)} → ${join(targetDir, 'README.md')} (gen)`);

  // 6. Bundled CLI self-install — cli/ package + scripts/install.cjs.
  await assembleCliSelfInstall(targetDir, rootPkg, 'opencode');
}

/**
 * README for the self-contained omp (Oh My Pi) extension package —
 * src/README.md verbatim, coding-agent name adapted to omp.
 *
 * @returns {string} README.md content
 */
function buildOmpReadme() {
  return buildHostReadme('omp (Oh My Pi)');
}

/**
 * Assemble the self-contained omp (Oh My Pi) extension package at OMP_TARGET_DIR.
 *
 * omp loads an extension from a directory whose \`package.json\` declares an
 * \`omp.extensions\` array of factory module paths (the omp extension-authoring
 * contract — NOT OpenCode's \`main\` field). This emits:
 *   - \`bin/aet_handler.js\` — ESM hook factory built from OMP_ENTRY
 *   - \`package.json\`       — \`{ omp: { extensions: ["./bin/aet_handler.js"] } }\`
 *                             plus name/version/description so omp discovers + loads it
 *   - \`skills/\`            — recursive copy of all AET skills (omp auto-discovers)
 *   - \`commands/\`          — copy of src/commands/ (omp auto-discovers; the AET
 *                             \`/aet-*\` commands are generated project-side by
 *                             \`aet plugin init --agent omp\`)
 *   - \`README.md\`          — install instructions
 *
 * Mirrors assembleOpencodePlugin() structurally; the only difference is the
 * manifest field (\`omp.extensions\` vs \`main\`) because omp and OpenCode use
 * different plugin-discovery contracts despite their architecturally-similar
 * in-process hook models.
 *
 * @param {{ version: string, name?: string }} rootPkg — root package.json (version).
 */
async function assembleOmpPlugin(rootPkg) {
  const targetDir = OMP_TARGET_DIR;
  const binDir = join(targetDir, 'bin');

  // 1. Hook factory bundle (ESM). buildOne also writes bin/package.json
  //    ({type:'module'}) and runs the zero-dependency invariant check.
  await buildOne({
    hostId: 'omp',
    entryFile: OMP_ENTRY,
    outputDir: binDir,
    outputFile: 'aet_handler.js',
    format: 'esm',
  });

  // 2. Root package.json — omp resolves the hook factory via `omp.extensions`.
  //    This is the key difference from OpenCode (which uses `main`): omp's
  //    extension-authoring contract declares an array of factory module paths.
  const pkgJson = {
    name: '@aet/omp',
    version: rootPkg.version,
    description: 'AET workflow orchestration for omp / Oh My Pi (aet Bash rewriting + workflow result injection via HookAPI tool_call/tool_result hooks).',
    type: 'module',
    omp: { extensions: ['./bin/aet_handler.js'] },
    keywords: ['omp', 'oh-my-pi', 'extension', 'hooks', 'skills', 'workflow'],
  };
  await writeFile(join(targetDir, 'package.json'), JSON.stringify(pkgJson, null, 2) + '\n', 'utf8');
  console.log(`[aet:build] ${'omp'.padEnd(12)} → ${join(targetDir, 'package.json')} (gen)`);

  // 2b. .claude-plugin/marketplace.json — omp's marketplace reuses the Claude
  //     Code catalog format + location (per omp docs: catalog must be at
  //     `.claude-plugin/marketplace.json`, "compatible with the Claude Code
  //     plugin registry format"). GENERATED HERE so each coding-agent plugin
  //     carries its own catalog (no shared root template — the omp plugin
  //     ships dist/plugins/omp/.claude-plugin/marketplace.json, distinct from
  //     claude-code's own). Install: `omp marketplace add <targetDir>` then
  //     `omp install aet@aet`. `source: "./"` resolves to the omp plugin tree
  //     itself (package.json `omp.extensions` → bin/aet_handler.js + skills/).
  const ompMarketplaceDir = join(targetDir, '.claude-plugin');
  await mkdir(ompMarketplaceDir, { recursive: true });
  const ompMarketplaceJson = {
    name: 'aet',
    owner: { name: 'Agentic Engineering Team' },
    plugins: [
      {
        name: 'aet',
        source: './',
        description: AET_TAGLINE,
      },
    ],
  };
  await writeFile(
    join(ompMarketplaceDir, 'marketplace.json'),
    JSON.stringify(ompMarketplaceJson, null, 2) + '\n',
    'utf8',
  );
  console.log(`[aet:build] ${'omp'.padEnd(12)} → ${join(ompMarketplaceDir, 'marketplace.json')} (gen)`);

  // 3. skills/ — recursive copy (omp auto-discovers by directory convention).
  const skillsDest = join(targetDir, 'skills');
  await copySkills(SKILLS_SRC, skillsDest);
  const skillCount = (await readdir(skillsDest, { withFileTypes: true }))
    .filter((e) => e.isDirectory()).length;
  console.log(`[aet:build] ${'omp'.padEnd(12)} → ${skillsDest} (copy, recursive, ${skillCount} skills)`);

  // 4. commands/ — copy of src/commands/ (omp auto-discovers). The AET
  //    `/aet-<id>` slash commands are generated project-side by
  //    `aet plugin init --agent omp`; these shipped templates are the static
  //    ones (e.g. init.md).
  const commandsDest = join(targetDir, 'commands');
  await copyCommandsWithVersion(commandsDest, rootPkg.version, 'omp');

  // 5. README.md — install instructions.
  await writeFile(join(targetDir, 'README.md'), buildOmpReadme(), 'utf8');
  console.log(`[aet:build] ${'omp'.padEnd(12)} → ${join(targetDir, 'README.md')} (gen)`);

  // 6. Bundled CLI self-install — cli/ package + scripts/install.cjs.
  await assembleCliSelfInstall(targetDir, rootPkg, 'omp');
}

async function main() {
  console.log('[aet:build] cleaning dist/');
  await rm('dist', { recursive: true, force: true });
  await mkdir('dist', { recursive: true });

  const rootPkg = JSON.parse(await readFile('package.json', 'utf8'));

  // Always build the CLI bundle. The version is baked into the bundle via
  // esbuild `define` so `aet --version` stays in lockstep with the root
  // package.json (single source of truth; no hardcoded banner to drift).
  await buildOne(CLI_MANIFEST, {
    __AET_VERSION__: JSON.stringify(rootPkg.version),
  });

  // Assemble the self-contained OpenCode plugin package (bin/aet_handler.js +
  // package.json main → skills/ + commands/ + README).
  if (fileExists(OPENCODE_ENTRY)) {
    await assembleOpencodePlugin(rootPkg);
  } else {
    console.log(`[aet:build] opencode    → skip (entry ${OPENCODE_ENTRY} does not exist)`);
  }

  // Assemble the self-contained omp (Oh My Pi) extension package
  // (bin/aet_handler.js + package.json omp.extensions → skills/ + commands/
  // + README). omp's in-process hook model is a sibling of OpenCode, so it
  // gets its own assemble function; the manifest field differs
  // (omp.extensions vs main) per omp's extension-authoring contract.
  if (fileExists(OMP_ENTRY)) {
    await assembleOmpPlugin(rootPkg);
  } else {
    console.log(`[aet:build] omp         → skip (entry ${OMP_ENTRY} does not exist)`);
  }

  // Build + assemble each CC-compatible distribution. Per row: (1) build a
  // distribution-specific handler bundle with the agent id baked in via
  // esbuild `define` (so SessionStart writes slash commands into the
  // matching host's commands dir), (2) assemblePlugin emits manifest + hooks
  // + skills + README around the just-built bin/. Skips silently if the
  // shared CC handler entry file is missing (e.g. repo in a not-yet-
  // implemented state). Adding a new CC-compatible runtime = appending one
  // row to CC_DISTRIBUTIONS above; no other change needed here.
  if (fileExists(CC_HANDLER_ENTRY)) {
    for (const dist of CC_DISTRIBUTIONS) {
      // 1. Build this distribution's handler bundle with the agent id
      //    baked in via esbuild `define`. Output lands directly in
      //    <targetDir>/bin/ (shebang + 0755 + package.json type:commonjs
      //    applied by buildOne). JSON.stringify wraps the id in double
      //    quotes so esbuild substitutes it as a string literal.
      //    For codex the handler must live INSIDE the plugin dir
      //    (plugins/aet/bin/) because the marketplace tree is self-contained
      //    per plugin — the hook command references ${PLUGIN_ROOT}/bin/...
      //    relative to the plugin root.
      const binDir = dist.kind === 'codex'
        ? join(dist.targetDir, 'plugins', 'aet', 'bin')
        : join(dist.targetDir, 'bin');
      await buildOne(
        {
          hostId: dist.label,
          entryFile: CC_HANDLER_ENTRY,
          outputDir: binDir,
          outputFile: 'aet_handler.js',
          format: 'cjs',
          executable: true,
        },
        {
          __AET_AGENT_ID__: JSON.stringify(dist.agentId),
          __AET_COMMANDS_DIR__: JSON.stringify(dist.commandsDir),
          __AET_DIALECT_ID__: JSON.stringify(dist.dialectId),
        },
      );

      // 2. Assemble the distribution layout around the just-built bin/.
      //    claude / codeagent3 → shared-tree plugin (assemblePlugin);
      //    codex → marketplace tree with the plugin self-contained under
      //    plugins/aet/ (assembleCodexMarketplace).
      const readme = buildPluginReadme({ label: dist.label });
      if (dist.kind === 'codex') {
        await assembleCodexMarketplace(dist, rootPkg, readme);
      } else {
        await assemblePlugin(
          {
            targetDir: dist.targetDir,
            label: dist.label,
            manifestDirs: dist.manifestDirs,
            rootVar: dist.rootVar,
            dialectId: dist.dialectId,
            readme,
          },
          rootPkg,
        );
      }
    }
  } else {
    console.log(`[aet:build] CC handler  → skip (entry ${CC_HANDLER_ENTRY} does not exist)`);
  }

  // Copy static artifacts.
  for (const a of STATIC_ARTIFACTS) {
    if (!fileExists(a.src)) {
      console.log(`[aet:build] ${a.src.padEnd(40)} → skip (does not exist)`);
      continue;
    }
    await copyStatic(a.src, a.dest);
  }

  // Merge AET-plugin extensions (src/plugins/<name>/{skills,commands,runtime})
  // into every coding-agent host dist. Runs LAST so it overlays on top of the
  // base copies (global skills/ src/commands/ src/config/) — extensions win.
  await mergeAetPluginExtensions();

  console.log('[aet:build] all bundles built successfully.');
}

main().catch((err) => {
  console.error('[aet:build] FAILED:', err);
  process.exit(1);
});

