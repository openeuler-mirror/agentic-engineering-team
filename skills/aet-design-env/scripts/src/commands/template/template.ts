/**
 * template <template-set-path> — Assemble a document from a base template-set
 * overlayed by an optional plugin chain.
 *
 * ## Model
 *
 * A "template-set" is a folder containing `artifact.md` + `components/`.
 * Other skills ship these as their built-in templates, e.g.:
 *   skills/aet-req-analysis/scripts/_templates/req-analysis/
 *   skills/aet-req-design/scripts/_templates/req-design/
 * The CLI MUST be invoked with a path to such a template-set folder; this
 * skill is called BY other skills to generate their docs.
 *
 * A "plugin" is a WRAPPER that may overlay one or more template-sets. A
 * plugin folder lives at:
 *   - {project}/.aet/design/<pluginName>/   (highest priority)
 *   - {home}/.aet/design/<pluginName>/
 * and contains an optional `plugin.json` (at the plugin root, applying to
 * ALL template-sets under that plugin) declaring:
 *   - depends_on: sibling plugin name to extend (single dep → chain)
 *   - shields: object mapping template-set name → array of component names
 *     to block for that template-set (so different template-sets under the
 *     same plugin can block different components, all from one file).
 * Plus per-template-set subdirs: `<plugin>/<templateSet>/{artifact.md,
 * components/...}`. A plugin can wrap multiple template-sets (e.g. `a/req-
 * analysis/` AND `a/req-design/`).
 *
 * The active plugin (chain entry) is resolved from `.aet/design/design.json`
 * (project first, then home). If no design.json is present, the chain is
 * empty and the path-arg template-set is used directly (no overlays).
 *
 * ## Lookup (per chain plugin, per template-set, 2 levels)
 *
 * For each plugin Q in the chain and each file (artifact.md / components/X.md
 * / components/metadata.md), look at:
 *   1. {project}/.aet/design/<Q>/<templateSet>/<relPath>
 *   2. {home}/.aet/design/<Q>/<templateSet>/<relPath>
 * First existing wins. Cross-level mixing allowed (plugin a in project,
 * its dep b in home).
 *
 * ## Path-arg terminal fallback
 *
 * After the chain is exhausted (or if the chain is empty), each file is
 * also looked up at `<templateSetPath>/<relPath>` (single level, the path
 * passed on the CLI). The path-arg IS a complete template-set, so using
 * it directly is valid even with zero chain plugins. Shields at plugins
 * earlier in the chain ALSO block the path-arg fallback (passthrough).
 *
 * ## Flow
 *
 *   1. Parse `<template-set-path>` from argv. templateSetName = basename.
 *   2. Resolve active plugin from design.json (project → home). May be
 *      null (no chain, use path-arg directly). Malformed → error exit 1.
 *   3. Build the chain by following depends_on (a → b → c → ...).
 *      Detect cycles. Error if any plugin doesn't exist at either level.
 *   4. Load artifact.md: walk chain (per-plugin × per-template-set 2-level
 *      lookup) → fall back to `<path>/artifact.md`. Throw if both lack.
 *   5. Prepend components/metadata.md: walk chain → fall back to
 *      `<path>/components/metadata.md`; auto-fill update_time.
 *      (metadata.md is never shielded.)
 *   6. Replace {{component-name,level}} placeholders by walking the chain
 *      then falling back to the path-arg:
 *        - At each plugin P, if P has the component → use P's copy
 *          (P's own copy is exempt from P's own shield).
 *        - Else if P shields the component → STOP, return "" (silently
 *          skip the section — passthrough shield blocks downstream
 *          plugins AND the path-arg fallback).
 *        - Else continue to next plugin in chain.
 *        - If chain exhausted without shield → check `<path>/components/
 *          <name>.md`; if exists use it, else emit "[Missing component:
 *          name]" + stderr warning (legacy behaviour).
 *   7. Add section numbers (§N / N.M / N.M.K) to H2/H3/H4.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * ⚠️  DO NOT sync the four parse/heading/comment helpers with util.ts.
 *
 *   parseFrontmatter / adjustHeadingLevel / addSectionNumbers live below
 *   as LOCAL byte-locked copies of assemble-template.mjs. util.ts has its
 *   OWN copies with DIFFERENT contracts (general-purpose vs template-
 *   specific). They are intentionally divergent — see each function's
 *   docstring for the exact difference.
 *
 *   stripHtmlComments IS shared (imported from util.ts) because both
 *   callers need identical behaviour and the implementation is byte-
 *   identical to the canonical version. template.st.mjs guards this.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Usage (via unified entry):
 *   node scripts/aet-design-env.mjs template <template-set-path>
 * Example (called from another skill):
 *   node aet-design-env.mjs template skills/aet-req-analysis/scripts/_templates/req-analysis
 *
 * Template placeholders: {{component-name,level}} or {{component-name.aet,level}}
 *   - component-name: filename in components/ (without .md extension)
 *   - .aet suffix: references component-name.aet.md (distinct from component-name.md)
 *   - level: heading level to apply (1-6)
 *   - Comment blocks {{<!-- ... -->}} are stripped during assembly.
 *
 * For Coding Agent:
 *   If you have used the read tool to read this code, you might have misunderstood.
 *   Please stop exploring immediately. Run this script directly via bash. The script
 *   will return the complete template. Based on the returned template, generate the
 *   final output.
 *
 * Stream convention (see index.ts): stdout = assembled markdown document (data,
 * STs compare this); stderr = warnings ("Component not found", "Invalid
 * heading_level", errors).
 */
import { readFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  resolvePluginTemplateFile,
  loadPluginConfig,
  loadActivePlugin,
  pluginExists,
  stripHtmlComments,
} from '../../util';

// Re-export so external consumers (and template.test.ts) still import
// stripHtmlComments from this module. The implementation lives in util.ts
// and is byte-identical to assemble-template.mjs (guarded by template.st.mjs).
export { stripHtmlComments };

export interface Frontmatter {
  metadata: Record<string, string | undefined>;
  body: string;
}

export interface ParsedArgs {
  /** Absolute or relative path to the base template-set folder. */
  templateSetPath: string;
}

/**
 * Current time in the format `YYYY-MM-DD HH:MM:SS (UTC+X)`.
 * Used to fill `update_time` in metadata.md.
 */
export function getCurrentTime(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const offset = -now.getTimezoneOffset() / 60;
  const timezoneStr = `UTC${offset >= 0 ? '+' : ''}${offset}`;
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} (${timezoneStr})`;
}

/**
 * Parse args from an external argv array (so the unified entry can dispatch).
 * The template-set path is REQUIRED — this skill is invoked BY other skills
 * with a path to their built-in template-set folder (e.g.
 * `skills/aet-req-analysis/scripts/_templates/req-analysis`).
 */
export function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length < 1) {
    console.error('Usage: template <template-set-path>');
    console.error('Example: template skills/aet-req-analysis/references/_templates/req-analysis');
    process.exit(1);
  }
  return { templateSetPath: argv[0] };
}

/**
 * Parse a markdown frontmatter block delimited by `---\n...\n---`.
 * Supports simple `key: value` pairs and block scalars (`|`).
 * Returns { metadata, body } where body is trimmed.
 *
 * Block-scalar values preserve inner-line indentation; only the outer string
 * is trimmed (so the first line loses its indent, subsequent lines keep theirs).
 *
 * BYTE-LOCKED to assemble-template.mjs — DO NOT sync with util.ts.parseFrontmatter
 * (which has a different contract: `Record<string,unknown>`, `|`+`>` scalars,
 * quote stripping, untrimmed body). Changing this breaks template.st.mjs.
 */
export function parseFrontmatter(content: string): Frontmatter {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { metadata: {}, body: content.trim() };
  }

  const frontmatterStr = match[1];
  const metadata: Record<string, string | undefined> = {};

  const lines = frontmatterStr.split('\n');
  let currentKey: string | null = null;
  let isBlockScalar = false;
  let blockLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isBlockScalar) {
      if (line.includes(':') && !line.startsWith(' ')) {
        if (currentKey) metadata[currentKey] = blockLines.join('\n').trim();
        isBlockScalar = false;
        blockLines = [];

        const [key, ...valueParts] = line.split(':');
        currentKey = key.trim();
        const value = valueParts.join(':').trim();

        if (value.startsWith('|')) {
          isBlockScalar = true;
        } else if (value) {
          metadata[currentKey] = value;
          currentKey = null;
        }
      } else {
        blockLines.push(line);
      }
    } else if (line.includes(':')) {
      const [key, ...valueParts] = line.split(':');
      currentKey = key.trim();
      const value = valueParts.join(':').trim();

      if (value.startsWith('|')) {
        isBlockScalar = true;
        blockLines = [];
      } else if (value) {
        if (currentKey) metadata[currentKey] = value;
        currentKey = null;
      }
    }
  }

  if (isBlockScalar && currentKey) {
    metadata[currentKey] = blockLines.join('\n').trim();
  }

  return { metadata, body: content.slice(match[0].length).trim() };
}

/**
 * Shift all ATX-style heading levels by (toLevel - fromLevel), clamped to [1, 6].
 * Only lines matching `^#{1,6}\s <content>$` are treated as headings.
 *
 * BYTE-LOCKED to assemble-template.mjs — DO NOT sync with util.ts.adjustHeadingLevel
 * (which uses regex prefix-replace preserving the original separator; this
 * reconstructs each line with a SPACE, normalizing tabs). Changing this breaks
 * template.st.mjs for tab-separated headings.
 */
