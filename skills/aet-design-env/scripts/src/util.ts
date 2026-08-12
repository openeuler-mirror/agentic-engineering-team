/**
 * Shared utilities for aet-design-env scripts.
 *
 * This file is imported by setup.ts / context.ts / template.ts / library.ts
 * and gets inlined into each compiled .mjs bundle by esbuild. It is NOT built
 * as a standalone entry (build.mjs filters it out).
 *
 * Modules exported:
 *   - paths:    __dirname/skillRoot/projectRoot/userHome resolution
 *   - yaml:     load/save YAML (js-yaml wrapper)
 *   - fm:       frontmatter parsing (markdown --- block)
 *   - heading:  heading level adjustment + section numbering + html comment stripping
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import * as yaml from 'js-yaml';

/* ------------------------------------------------------------------ paths */

/**
 * Resolve the skill root directory (the dir containing SKILL.md).
 *
 * Detection is based on the file extension of this module's own URL:
 *   - Source mode (vitest): `import.meta.url` points at scripts/src/util.ts
 *     (a vitest watch-mode query like ?t=… is stripped first). The skill
 *     root is two levels up (src/ -> scripts/ -> skill root).
 *   - Compiled mode: util.ts is inlined into the single esbuild bundle
 *     scripts/aet-design-env.mjs, so `import.meta.url` points there. The
 *     skill root is one level up.
 *
 * Using the file extension rather than a path-suffix regex makes this
 * robust against unusual install paths (e.g. a skill rooted at a directory
 * literally named `scripts/src`).
 */
export const skillRoot = (): string => {
  const thisFile = fileURLToPath(import.meta.url).split('?')[0];
  const here = dirname(thisFile);
  const isSourceMode = thisFile.endsWith('.ts');
  return resolve(here, isSourceMode ? '../..' : '..');
};

/** Project root = current working directory. */
export const projectRoot = (): string => process.cwd();

/** User home directory. */
export const userHome = (): string => homedir();

/* ----------------------------------------------------------------- plugins */

/**
 * 2-level lookup order for a plugin's own directory (no template-set
 * dimension, no skill fallback). Used for plugin existence checks and
 * plugin.json loading. With the new "plugin = wrapper around multiple
 * template sets" model, the skill no longer ships its own `_templates/`
 * at the aet-design-env skill root; the path arg passed at template-time
 * serves as the terminal fallback instead.
 *
 * Order:
 *   1. {project}/.aet/design/{pluginName}/
 *   2. {home}/.aet/design/{pluginName}/
 *
 * Cross-level mixing is allowed: plugin "a" can live in the project while
 * its dependency "b" lives in the home directory.
 */
export function pluginDirLookupOrder(pluginName: string): string[] {
  const proj = projectRoot();
  const home = userHome();
  return [
    join(proj, '.aet', 'design', pluginName),
    join(home, '.aet', 'design', pluginName),
  ];
}

/**
 * 2-level lookup order for a file inside a plugin's template-set subfolder.
 * Each plugin is a wrapper that may contain multiple template-set subdirs
 * (e.g. `a/req-analysis/`, `a/req-design/`); this resolves a file within
 * the plugin's named template-set subdir.
 *
 * Order:
 *   1. {project}/.aet/design/{pluginName}/{templateSetName}/{relPath}
 *   2. {home}/.aet/design/{pluginName}/{templateSetName}/{relPath}
 *
 * The CLI path arg is the terminal fallback applied at the END of the
 * chain walk (not per-plugin), see template.ts assembleTemplate.
 */
export function pluginTemplateLookupOrder(
  pluginName: string,
  templateSetName: string,
  relPath: string,
): string[] {
  const proj = projectRoot();
  const home = userHome();
  return [
    join(proj, '.aet', 'design', pluginName, templateSetName, relPath),
    join(home, '.aet', 'design', pluginName, templateSetName, relPath),
  ];
}

/**
 * Resolve a single file inside a plugin's template-set subfolder.
 * Returns the first existing absolute path across the 2-level lookup,
 * or null if not found at either level.
 */
