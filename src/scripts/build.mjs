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
 * Build a target-specific README for an assembled plugin dir
 * (claude-code / codeagent3). The README adapts the manifest dir list,
 * install path, ${ROOT_VAR} name, baked agent id, and commands dir to the
 * target distribution so users get accurate copy/paste instructions.
 *
 * @param {{targetDir: string, label: string, manifestDirs: string[], rootVar: string, commandsDir: string, agentId: string, installPath: string}} opts
 * @returns {string} README.md content
 */
function buildPluginReadme({ targetDir, label, manifestDirs, rootVar, commandsDir, agentId, installPath, kind = 'claude' }) {
  if (kind === 'codex') {
    // Codex installs via marketplace registration, not directory copy.
    return `# AET Codex plugin (marketplace)

Self-contained Codex marketplace assembled at \`${targetDir}/\`. Install:

\`\`\`bash
codex plugin marketplace add ./${targetDir}
codex plugin install aet
\`\`\`

The marketplace root ships \`marketplace.json\`; the plugin lives at
\`plugins/aet/\` (\`plugin.json\` with \`skills\` + \`hooks\` fields, \`hooks/hooks.json\`,
bundled \`bin/aet_handler.js\`, and \`skills/\`).

## Layout

- \`marketplace.json\` — market root; \`codex plugin marketplace add\` consumes it.
- \`plugins/aet/plugin.json\` — Codex plugin manifest (\`skills: "./skills"\`,
  \`hooks: default\` → \`hooks/hooks.json\`).
- \`hooks/hooks.json\` — registers four hooks, all pointing at the bundled
  handler via \`\${PLUGIN_ROOT}/bin/aet_handler.js\` (Codex injects
  \`PLUGIN_ROOT\` into plugin-hook subprocesses; it also injects CLAUDE_*
  variants for compatibility):
  - **SessionStart** → BOOT MODE. Auto-runs \`aet plugin init --agent ${agentId}\`.
  - **UserPromptSubmit** → ACTIVE MODE: catch \`/aet-<id>\` slash commands.
  - **PreToolUse**/**PostToolUse** → PASSIVE MODE pre/post (Codex's hook
    names match Claude 1:1, so the claude-identity \`codex\` dialect needs
    no overrides).
- \`bin/aet_handler.js\` — Node CJS handler; Codex hook names match Claude
  (verified via ctx7), so the claude-identity \`codex\` dialect needs no overrides.
- \`skills/<name>/SKILL.md\` — ~40 AET skills.

## Updating

Rebuild (\`npm run build\`) and re-run \`codex plugin marketplace add\`. Version
tracks the root \`@aet/workflow-core\` package version.

`;
  }

  const manifestLines = manifestDirs
    .map((d) => {
      if (d === '.claude-plugin') {
        return [
          `- \`.claude-plugin/plugin.json\` — CC native manifest (auto-discovered by Claude Code).`,
          `- \`.claude-plugin/marketplace.json\` — per-plugin marketplace catalog (generated at build time; \`claude plugin marketplace add ./${targetDir}\` reads it to install the \`aet\` plugin).`,
        ].join('\n');
      }
      if (d === '.cac-plugin') {
        return `- \`.cac-plugin/plugin.json\` — manifest for the \`${label}\` runtime (auto-discovered).`;
      }
      return `- \`.${d}/plugin.json\` — manifest.`;
    })
    .join('\n');

  // Marketplace install command name per host (both are claude-family runtimes
  // that share the claude plugin marketplace syntax, but the binary name
  // differs: `claude` for claude-code, `codeagent` for codeagent3 — matching
  // install.sh's CLI detection). The per-plugin catalog is at
  // {manifestDir}/marketplace.json, generated at build time.
  const cliCmd = agentId === 'codeagent3' ? 'codeagent' : 'claude';

  return `# AET ${label} plugin

Self-contained plugin assembled at \`${targetDir}/\`. Install via marketplace
(the plugin tree ships its own \`${manifestDirs[0]}/marketplace.json\` catalog,
generated at build time — one catalog per plugin, no shared root template):

\`\`\`bash
${cliCmd} plugin marketplace add ./${targetDir}
${cliCmd} plugin install aet@aet
\`\`\`

Or copy the plugin dir directly:

\`\`\`bash
cp -r ${targetDir} ${installPath}
\`\`\`

Restart the host runtime (or run \`/plugin reload\` if supported). Verify with
\`/design\` — the UserPromptSubmit hook fires, runs \`aet workflow
command-init --name design --output json\` (one-shot init + enter
step 1), and injects the AET orientation banner + step-1 task prompt
as additionalContext for the agent to execute.

## Layout

${manifestLines}
- \`hooks/hooks.json\` — registers four hooks, all pointing at the same
  handler script (it dispatches internally on \`hookEventName\`):
  - **SessionStart** (matcher \`""\`) → BOOT MODE. Auto-runs \`aet plugin
    init --agent ${agentId}\` to generate slash command files for every
    workflow in the merged config (baseline + custom) into the project's
    \`${commandsDir}/\`. Idempotent; output suppressed on success.
  - **UserPromptSubmit** (matcher \`""\`) → ACTIVE MODE. Catches any
    \`/aet-<id>\` slash command and runs \`aet workflow command-init
    --name <id> --output json\` in one shot (init + enter step 1).
  - **PreToolUse** (matcher \`Bash\`) → PASSIVE MODE pre. Rewrites any
    \`aet workflow ...\` Bash command to append \`--output json\`.
  - **PostToolUse** (matcher \`Bash\`) → PASSIVE MODE post. Parses the
    JSON stdout, injects \`result.prompt\` as additionalContext for the
    next turn (agent doesn't see raw JSON stdout).
- \`bin/aet_handler.js\` — Node CJS handler, executable (shebang + 0755).
  Dispatches on \`hookEventName\`. Referenced from \`hooks/hooks.json\` as
  \`\${${rootVar}}/bin/aet_handler.js\` — the host substitutes the
  installed plugin root at hook fire time.
- \`commands/\` — NOT shipped. All slash command files are generated at
  runtime by the SessionStart hook into the project's \`${commandsDir}/\`
  (one \`aet-<id>.md\` per workflow in the merged config).
- \`skills/<name>/SKILL.md\` — ~40 AET skills (requirement analysis,
  design, implementation, bugfix, CVE handling, doc generation, code
  review, etc.). The host auto-discovers each subdirectory; agents invoke
  via \`/skill-name\` or autonomously per the trigger description in each
  SKILL.md frontmatter.

## Capabilities

Per AGENTS.md "Plugin 三钩子" + "已知 stale 代码" — dual-channel design
(Core b3):

| AET event              | behavior                                                   |
|------------------------|------------------------------------------------------------|
| \`prompt.inject\`        | supported — injected as additionalContext                   |
| \`prompt.inject_system\` | degraded — surfaces as \`[AET system note] ...\`             |
| \`context.clear\`        | degraded — surfaces as a text hint (rarely emitted under b3)|
| \`omit_prompt\`          | degraded — emit \`{}\`, let raw stdout pass (no native suppress) |
| \`interrupt_execution\` | degraded — surfaces as an additionalContext warning (no native halt) |
| \`error\`                | always visible (R9)                                        |

Lifecycle metadata from \`CommandResult.data\` (workflow_started /
step_advanced / workflow_complete / intervention_required) is surfaced as
a brief status banner prepended to additionalContext.

## Updating

Rebuild the workflow-core package (\`npm run build\` in this repo) and
re-copy the directory. The plugin version in \`plugin.json\` tracks the
root \`@aet/workflow-core\` package version.

`;
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
    description: 'AET workflow orchestration for Claude Code (feature / design / implement / bugfix).',
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
          description: `AET workflow orchestration for ${label} (feature / design / implement / bugfix).`,
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
  //    at hook fire time. Bare-command form relies on shebang + chmod
  //    applied to bin/aet_handler.js below (either by the build step
  //    for the canonical dir, or by chmod 0755 in the copy step for
  //    mirrors).
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
  const HANDLER_CMD = `\${${rootVar}}/bin/aet_handler.js`;
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
  //    (e.g. enable.md). cp() recursively so additions under src/commands/
  //    flow through automatically.
  const commandsDest = join(targetDir, 'commands');
  await mkdir(commandsDest, { recursive: true });
  if (fileExists(COMMANDS_SRC)) {
    await cp(COMMANDS_SRC, commandsDest, { recursive: true });
    const cmdFiles = (await readdir(commandsDest, { withFileTypes: true }))
      .filter((e) => e.isFile()).length;
    console.log(`[aet:build] ${label.padEnd(12)} → ${commandsDest} (copy, ${cmdFiles} files)`);
  } else {
    console.log(`[aet:build] ${label.padEnd(12)} → ${commandsDest} (empty, ${COMMANDS_SRC} not found)`);
  }

  // 5. skills/ — recursive copy of all AET skill subdirectories from the
  //    repo's top-level `skills/` dir. Each subdirectory contains a
  //    SKILL.md (required by CC) plus optional references/ / scripts/ /
  //    assets/ that CC auto-discovers per the plugins-reference layout.
  //    CC does NOT require skills to be listed in plugin.json — the
  //    directory convention alone is the contract. With ~40 skills this
  //    is the largest single artifact in the assembled plugin; cp() with
  //    `recursive: true` is by far the simplest correct implementation
  //    and lets new skills added under `skills/<name>/` flow through
  //    automatically without touching this script.
  const skillsDest = join(targetDir, 'skills');
  await mkdir(skillsDest, { recursive: true });
  await cp(SKILLS_SRC, skillsDest, { recursive: true });
  const skillCount = (await readdir(skillsDest, { withFileTypes: true }))
    .filter((e) => e.isDirectory()).length;
  console.log(`[aet:build] ${label.padEnd(12)} → ${skillsDest} (copy, recursive, ${skillCount} skills)`);

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
 * injected, so the command is `${PLUGIN_ROOT}/bin/aet_handler.js`.
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
    description: 'AET workflow orchestration for Codex (feature / design / implement / bugfix).',
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
  // CLAUDE_* compat vars — into plugin-hook subprocesses). Event keys are
  // the host's names via the dialect (codex is identity → PreToolUse etc.).
  const HANDLER_CMD = '${PLUGIN_ROOT}/bin/aet_handler.js';
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
  await cp(SKILLS_SRC, join(pluginDir, 'skills'), { recursive: true });
  const skillCount = (await readdir(join(pluginDir, 'skills'), { withFileTypes: true }))
    .filter((e) => e.isDirectory()).length;
  console.log(`[aet:build] ${label.padEnd(12)} → ${join(pluginDir, 'skills')} (copy, recursive, ${skillCount} skills)`);

  // README.md — codex install instructions (marketplace add + plugin install).
  await writeFile(join(targetDir, 'README.md'), readme, 'utf8');
  console.log(`[aet:build] ${label.padEnd(12)} → ${join(targetDir, 'README.md')} (gen)`);
}