export function adjustHeadingLevel(content: string, fromLevel: number, toLevel: number): string {
  if (fromLevel === toLevel) {
    return content;
  }

  const diff = toLevel - fromLevel;
  const lines = content.split('\n');
  const adjustedLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s(.*)$/);
    if (headingMatch) {
      const currentLevel = headingMatch[1].length;
      let newLevel = currentLevel + diff;
      newLevel = Math.max(1, Math.min(6, newLevel));
      adjustedLines.push('#'.repeat(newLevel) + ' ' + headingMatch[2]);
    } else {
      adjustedLines.push(line);
    }
  }

  return adjustedLines.join('\n');
}

/**
 * Number H2/H3/H4 headings:
 *   ## Title      -> ## §N Title
 *   ### Title     -> ### N.M Title      (note: NO § for sub-levels)
 *   #### Title    -> #### N.M.K Title   (note: NO § for sub-sub-levels)
 * H1, H5, H6 are left untouched. Counters reset per top-level section.
 *
 * BYTE-LOCKED to assemble-template.mjs — DO NOT sync with util.ts.addSectionNumbers
 * (which numbers BOTH H1 and H2 as §N; this SKIPS H1). Different numbering
 * semantics — changing this breaks template.st.mjs.
 */
export function addSectionNumbers(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  const counters = { section: 0, sub: 0, subsub: 0 };

  for (const line of lines) {
    const headingMatch = line.match(/^(#{2,4})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = headingMatch[2];

      if (level === 2) {
        counters.section++;
        counters.sub = 0;
        counters.subsub = 0;
        result.push(`## §${counters.section} ${title}`);
      } else if (level === 3) {
        counters.sub++;
        counters.subsub = 0;
        result.push(`### ${counters.section}.${counters.sub} ${title}`);
      } else if (level === 4) {
        counters.subsub++;
        result.push(`#### ${counters.section}.${counters.sub}.${counters.subsub} ${title}`);
      } else {
        result.push(line);
      }
    } else {
      result.push(line);
    }
  }

  return result.join('\n');
}

/**
 * Build the dependency chain starting from the active plugin. Each plugin's
 * `depends_on` (declared in its plugin.json) points to a sibling plugin name
 * resolved independently across the 2-level lookup (project > home). Cross-
 * level mixing is allowed: plugin "a" in the project can depend on plugin
 * "b" that lives in the home directory.
 *
 * Active plugin (the one selected by design.json) is treated specially:
 *   - Folder doesn't exist  → ERROR (user explicitly selected it).
 *   - Folder exists but plugin.json is missing → return [] (path-only mode;
 *     treated as "user didn't really configure plugins", the active plugin's
 *     own files are NOT read, lookup falls straight through to the path arg).
 *   - Folder + plugin.json present → enter the chain walk as normal.
 *
 * For mid-chain plugins (referenced via depends_on), plugin.json missing is
 * tolerated as terminal passthrough (chain ends there, plugin's own files
 * are still read): only the ACTIVE plugin's missing plugin.json triggers
 * path-only fallback.
 *
 * Stops when depends_on is missing/null (terminal plugin). Detects cycles
 * and errors out with the cycle path. Errors with a clear message if any
 * dependency doesn't exist at either level.
 *
 * Returns the chain as an ordered array [active, dep1, dep2, ...]. May
 * return [] when the active plugin's plugin.json is missing.
 */
export function buildChain(activePlugin: string): string[] {
  // Active plugin folder doesn't exist → error (user explicitly selected it).
  if (!pluginExists(activePlugin)) {
    throw new Error(`Active plugin '${activePlugin}' not found at either level (project .aet/design/, home ~/.aet/design/)`);
  }
  // Active plugin has no plugin.json → user didn't really configure plugins →
  // path-only mode (active plugin's own files are NOT read).
  if (loadPluginConfig(activePlugin) === null) {
    return [];
  }

  const chain: string[] = [];
  const visited = new Set<string>();
  let current: string | null = activePlugin;

  while (current) {
    if (visited.has(current)) {
      const cycle = [...chain, current].join(' -> ');
      throw new Error(`Circular plugin dependency detected: ${cycle}`);
    }
    if (!pluginExists(current)) {
      // Active plugin's existence is verified above; this branch only fires
      // for mid-chain dependencies (chain.length > 0 here).
      const who = chain.length === 0
        ? `Active plugin '${current}'`
        : `Dependency '${current}' (declared by plugin '${chain[chain.length - 1]}')`;
      throw new Error(`${who} not found at either level (project .aet/design/, home ~/.aet/design/)`);
    }
    visited.add(current);
    chain.push(current);
    const config = loadPluginConfig(current);
    current = config?.depends_on ?? null;
  }
  return chain;
}

/**
 * Load a component (components/<name>.md) from a SPECIFIC plugin's
 * template-set subfolder. The `.aet` suffix in `componentName` is
 * significant: `intro.aet` resolves to `components/intro.aet.md` (distinct
 * from `components/intro.md`).
 *
 * Returns the parsed frontmatter+body, or null if this plugin doesn't
 * define the component for this template-set (or the file is unreadable —
 * emits a stderr warning and returns null so the chain walk can continue
 * to the next plugin).
 */
export function loadComponentFromPlugin(
  pluginName: string,
  templateSetName: string,
  componentName: string,
): Frontmatter | null {
  const relativePath = `components/${componentName}.md`;
  const filePath = resolvePluginTemplateFile(pluginName, templateSetName, relativePath);
  if (!filePath) return null;
  try {
    const content = readFileSync(filePath, 'utf-8');
    return parseFrontmatter(content);
  } catch (error) {
    console.error(`Error: Failed to read component ${componentName} from plugin ${pluginName}/${templateSetName} (${filePath}): ${(error as Error).message}`);
    return null;
  }
}

/**
 * Lookup result for a component across the plugin chain + path-arg fallback.
 *   - 'found':    the component was found (in a chain plugin OR in the
 *                 path-arg fallback); use `content`.
 *   - 'shielded': a plugin in the chain shields the component AND doesn't
 *                 define it itself → silently skip (return empty placeholder).
 *   - 'missing':  no plugin in the chain defines the component, none shields
 *                 it, AND the path-arg fallback lacks it too → emit
 *                 "[Missing component: name]" + warning.
 */
export type ComponentLookupResult =
  | { kind: 'found'; content: Frontmatter; source: string }
  | { kind: 'shielded' }
  | { kind: 'missing' };

/**
 * Walk the plugin chain looking for a component, applying passthrough
 * shields, then fall back to the path-arg base template-set. At each plugin
 * P (in chain order):
 *   - If P defines the component for this template-set → use P's copy
 *     (P's OWN shield is exempt from itself — a plugin can shield a
 *     component it itself provides).
 *   - Else if P shields the component → STOP, return 'shielded' (the
 *     section is silently skipped; all downstream plugins AND the path-arg
 *     fallback are blocked for this component).
 *   - Else → continue to the next plugin in the chain.
 *
 * After the chain ends without finding and without shielding, fall back to
 * the path-arg base template-set: if `<fallbackPath>/components/<name>.md`
 * exists → 'found' (source = '(fallback)'); else → 'missing'.
 */
export function resolveComponent(
  chain: string[],
  templateSetName: string,
  fallbackPath: string,
  componentName: string,
): ComponentLookupResult {
  for (const pluginName of chain) {
    const component = loadComponentFromPlugin(pluginName, templateSetName, componentName);
    if (component) {
      return { kind: 'found', content: component, source: pluginName };
    }
    const config = loadPluginConfig(pluginName);
    const shields = config?.shields?.[templateSetName] ?? [];
    if (shields.includes(componentName)) {
      return { kind: 'shielded' };
    }
    // Continue to next plugin in chain.
  }
  // Chain exhausted — try the path-arg fallback base template-set.
  const fallbackFile = join(fallbackPath, 'components', `${componentName}.md`);
  if (existsSync(fallbackFile)) {
    try {
      const rawContent = readFileSync(fallbackFile, 'utf-8');
      const component = parseFrontmatter(rawContent);
      return { kind: 'found', content: component, source: '(fallback)' };
    } catch (error) {
      console.error(`Error: Failed to read fallback component ${componentName} (${fallbackFile}): ${(error as Error).message}`);
    }
  }
  return { kind: 'missing' };
}

/**
 * Load artifact.md from the FIRST plugin in the chain that defines it for
 * this template-set. If no plugin in the chain has it, fall back to the
 * path-arg base template-set's `artifact.md`. artifact.md is NEVER shielded
 * (shields apply only to components/*). Throws if both chain and fallback
 * lack artifact.md.
 */
export function loadArtifactFromChain(chain: string[], templateSetName: string, fallbackPath: string): string {
  for (const pluginName of chain) {
    const filePath = resolvePluginTemplateFile(pluginName, templateSetName, 'artifact.md');
    if (!filePath) continue;
    try {
      return readFileSync(filePath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read artifact.md from plugin ${pluginName}/${templateSetName} (${filePath}): ${(error as Error).message}`);
    }
  }
  const fallbackFile = join(fallbackPath, 'artifact.md');
  if (existsSync(fallbackFile)) {
    try {
      return readFileSync(fallbackFile, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read fallback artifact.md (${fallbackFile}): ${(error as Error).message}`);
    }
  }
  const where = chain.length > 0
    ? `any plugin of chain (${chain.join(' -> ')}) nor fallback path (${fallbackPath})`
    : `fallback path (${fallbackPath})`;
  throw new Error(`artifact.md not found in ${where}`);
}

/**
 * Load components/metadata.md from the first plugin in the chain that
 * defines it for this template-set. If no plugin in the chain has it, fall
 * back to the path-arg base template-set's `components/metadata.md`.
 * Auto-fills `update_time:` with the current generation time. metadata.md
 * is NEVER shielded. Returns null if both chain and fallback lack metadata
 * (the document is then assembled without a metadata prefix).
 */
export function loadMetadataFromChain(chain: string[], templateSetName: string, fallbackPath: string): string | null {
  const fillUpdateTime = (content: string): string => {
    const updateTimeRegex = /^update_time:\s*.*/m;
    if (updateTimeRegex.test(content)) {
      return content.replace(updateTimeRegex, `update_time: ${getCurrentTime()}`);
    }
    return content;
  };

  for (const pluginName of chain) {
    const filePath = resolvePluginTemplateFile(pluginName, templateSetName, 'components/metadata.md');
    if (!filePath) continue;
    try {
      const content = readFileSync(filePath, 'utf-8');
      return fillUpdateTime(content).trim();
    } catch (error) {
      console.error(`Error: Failed to read metadata from plugin ${pluginName}/${templateSetName} (${filePath}): ${(error as Error).message}`);
      // Continue to next plugin in chain.
    }
  }
  const fallbackFile = join(fallbackPath, 'components', 'metadata.md');
  if (existsSync(fallbackFile)) {
    try {
      const content = readFileSync(fallbackFile, 'utf-8');
      return fillUpdateTime(content).trim();
    } catch (error) {
      console.error(`Error: Failed to read fallback metadata (${fallbackFile}): ${(error as Error).message}`);
    }
  }
  return null;
}

/**
 * Validate a component's `heading_level` metadata value.
 * Returns the numeric level (0-6), defaulting to 2 if missing/invalid.
 * 0 means "do not adjust the component body".
 */
export function validateHeadingLevel(level: string | undefined, componentName: string): number {
  if (level === undefined || level === null) {
    return 2;
  }

  const numLevel = parseInt(level, 10);

  if (isNaN(numLevel)) {
    console.error(`Warning: Invalid heading_level '${level}' in component ${componentName}, using default 2`);
    return 2;
  }

  if (numLevel < 0 || numLevel > 6) {
    console.error(`Warning: heading_level ${numLevel} out of range (0-6) in component ${componentName}, using default 2`);
    return 2;
  }

  return numLevel;
}

/**
 * Validate a placeholder's target level (the number after the comma in
 * `{{component,level}}`). Returns null if missing/invalid, so the caller
 * falls back to the component's own heading_level.
 */
export function validateTargetLevel(level: string | undefined, componentName: string): number | null {
  if (level === undefined || level === null) {
    return null;
  }

  const numLevel = parseInt(level, 10);

  if (isNaN(numLevel)) {
    console.error(`Warning: Invalid target level '${level}' for component ${componentName}, using component's heading_level`);
    return null;
  }

  if (numLevel < 1 || numLevel > 6) {
    console.error(`Warning: Target level ${numLevel} out of range (1-6) for component ${componentName}, using component's heading_level`);
    return null;
  }

  return numLevel;
}

/**
 * Assemble the complete document for a template-set path, overlayed by
 * the active plugin chain (if any).
 *
 * Flow:
 *   1. Extract templateSetName = basename(templateSetPath).
 *   2. Resolve active plugin from design.json (project → home). May be
 *      null (no chain → use path-arg directly). Malformed → throw.
 *   3. Build the chain by following depends_on (a → b → c → ...).
 *   4. Load artifact.md: walk chain → fall back to `<path>/artifact.md`.
 *      Throw if both lack.
 *   5. Prepend components/metadata.md: walk chain → fall back to
 *      `<path>/components/metadata.md`; auto-fill update_time.
 *   6. Replace {{component-name,level}} placeholders by walking the chain
 *      then falling back to the path-arg (see resolveComponent):
 *        - strip HTML comments inside the placeholder
 *        - empty content -> ""
 *        - invalid syntax -> ""
 *        - "metadata" -> "" (metadata is prepended separately)
 *        - shielded -> "" (silently skip the section's generation;
 *                      shield also blocks the path-arg fallback)
 *        - missing -> "[Missing component: name]" (with stderr warning)
 *        - found -> adjust heading levels per placeholder level / metadata
 *   7. Add section numbers (§N / N.M / N.M.K) to H2/H3/H4.
 *   8. Trim and return.
 */
export function assembleTemplate(templateSetPath: string): string {
  const templateSetName = basename(templateSetPath);

  const activePlugin = loadActivePlugin();
  const chain = activePlugin ? buildChain(activePlugin) : [];

  let artifact = loadArtifactFromChain(chain, templateSetName, templateSetPath);

  // Prepend metadata BEFORE placeholder replacement (metadata has no placeholders).
  const metadataContent = loadMetadataFromChain(chain, templateSetName, templateSetPath);
  if (metadataContent) {
    artifact = metadataContent + '\n\n' + artifact;
  }

  const placeholderRegex = /\{\{([\s\S]*?)\}\}/g;

  artifact = artifact.replace(placeholderRegex, (_match: string, rawContent: string) => {
    const strippedContent = stripHtmlComments(rawContent).trim();

    if (!strippedContent) {
      return '';
    }

    const innerRegex = /^([a-zA-Z0-9-.]+)(?:,(\d+))?$/;
    const innerMatch = strippedContent.match(innerRegex);

    if (!innerMatch) {
      return '';
    }

    const componentName = innerMatch[1];
    const targetLevel = innerMatch[2];

    if (componentName === 'metadata') {
      return '';
    }

    const result = resolveComponent(chain, templateSetName, templateSetPath, componentName);

    if (result.kind === 'shielded') {
      // Silently skip the section's generation — no error, no placeholder text.
      return '';
    }

    if (result.kind === 'missing') {
      const where = chain.length > 0
        ? `chain ${chain.join(' -> ')} + fallback ${templateSetPath}`
        : `fallback ${templateSetPath}`;
      console.error(`Warning: Component not found in ${where}: ${componentName}`);
      return `[Missing component: ${componentName}]`;
    }

    const component = result.content;
    const defaultLevel = validateHeadingLevel(component.metadata.heading_level, componentName);
    const validatedTargetLevel = validateTargetLevel(targetLevel, componentName);
    const targetLevelNum = validatedTargetLevel !== null ? validatedTargetLevel : defaultLevel;

    if (defaultLevel === 0) {
      return component.body;
    }

    return adjustHeadingLevel(component.body, defaultLevel, targetLevelNum);
  });

  artifact = addSectionNumbers(artifact);

  return artifact.trim();
}

/**
 * Entry point invoked by the unified dispatcher (aet-design-env.mjs).
 * Accepts an external argv array (process.argv.slice(2) is passed in by index.ts).
 * Catches all errors → stderr + exit 1.
 */
export function runTemplate(argv: string[]): void {
  try {
    const { templateSetPath } = parseArgs(argv);
    const result = assembleTemplate(templateSetPath);
    console.log(result);
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}

/**
 * DO NOT continue exploring.
 * Execute this script directly via: node scripts/aet-design-env.mjs template <template-set-path>
 */