export function resolvePluginTemplateFile(
  pluginName: string,
  templateSetName: string,
  relPath: string,
): string | null {
  for (const candidate of pluginTemplateLookupOrder(pluginName, templateSetName, relPath)) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Check whether a plugin folder exists at project or home level. Used
 * during chain construction to give a clear error for broken `depends_on`
 * links. A plugin is "present" if its directory exists at either level,
 * regardless of which files are inside (a passthrough plugin may have
 * only plugin.json, no template-set subdirs).
 */
export function pluginExists(pluginName: string): boolean {
  for (const dir of pluginDirLookupOrder(pluginName)) {
    if (existsSync(dir)) return true;
  }
  return false;
}

/* --------------------------------------------------------- plugin config */

export interface PluginConfig {
  /**
   * Sibling plugin name this plugin extends (single dependency → chain
   * semantics). Resolved at project or home level. null/missing = terminal
   * plugin (chain ends here; file lookups then fall back to the CLI path
   * arg supplied at template-time).
   */
  depends_on?: string | null;

  /**
   * Per-template-set shields, keyed by template-set name. Each value is a
   * list of component names shielded when the active template-set matches
   * the key. Different template sets under the same plugin can shield
   * different components — e.g. `{ "req-analysis": ["data-constraints.aet"],
   * "req-design": ["intro"] }`.
   *
   * Passthrough semantics: a shield at plugin P for template-set T blocks
   * lookups for the named component at plugins further down the chain AND
   * at the path-arg fallback, but P's OWN copy (if any) is exempt. Only
   * `components/*` files are shieldable; `artifact.md` and
   * `components/metadata.md` are never shielded.
   */
  shields?: Record<string, string[]>;
}

/**
 * Load and parse a plugin's plugin.json (plugin-global config: depends_on
 * and per-template-set shields map). Reads from the first level (project,
 * then home) that has it. Returns null if no plugin.json exists at either
 * level (the plugin is then treated as a terminal passthrough with no
 * chain dependency and no shields). Throws on malformed JSON or schema
 * violations.
 */
export function loadPluginConfig(pluginName: string): PluginConfig | null {
  let filePath: string | null = null;
  for (const dir of pluginDirLookupOrder(pluginName)) {
    const candidate = join(dir, 'plugin.json');
    if (existsSync(candidate)) {
      filePath = candidate;
      break;
    }
  }
  if (!filePath) return null;
  let raw: unknown;
  try {
    const text = readFileSync(filePath, 'utf-8');
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(`Failed to read plugin config for '${pluginName}' (${filePath}): ${(error as Error).message}`);
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`plugin.json is not an object: ${filePath}`);
  }
  const obj = raw as Record<string, unknown>;
  const cfg: PluginConfig = {};

  if (obj.depends_on === undefined || obj.depends_on === null) {
    cfg.depends_on = null;
  } else if (typeof obj.depends_on === 'string' && obj.depends_on.length > 0) {
    cfg.depends_on = obj.depends_on;
  } else {
    throw new Error(`plugin.json 'depends_on' must be a non-empty string or null: ${filePath}`);
  }

  if (obj.shields !== undefined && obj.shields !== null) {
    if (!obj.shields || typeof obj.shields !== 'object' || Array.isArray(obj.shields)) {
      throw new Error(
        `plugin.json 'shields' must be an object mapping template-set name to array of strings: ${filePath}`,
      );
    }
    const shieldsMap = obj.shields as Record<string, unknown>;
    const normalized: Record<string, string[]> = {};
    for (const [setName, list] of Object.entries(shieldsMap)) {
      if (list === undefined || list === null) continue;
      if (!Array.isArray(list)) {
        throw new Error(`plugin.json 'shields["${setName}"]' must be an array of strings: ${filePath}`);
      }
      const filtered = list.filter((s): s is string => typeof s === 'string' && s.length > 0);
      if (filtered.length > 0) normalized[setName] = filtered;
    }
    if (Object.keys(normalized).length > 0) cfg.shields = normalized;
  }

  return cfg;
}

/* --------------------------------------------------------- active plugin */

export interface DesignConfig {
  /**
   * The currently active plugin name (entry point of the chain), or null
   * to explicitly disable the chain (same effect as having no
   * design.json at all: empty chain → path-arg fallback used directly).
   */
  plugin?: string | null;
}

/**
 * Load the active-plugin selector (design.json). Project-level takes
 * precedence; falls back to home-level if the project-level file is missing.
 * Returns null if neither exists, OR if the file explicitly sets
 * `plugin: null` (intentional disable — same semantics as no design.json:
 * empty chain, path-arg fallback used directly). Throws on malformed JSON,
 * not-object, missing `plugin` field, or `plugin` of the wrong type (empty
 * string, number, array, etc.).
 */
