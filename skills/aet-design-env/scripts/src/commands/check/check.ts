/**
 * check [project-root] — Audit env config and plugin configs for issues.
 *
 * Sibling subcommand to `template`. Scans the 2-level plugin lookup tree
 * (project `.aet/design/` → home `~/.aet/design/`) and reports problems
 * that would cause `template` generation to fail or silently misbehave.
 *
 * NOTE: `template` always takes a `<template-set-path>` arg (provided by
 * the calling skill). check does NOT know which template-set will be
 * requested, so it cannot audit per-template-set concerns (artifact.md
 * presence, placeholder reachability). check only audits env-level
 * config: plugin.json schema, design.json, and the active-chain cycle /
 * broken-dep integrity.
 *
 * Modes:
 *   - No arg: scan current project + home (full env scan).
 *   - With `<project-root>`: chdir into the given path, then run the same
 *     env scan. The path is treated as a project root (must contain or not
 *     contain `.aet/design/` — both are valid; an empty project reports
 *     "no design.json" + no plugins).
 *
 * Checks (severity = exit-code impact):
 *   ERROR  (exit 1) — design.json malformed JSON / not an object / missing
 *                      or invalid `plugin` field
 *                    — plugin.json malformed JSON / not an object / schema
 *                      violations (`depends_on` not string|null, `shields`
 *                      not string[])
 *                    — active plugin chain has cycle (a → b → a)
 *                    — chain references a plugin missing at both levels
 *   WARNING(exit 0) — ghost plugin folder (no plugin.json, no
 *                      template-set subdirs with content)
 *                    — no design.json at project or home (path-arg
 *                      template-set will be used directly, no chain overlays)
 *   INFO   (exit 0) — passthrough plugin (only plugin.json, no template-set
 *                      subdirs) — legitimate but flagged for awareness
 *
 * Output (stdout): one issue per line, `[SEVERITY] path: message`.
 * Output (stderr): summary line (`N error(s), M warning(s), K info.`).
 * Exit: 0 if no ERRORs, 1 otherwise. Hard failures (bad path arg, internal
 * exception) also exit 1 with `Error: ...` on stderr.
 *
 * Usage (via unified entry):
 *   node scripts/aet-design-env.mjs check [project-root]
 * Examples:
 *   node scripts/aet-design-env.mjs check             # scan current env
 *   node scripts/aet-design-env.mjs check /tmp/proj   # scan /tmp/proj as project root
 *
 * For Coding Agent:
 *   If you have used the read tool to read this code, you might have misunderstood.
 *   Please stop exploring immediately. Run this script directly via bash. The script
 *   will return the full audit report on stdout.
 *
 * Stream convention (see index.ts): stdout = audit findings (data, one
 * per line); stderr = summary count + hard-error diagnostics.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { buildChain } from '../template/template';

export interface CheckIssue {
  severity: 'ERROR' | 'WARNING' | 'INFO';
  /** Absolute file or dir path the issue pertains to, or a synthetic
   *  label like `(no design.json)` when no path applies. */
  path: string;
  message: string;
}

export interface ParsedCheckArgs {
  /** Project root path to scan, or null for current cwd. */
  projectRoot: string | null;
}

/**
 * Parse args from an external argv array (so the unified entry can dispatch).
 * No arg → null (scan current env). One arg → project root (scoped scan).
 */
export function parseArgs(argv: string[]): ParsedCheckArgs {
  if (argv.length < 1) return { projectRoot: null };
  return { projectRoot: argv[0] };
}

// --- Internals --------------------------------------------------------------