/**
 * README for the self-contained OpenCode plugin package.
 *
 * @returns {string} README.md content
 */
function buildOpencodeReadme() {
  return `# AET OpenCode plugin

Self-contained OpenCode plugin package assembled at \`${OPENCODE_TARGET_DIR}/\`. Install:

\`\`\`bash
cp -r ${OPENCODE_TARGET_DIR} ~/.config/opencode/plugin/aet
\`\`\`

or point the \`plugin\` array in your \`opencode.json\` at this directory:

\`\`\`json
{ "plugin": ["/abs/path/to/${OPENCODE_TARGET_DIR}"] }
\`\`\`

Restart OpenCode. Verify with the \`skill\` tool (AET skills listed) and \`/enable\`.

## What ships

- \`package.json\` — \`main: bin/aet_handler.js\`; OpenCode resolves the plugin entry here.
- \`bin/aet_handler.js\` — ESM plugin entry. Registers, per the OpenCode Plugin API:
  - **\`config\`** → adds \`skills/\` to \`config.skills.paths\` and registers each
    \`commands/*.md\` as a \`config.command\` template. Paths are resolved RELATIVE
    to the plugin file (\`import.meta.url\`), so the package works from any
    install location — no hardcoded paths.
  - **\`command.execute.before\`** → ACTIVE MODE. Runs \`aet workflow command-init
    --name <cmd>\` for any registered command; non-workflow ids
    (UNKNOWN_WORKFLOW) pass through to OpenCode's native rendering.
  - **\`tool.execute.before\`** → PASSIVE MODE pre. Rewrites \`aet workflow ...\` to
    append \`--output json\`, and \`aet plugin init\` to append \`--agent opencode\`.
  - **\`tool.execute.after\`** → PASSIVE MODE post. Replaces an \`aet workflow\` Bash
    tool result with \`result.prompt\` (agent never sees raw JSON stdout).
- \`skills/<name>/SKILL.md\` — ~40 AET skills (requirement analysis, design,
  implementation, bugfix, CVE handling, doc generation, code review, etc.).
- \`commands/\` — markdown command templates registered into \`config.command\`.

## Capabilities

Dual-channel design (Core b3):

| AET event              | behavior                                                   |
|------------------------|------------------------------------------------------------|
| \`prompt.inject\`        | supported — appended as a text part                         |
| \`prompt.inject_system\` | degraded — surfaces as a text part (no system mutation)    |
| \`context.clear\`        | degraded — in-hook emits an instruction part               |
| \`omit_prompt\`          | degraded — leave the tool result untouched                 |
| \`interrupt_execution\`  | degraded — surfaces as an instruction part                 |
| \`error\`                | always visible (R9)                                        |

## Updating

Rebuild the workflow-core package (\`npm run build\`) and re-copy the
directory. The plugin version in \`package.json\` tracks the root package.

`;
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
  await mkdir(skillsDest, { recursive: true });
  await cp(SKILLS_SRC, skillsDest, { recursive: true });
  const skillCount = (await readdir(skillsDest, { withFileTypes: true }))
    .filter((e) => e.isDirectory()).length;
  console.log(`[aet:build] ${'opencode'.padEnd(12)} → ${skillsDest} (copy, recursive, ${skillCount} skills)`);

  // 4. commands/ — copy of src/commands/ (the config hook registers each as a
  //    config.command template).
  const commandsDest = join(targetDir, 'commands');
  await mkdir(commandsDest, { recursive: true });
  if (fileExists(COMMANDS_SRC)) {
    await cp(COMMANDS_SRC, commandsDest, { recursive: true });
    const cmdFiles = (await readdir(commandsDest, { withFileTypes: true }))
      .filter((e) => e.isFile()).length;
    console.log(`[aet:build] ${'opencode'.padEnd(12)} → ${commandsDest} (copy, ${cmdFiles} files)`);
  } else {
    console.log(`[aet:build] ${'opencode'.padEnd(12)} → ${commandsDest} (empty, ${COMMANDS_SRC} not found)`);
  }

  // 5. README.md — install instructions.
  await writeFile(join(targetDir, 'README.md'), buildOpencodeReadme(), 'utf8');
  console.log(`[aet:build] ${'opencode'.padEnd(12)} → ${join(targetDir, 'README.md')} (gen)`);
}