export function loadActivePlugin(): string | null {
  const projPath = join(projectRoot(), '.aet', 'design', 'design.json');
  const homePath = join(userHome(), '.aet', 'design', 'design.json');
  const filePath = existsSync(projPath) ? projPath : (existsSync(homePath) ? homePath : null);
  if (!filePath) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch (error) {
    throw new Error(`Failed to read active plugin (${filePath}): ${(error as Error).message}`);
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`design.json is not an object: ${filePath}`);
  }
  if (!Object.prototype.hasOwnProperty.call(raw, 'plugin')) {
    throw new Error(`design.json 'plugin' field is required (set to a plugin name, or null to disable the chain): ${filePath}`);
  }
  const plugin = (raw as DesignConfig).plugin;
  if (plugin === null) {
    // Explicit disable — empty chain, path-arg fallback used directly.
    return null;
  }
  if (typeof plugin !== 'string' || plugin.length === 0) {
    throw new Error(`design.json 'plugin' field must be a non-empty string or null (use null to disable the chain): ${filePath}`);
  }
  return plugin;
}

/* ------------------------------------------------------------------- yaml */

/** Load a YAML file and return the parsed object. Throws on parse error. */
export function loadYaml<T = unknown>(filePath: string): T {
  const text = readFileSync(filePath, 'utf-8');
  return yaml.load(text) as T;
}

/** Serialize an object to YAML text. */
export function dumpYaml(obj: unknown): string {
  return yaml.dump(obj, { lineWidth: 120 });
}

/* ---------------------------------------------------------- frontmatter */

export interface ParsedFrontmatter {
  metadata: Record<string, unknown>;
  body: string;
}

/**
 * Parse a markdown frontmatter block. Supports:
 *   - Block scalar `|` for multi-line string values
 *   - Simple `key: value` pairs (strings are trimmed of surrounding quotes)
 *
 * Returns {metadata, body}. If no frontmatter present, metadata is {} and
 * body is the original content.
 *
 * INTENTIONAL DIVERGENCE from template.ts.parseFrontmatter — DO NOT sync:
 *   - This is the general-purpose parser for library/context: returns
 *     `Record<string, unknown>` (values may be non-string), handles `|`
 *     AND `>` block scalars, strips surrounding quotes, leaves body
 *     UNtrimmed.
 *   - template.ts.parseFrontmatter is byte-locked to
 *     skills/aet-req-analysis/scripts/assemble-template.mjs: returns
 *     `Record<string, string|undefined>`, handles `|` only, trims body.
 *   - They cannot share one implementation without breaking one contract.
 */
export function parseFrontmatter(content: string): ParsedFrontmatter {
  const fmRegex = /^---\n([\s\S]*?)\n---\n?/;
  const match = content.match(fmRegex);
  if (!match) {
    return { metadata: {}, body: content };
  }
  const rawMeta = match[1];
  const body = content.slice(match[0].length);
  const metadata: Record<string, unknown> = {};

  // Split into lines; block scalars use `|` and consume subsequent indented lines
  const lines = rawMeta.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) { i++; continue; }
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();

    if (value === '|' || value === '>') {
      // Block scalar: gather subsequent indented lines
      const blockLines: string[] = [];
      i++;
      while (i < lines.length && (lines[i].startsWith('  ') || lines[i].startsWith('\t') || lines[i] === '')) {
        blockLines.push(lines[i]);
        i++;
      }
      const blockText = blockLines.join('\n').replace(/^  /gm, '');
      metadata[key] = blockText;
      continue;
    }

    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    metadata[key] = value;
    i++;
  }

  return { metadata, body };
}

/** Extract the description field from frontmatter (case-insensitive). */
export function extractDescriptionFromFrontmatter(meta: Record<string, unknown>): string | null {
  for (const key of Object.keys(meta)) {
    if (key.toLowerCase() === 'description') {
      const v = meta[key];
      return typeof v === 'string' ? v : String(v ?? '');
    }
  }
  return null;
}

/* --------------------------------------------------------------- heading */

/**
 * Adjust all markdown heading levels by a delta, clamped to [1, 6].
 * Only ATX-style headings (# ...) are affected.
 *
 * INTENTIONAL DIVERGENCE from template.ts.adjustHeadingLevel — DO NOT sync:
 *   - This uses a single regex `^(#{1,6})\s` pass that replaces ONLY the
 *     `#`s + separator prefix, preserving the original separator (space,
 *     tab, etc.) of each heading line.
 *   - template.ts is byte-locked to assemble-template.mjs: it splits into
 *     lines, matches `^(#{1,6})\s(.*)$`, and reconstructs with a SPACE
 *     (normalizing tabs to spaces). For `##\tfoo` this and template.ts
 *     produce different bytes.
 */