/** Safely read+parse JSON; never throws. Returns ok or error string. */
function readJsonSafe(filePath: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(readFileSync(filePath, 'utf-8')) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** List immediate subdirectory names of a design dir (skipping dotfiles
 *  and the `design.json` file entry, which `readdirSync` would return only
 *  if it were a directory — defensive guard). */
function listPluginFolderNames(designDir: string): string[] {
  if (!existsSync(designDir)) return [];
  let entries: Dirent[];
  try {
    entries = readdirSync(designDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name);
}

/**
 * Under the new model a plugin folder wraps one or more template-set
 * subdirs (`<plugin>/<templateSet>/{artifact.md, components/...}`). Return
 * true if the plugin folder contains at least one such template-set subdir
 * that has any content (artifact.md OR a components/ subdir with .md files).
 *
 * Used to distinguish:
 *   - passthrough plugin (only plugin.json, no template-set subdirs) → INFO
 *   - ghost plugin folder (no plugin.json AND no template-set content) → WARNING
 */
function pluginHasTemplateSetContent(pluginDir: string): boolean {
  let entries: Dirent[];
  try {
    entries = readdirSync(pluginDir, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    const templateSetDir = join(pluginDir, e.name);
    if (existsSync(join(templateSetDir, 'artifact.md'))) return true;
    const componentsDir = join(templateSetDir, 'components');
    if (existsSync(componentsDir)) {
      try {
        const comps = readdirSync(componentsDir, { withFileTypes: true });
        if (comps.some((c: Dirent) => c.isFile() && c.name.endsWith('.md'))) return true;
      } catch {
        // ignore unreadable components dir, keep scanning
      }
    }
  }
  return false;
}

/**
 * Validate a plugin.json at the given absolute path (PLUGIN-ROOT level):
 * malformed JSON, not an object, schema violation on `depends_on`, or
 * schema violation on `shields` (must be an object mapping template-set
 * name → array of non-empty strings). Appends CheckIssue entries (multiple
 * per file if multiple violations).
 */
function checkPluginJsonSchema(pluginJsonPath: string, issues: CheckIssue[]): void {
  const parsed = readJsonSafe(pluginJsonPath);
  if (!parsed.ok) {
    issues.push({ severity: 'ERROR', path: pluginJsonPath, message: `malformed JSON: ${parsed.error}` });
    return;
  }
  const cfg = parsed.value;
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    issues.push({ severity: 'ERROR', path: pluginJsonPath, message: `plugin.json must be a JSON object` });
    return;
  }
  const obj = cfg as Record<string, unknown>;
  const hasDependsOn = Object.prototype.hasOwnProperty.call(obj, 'depends_on');
  if (hasDependsOn) {
    const dep = obj.depends_on;
    if (dep === null) {
      // explicit null = terminal plugin (OK)
    } else if (typeof dep !== 'string') {
      issues.push({ severity: 'ERROR', path: pluginJsonPath, message: `'depends_on' must be a string or null (got ${typeof dep})` });
    } else if (dep.length === 0) {
      issues.push({ severity: 'ERROR', path: pluginJsonPath, message: `'depends_on' must be a non-empty string` });
    }
  }
  if (Object.prototype.hasOwnProperty.call(obj, 'shields')) {
    const sh = obj.shields;
    if (sh === null) {
      // explicit null = no shields (OK)
    } else if (!sh || typeof sh !== 'object' || Array.isArray(sh)) {
      issues.push({
        severity: 'ERROR',
        path: pluginJsonPath,
        message: `'shields' must be an object mapping template-set name to array of strings (got ${sh === null ? 'null' : Array.isArray(sh) ? 'array' : typeof sh})`,
      });
    } else {
      const shieldsMap = sh as Record<string, unknown>;
      for (const [setName, list] of Object.entries(shieldsMap)) {
        if (list === undefined || list === null) continue;
        if (!Array.isArray(list)) {
          issues.push({ severity: 'ERROR', path: pluginJsonPath, message: `'shields["${setName}"]' must be an array of strings (got ${typeof list})` });
          continue;
        }
        for (const s of list) {
          if (typeof s !== 'string') {
            issues.push({ severity: 'ERROR', path: pluginJsonPath, message: `'shields["${setName}"]' entries must be strings (found ${typeof s})` });
          } else if (s.length === 0) {
            issues.push({ severity: 'ERROR', path: pluginJsonPath, message: `'shields["${setName}"]' entries must be non-empty strings` });
          }
        }
      }
    }
  }
}

/** Validate a design.json at the given absolute path: malformed JSON, not
 *  an object, missing `plugin` field, or `plugin` of the wrong type. A
 *  `plugin: null` value is the explicit "disable the chain" switch — same
 *  semantics as having no design.json at all (empty chain → path-arg
 *  fallback used directly), so we return null silently (no ERROR). Returns
 *  the active plugin name on success, or null if disabled/unusable. Pushes
 *  ERROR issues on failure. */
function checkDesignJson(designJsonPath: string, issues: CheckIssue[]): string | null {
  const parsed = readJsonSafe(designJsonPath);
  if (!parsed.ok) {
    issues.push({ severity: 'ERROR', path: designJsonPath, message: `malformed JSON: ${parsed.error}` });
    return null;
  }
  const cfg = parsed.value;
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    issues.push({ severity: 'ERROR', path: designJsonPath, message: `design.json must be a JSON object` });
    return null;
  }
  if (!Object.prototype.hasOwnProperty.call(cfg, 'plugin')) {
    issues.push({ severity: 'ERROR', path: designJsonPath, message: `'plugin' field is required (set to a plugin name, or null to disable the chain)` });
    return null;
  }
  const plugin = (cfg as { plugin?: unknown }).plugin;
  if (plugin === null) {
    // Explicit disable — no active plugin, no chain validation, no issue.
    return null;
  }
  if (typeof plugin !== 'string' || plugin.length === 0) {
    issues.push({ severity: 'ERROR', path: designJsonPath, message: `'plugin' field must be a non-empty string or null (use null to disable the chain)` });
    return null;
  }
  return plugin;
}

// --- Main audit -------------------------------------------------------------

/**
 * Run the full audit. Reads project from `process.cwd()` (caller may chdir
 * first to scope the scan). Returns the list of issues found; never throws
 * for audit-level problems (only for hard internal failures).
 */
export function runChecks(): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const proj = process.cwd();
  const home = homedir();

  const designDirs = [
    { label: 'project', dir: join(proj, '.aet', 'design') },
    { label: 'home', dir: join(home, '.aet', 'design') },
  ];

  // 1. Per-plugin folder checks: enumerate all plugin folders at both
  //    levels. We check each occurrence independently (project-level
  //    plugin.json can be malformed even if home-level is valid).
  for (const { dir } of designDirs) {
    if (!existsSync(dir)) continue;
    const pluginNames = listPluginFolderNames(dir);
    for (const pluginName of pluginNames) {
      const pluginDir = join(dir, pluginName);
      const pluginJsonPath = join(pluginDir, 'plugin.json');
      const hasPluginJson = existsSync(pluginJsonPath);
      const hasTemplateSetContent = pluginHasTemplateSetContent(pluginDir);

      if (hasPluginJson) {
        checkPluginJsonSchema(pluginJsonPath, issues);
      }

      if (!hasPluginJson && !hasTemplateSetContent) {
        issues.push({
          severity: 'WARNING',
          path: pluginDir,
          message: `ghost plugin folder (no plugin.json, no template-set subdirs with content)`,
        });
      } else if (hasPluginJson && !hasTemplateSetContent) {
        issues.push({
          severity: 'INFO',
          path: pluginDir,
          message: `passthrough plugin (only plugin.json, no template-set subdirs)`,
        });
      }
    }
  }

  // 2. design.json: project takes precedence over home (matches
  //    loadActivePlugin semantics in util.ts). Check whichever exists.
  const projDesignPath = join(proj, '.aet', 'design', 'design.json');
  const homeDesignPath = join(home, '.aet', 'design', 'design.json');
  let activePlugin: string | null = null;
  let activePluginSource: string = '(no design.json)';

  if (existsSync(projDesignPath)) {
    activePluginSource = projDesignPath;
    activePlugin = checkDesignJson(projDesignPath, issues);
  } else if (existsSync(homeDesignPath)) {
    activePluginSource = homeDesignPath;
    activePlugin = checkDesignJson(homeDesignPath, issues);
  } else {
    issues.push({
      severity: 'WARNING',
      path: '(no design.json)',
      message: `no design.json at project or home — no plugin chain active; \`template\` path-arg template-set used directly`,
    });
  }

  // 3. Active-chain integrity (cycle + broken dep). Only the chain
  //    reachable from design.json's active plugin — non-active plugins'
  //    chains are not exercised by `template` so we skip them.
  //
  //    NOTE: we deliberately do NOT check per-template-set concerns here
  //    (artifact.md presence, placeholder reachability) because check
  //    doesn't know which template-set `template` will be invoked with.
  //    Per-template-set audits are the caller's responsibility (run
  //    `template <path>` and observe stderr warnings + the
  //    [Missing component: ...] placeholders).
  if (activePlugin) {
    try {
      buildChain(activePlugin);
    } catch (e) {
      const msg = (e as Error).message;
      // buildChain error messages already include enough context — surface
      // them as ERRORs anchored on the design.json that selected this chain.
      issues.push({
        severity: 'ERROR',
        path: activePluginSource,
        message: msg,
      });
    }
  }

  return issues;
}