/**
 * README for the self-contained omp (Oh My Pi) extension package.
 *
 * @returns {string} README.md content
 */
function buildOmpReadme() {
  return `# AET omp (Oh My Pi) plugin

Self-contained omp (Oh My Pi) plugin package assembled at \`${OMP_TARGET_DIR}/\`. Install via omp's
marketplace (the package carries its own \`.claude-plugin/marketplace.json\` catalog — omp reuses
Claude Code's marketplace format/location per its docs):

\`\`\`bash
omp marketplace add ./${OMP_TARGET_DIR}
omp install aet@aet
\`\`\`

Restart omp and verify with a generated \`/aet-<id>\` slash command.

## What ships

- \`.claude-plugin/marketplace.json\` — per-plugin marketplace catalog (GENERATED at build time,
  not a shared root template). omp registers \`${OMP_TARGET_DIR}\` as the marketplace root and reads
  this catalog; \`source: "./"\` resolves to the plugin tree itself. Each coding-agent plugin
  (claude-code / omp / codex) ships its own catalog in its own dist tree, so the filename never
  collides across hosts.
- \`package.json\` — \`omp: { extensions: ["./bin/aet_handler.js"] }\`; omp resolves
  the hook factory here (NOT a \`main\` field — omp uses the \`omp.extensions\`
  manifest, per the omp extension-authoring contract).
- \`bin/aet_handler.js\` — ESM hook factory. Subscribes, per the omp HookAPI:
  - **\`tool_call\`** (PASSIVE pre). Rewrites \`aet workflow ...\` to append
    \`--output json\`, and \`aet plugin init\` to append \`--agent omp\`.
  - **\`tool_result\`** (PASSIVE post). Replaces an \`aet workflow\` bash tool
    result's content with \`result.prompt\` (agent never sees raw JSON stdout).
- \`skills/<name>/SKILL.md\` — ~40 AET skills (requirement analysis, design,
  implementation, bugfix, CVE handling, doc generation, code review, etc.).
  omp auto-discovers the \`skills/\` directory by convention.
- \`commands/\` — markdown slash-command templates omp auto-discovers. The
  AET \`/aet-<id>\` slash commands are generated project-side into
  \`.omp/commands/\` by \`aet plugin init --agent omp\` with \`hasPlugin:false\`,
  so each command body carries a \`## 启动工作流\` section guiding the agent
  to run \`aet workflow init --name <id>\` + \`aet workflow handover\` via bash;
  the two hooks above rewrite those bash calls + inject \`result.prompt\` —
  this carries ACTIVE MODE (slash → init + step-1 task) since omp's HookAPI
  exposes no \`command.execute.before\` equivalent.

## ACTIVE MODE on omp

omp's HookAPI does NOT expose a \`command.execute.before\` hook (per ctx7 omp
docs: hookable events are \`tool_call\` / \`tool_result\` / message rewrite /
compact / session lifecycle). So AET's ACTIVE MODE (intercept \`/aet-*\` and
auto-init the workflow) degrades to the natural path: the generated
\`.omp/commands/aet-<id>.md\` body (rendered with \`hasPlugin:false\` in
hosts.json) carries a \`## 启动工作流\` section that tells the agent to run
\`aet workflow init --name <id> --argument <原始需求>\` then
\`aet workflow handover\` via bash. The \`tool_call\` hook appends
\`--output json\` to each, and the \`tool_result\` hook injects
\`result.prompt\` — keeping the full AET init + step-1-task delivery within
omp's actual hook surface. The PASSIVE plugin (the two tool hooks) still
ships and runs; only the auto-init half is carried by the command body
instead of a command-pre hook.

## Capabilities

Dual-channel design (Core b3):

| AET event              | behavior                                                   |
|------------------------|------------------------------------------------------------|
| \`prompt.inject\`        | supported — replaced as a text content part                 |
| \`prompt.inject_system\` | degraded — surfaces as a text content part (no system mutation) |
| \`context.clear\`        | degraded — surfaces as a text instruction (no session.create) |
| \`omit_prompt\`          | degraded — leave the tool result untouched                 |
| \`interrupt_execution\`  | degraded — surfaces as a text instruction                  |
| \`error\`                | always visible (R9)                                        |

## Updating

Rebuild the workflow-core package (\`npm run build\`) and re-copy the
directory. The plugin version in \`package.json\` tracks the root package.

`;
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
        description: 'AET workflow orchestration for omp / Oh My Pi (aet Bash rewriting + workflow result injection via HookAPI tool_call/tool_result hooks).',
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
  await mkdir(skillsDest, { recursive: true });
  await cp(SKILLS_SRC, skillsDest, { recursive: true });
  const skillCount = (await readdir(skillsDest, { withFileTypes: true }))
    .filter((e) => e.isDirectory()).length;
  console.log(`[aet:build] ${'omp'.padEnd(12)} → ${skillsDest} (copy, recursive, ${skillCount} skills)`);

  // 4. commands/ — copy of src/commands/ (omp auto-discovers). The AET
  //    `/aet-<id>` slash commands are generated project-side by
  //    `aet plugin init --agent omp`; these shipped templates are the static
  //    ones (e.g. enable.md).
  const commandsDest = join(targetDir, 'commands');
  await mkdir(commandsDest, { recursive: true });
  if (fileExists(COMMANDS_SRC)) {
    await cp(COMMANDS_SRC, commandsDest, { recursive: true });
    const cmdFiles = (await readdir(commandsDest, { withFileTypes: true }))
      .filter((e) => e.isFile()).length;
    console.log(`[aet:build] ${'omp'.padEnd(12)} → ${commandsDest} (copy, ${cmdFiles} files)`);
  } else {
    console.log(`[aet:build] ${'omp'.padEnd(12)} → ${commandsDest} (empty, ${COMMANDS_SRC} not found)`);
  }

  // 5. README.md — install instructions.
  await writeFile(join(targetDir, 'README.md'), buildOmpReadme(), 'utf8');
  console.log(`[aet:build] ${'omp'.padEnd(12)} → ${join(targetDir, 'README.md')} (gen)`);
}

async function main() {
  console.log('[aet:build] cleaning dist/');
  await rm('dist', { recursive: true, force: true });
  await mkdir('dist', { recursive: true });

  // Always build the CLI bundle.
  await buildOne(CLI_MANIFEST);

  const rootPkg = JSON.parse(await readFile('package.json', 'utf8'));

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
      const readme = buildPluginReadme({
        targetDir: dist.targetDir,
        label: dist.label,
        manifestDirs: dist.manifestDirs,
        rootVar: dist.rootVar,
        commandsDir: dist.commandsDir,
        agentId: dist.agentId,
        installPath: dist.installPath,
        kind: dist.kind,
      });
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

  console.log('[aet:build] all bundles built successfully.');
}

main().catch((err) => {
  console.error('[aet:build] FAILED:', err);
  process.exit(1);
});