export function adjustHeadingLevel(content: string, fromLevel: number, toLevel: number): string {
  const diff = toLevel - fromLevel;
  if (diff === 0) return content;
  // Match headings at any level and shift them
  return content.replace(/^(#{1,6})\s/gm, (match, hashes: string) => {
    const lvl = hashes.length;
    let newLvl = lvl + diff;
    if (newLvl < 1) newLvl = 1;
    if (newLvl > 6) newLvl = 6;
    return '#'.repeat(newLvl) + ' ';
  });
}

/**
 * Add section numbers to markdown headings:
 *   ## Title       -> ## §1 Title
 *   ### Title      -> ### §1.1 Title
 *   #### Title     -> #### §1.1.1 Title
 * Counters reset per top-level section.
 *
 * INTENTIONAL DIVERGENCE from template.ts.addSectionNumbers — DO NOT sync:
 *   - This numbers BOTH H1 and H2 as `§N` (treats H1 as a top-level
 *     section), and prefixes H3/H4 with `N.M`/`N.M.K`.
 *   - template.ts is byte-locked to assemble-template.mjs: it SKIPS H1
 *     (only H2-H4 are numbered), and H3/H4 get `N.M`/`N.M.K` (no §).
 *   - Different numbering semantics — cannot share one implementation.
 */
export function addSectionNumbers(content: string): string {
  let section = 0;
  let sub = 0;
  let subsub = 0;

  return content.replace(/^(#{1,6})\s+(.*)$/gm, (match, hashes: string, title: string) => {
    const lvl = hashes.length;
    // Skip headings that already start with a § or number
    if (/^[§§]/.test(title) || /^\d+(\.\d+)*\s/.test(title)) return match;

    let num: string;
    if (lvl === 1) { section++; sub = 0; subsub = 0; num = String(section); }
    else if (lvl === 2) { section++; sub = 0; subsub = 0; num = String(section); }
    else if (lvl === 3) { sub++; subsub = 0; num = `${section}.${sub}`; }
    else if (lvl === 4) { subsub++; num = `${section}.${sub}.${subsub}`; }
    else { return match; }

    return `${hashes} §${num} ${title}`;
  });
}

/**
 * Strip HTML comments (<!-- ... -->), including nested comments.
 * Uses an explicit depth counter so `<!-- a <!-- b --> c -->` collapses to "".
 *
 * This implementation is SHARED with template.ts (which must remain byte-
 * compatible with skills/aet-req-analysis/scripts/assemble-template.mjs).
 * The ST assertion (template.st.mjs) guards byte-compat end-to-end: if you
 * change this function, run `npm run st` — a red ST means byte-compat broke.
 */
export function stripHtmlComments(text: string): string {
  let result = '';
  let i = 0;
  while (i < text.length) {
    if (text.startsWith('<!--', i)) {
      let depth = 1;
      i += 4;
      while (i < text.length && depth > 0) {
        if (text.startsWith('<!--', i)) {
          depth++;
          i += 4;
        } else if (text.startsWith('-->', i)) {
          depth--;
          i += 3;
        } else {
          i++;
        }
      }
    } else {
      result += text[i];
      i++;
    }
  }
  return result;
}

/* ------------------------------------------------------------- misc: dir */

/** List markdown files in a directory (non-recursive). */
export function listMarkdownFiles(dirPath: string): string[] {
  if (!existsSync(dirPath)) return [];
  return readdirSync(dirPath)
    .filter((f) => f.endsWith('.md'))
    .map((f) => join(dirPath, f));
}

/** Read a file's content, returning '' if it doesn't exist. */
export function readFileText(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch {
    return '';
  }
}

/** Write text to a file, creating parent directories as needed. */
export function writeFileText(filePath: string, content: string): void {
  writeFileSync(filePath, content, 'utf-8');
}

/** Type label lookup for library nodes (used by library.ts). */
export const DEFAULT_TYPE_LABELS: Record<string, string> = {
  scenario: '场景库',
  function: '功能库',
  directory: '目录',
  scene: '场景',
};