// --- Entry point ------------------------------------------------------------

/**
 * Entry point invoked by the unified dispatcher (aet-design-env.mjs).
 * Accepts an external argv array (process.argv.slice(2) is passed in by
 * index.ts as `rest`).
 *
 * Behavior:
 *   - No arg: runChecks() against current cwd.
 *   - With arg: chdir to the given project root, then runChecks(). The
 *     arg must be an existing directory (file paths are rejected).
 *
 * Output: one `[SEVERITY] path: message` line per issue on stdout, plus
 * a summary on stderr. Exit 1 if any ERROR (or hard failure), else 0.
 */
export function runCheck(argv: string[]): void {
  try {
    const { projectRoot } = parseArgs(argv);

    if (projectRoot) {
      const abs = isAbsolute(projectRoot) ? projectRoot : resolve(process.cwd(), projectRoot);
      let st: ReturnType<typeof statSync>;
      try {
        st = statSync(abs);
      } catch {
        console.error(`Error: path does not exist: ${abs}`);
        process.exit(1);
      }
      if (!st.isDirectory()) {
        console.error(`Error: path is not a directory: ${abs}`);
        process.exit(1);
      }
      process.chdir(abs);
    }

    const issues = runChecks();

    for (const issue of issues) {
      console.log(`[${issue.severity}] ${issue.path}: ${issue.message}`);
    }

    const errors = issues.filter((i) => i.severity === 'ERROR').length;
    const warnings = issues.filter((i) => i.severity === 'WARNING').length;
    const infos = issues.filter((i) => i.severity === 'INFO').length;

    if (errors > 0) {
      console.error(`\n${errors} error(s), ${warnings} warning(s), ${infos} info.`);
      process.exit(1);
    }
    if (issues.length > 0) {
      console.error(`\nNo errors. ${warnings} warning(s), ${infos} info.`);
    } else {
      console.error(`\nNo issues found.`);
    }
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}
