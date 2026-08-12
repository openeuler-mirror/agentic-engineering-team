/**
 * checklist <checklist-set-path> — Assemble a checklist document from a plugin chain.
 *
 * Mirrors template's addressing logic with 3 alignments (per user m0258):
 *   1. Missing component: emit `[Missing component: name]` + stderr warning
 *      (instead of silent empty string in old assemble-checklist)
 *   2. Lookup: 2-level + path-arg fallback (instead of 5-level custom/aet)
 *   3. Plugin chain + shield: full chain walk with passthrough shields
 *      (instead of no chain/no shields in old assemble-checklist)
 *
 * What stays specific to checklist:
 *   - Skeleton file: `checklist.md` (not `artifact.md`)
 *   - Component source: frontmatter `metadata.checklist` field (not body)
 *   - Placeholder syntax: `{{name}}` (no `,level` — simpler than template's)
 *   - No heading_level adjustment, no addSectionNumbers, no metadata prepend
 *     (checklist content is metadata field text, not layered heading body)
 *
 * Plugin structure (same as template):
 *   `<pluginRoot>/{plugin.json, <checklistSet>/{checklist.md, components/...}}`
 * 2-level lookup (project > home): `{project}/.aet/design/<plugin>/<checklistSet>/<rel>`
 *   → `{home}/.aet/design/<plugin>/<checklistSet>/<rel>`
 * Path-arg terminal fallback: `<checklistSetPath>/<rel>` (single level)
 *
 * Usage:  node scripts/aet-design-env.mjs checklist <checklist-set-path>
 * Example:
 *   node scripts/aet-design-env.mjs checklist skills/aet-req-analysis/scripts/_templates/req-analysis
 *
 * Stream convention: stdout = assembled checklist Markdown; stderr = warnings + errors.
 */
import { readFileSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  resolvePluginTemplateFile,
  loadPluginConfig,
  loadActivePlugin,
  parseFrontmatter,
  stripHtmlComments,
} from '../../util';
import { buildChain } from '../template/template';

export interface ParsedChecklistArgs {
  checklistSetPath: string;
}

export type ChecklistComponentLookupResult =
  | { kind: 'found'; content: string; source: string }
  | { kind: 'shielded' }
  | { kind: 'missing' };

/**
 * Parse args. Path is required — exits with usage message if missing.
 */
export function parseArgs(argv: string[]): ParsedChecklistArgs {
  if (argv.length < 1) {
    console.error('Usage: checklist <checklist-set-path>');
    console.error('Example: checklist skills/aet-req-analysis/references/_templates/req-analysis');
    process.exit(1);
  }
  return { checklistSetPath: argv[0] };
}

/**
 * Load a checklist component (components/<name>.md) from a specific plugin.
 * Returns the `metadata.checklist` field as a string, or null if:
 *   - the file is missing at any 2-level lookup
 *   - the file is unreadable
 *   - the file has no `checklist:` frontmatter field
 *   - the `checklist:` field is not a non-empty string
 */
export function loadChecklistComponentFromPlugin(
  pluginName: string,
  checklistSetName: string,
  componentName: string,
): string | null {
  const relativePath = `components/${componentName}.md`;
  const filePath = resolvePluginTemplateFile(pluginName, checklistSetName, relativePath);
  if (!filePath) return null;
  try {
    const content = readFileSync(filePath, 'utf-8');
    const parsed = parseFrontmatter(content);
    const checklist = parsed.metadata.checklist;
    if (typeof checklist !== 'string' || checklist.trim().length === 0) return null;
    return checklist;
  } catch (error) {
    console.error(`Error: Failed to read component ${componentName} from plugin ${pluginName} (${filePath}): ${(error as Error).message}`);
    return null;
  }
}

/**
 * Walk the plugin chain looking for a checklist component, applying passthrough
 * shields (mirror of template's resolveComponent, but content is a string).
 *
 * At each plugin P (in chain order):
 *   - If P has the component → use P's copy (P's own shield exempt from itself).
 *   - Else if P shields the component → STOP, return 'shielded'.
 *   - Else → continue to next plugin in chain.
 *
 * If chain ends without finding and without shielding → fall back to path-arg
 * `<fallbackPath>/components/<name>.md` (single level). If found there → 'found'
 * with source='(fallback)'; else 'missing'.
 */
export function resolveChecklist(
  chain: string[],
  checklistSetName: string,
  fallbackPath: string,
  componentName: string,
): ChecklistComponentLookupResult {
  for (const pluginName of chain) {
    const content = loadChecklistComponentFromPlugin(pluginName, checklistSetName, componentName);
    if (content !== null) {
      return { kind: 'found', content, source: pluginName };
    }
    const config = loadPluginConfig(pluginName);
    const shields = config?.shields?.[checklistSetName] ?? [];
    if (shields.includes(componentName)) {
      return { kind: 'shielded' };
    }
    // Continue to next plugin in chain.
  }
  // Path-arg fallback.
  const fallbackFile = join(fallbackPath, 'components', `${componentName}.md`);
  if (existsSync(fallbackFile)) {
    try {
      const content = readFileSync(fallbackFile, 'utf-8');
      const parsed = parseFrontmatter(content);
      const checklist = parsed.metadata.checklist;
      if (typeof checklist === 'string' && checklist.trim().length > 0) {
        return { kind: 'found', content: checklist, source: '(fallback)' };
      }
    } catch (error) {
      console.error(`Error: Failed to read fallback component ${componentName} (${fallbackFile}): ${(error as Error).message}`);
    }
  }
  return { kind: 'missing' };
}

/**
 * Load checklist.md (the skeleton) from the first plugin in the chain that
 * has it; if chain exhausted, fall back to `<fallbackPath>/checklist.md`.
 * Throws if both chain + fallback lack it.
 */
export function loadChecklistFromChain(
  chain: string[],
  checklistSetName: string,
  fallbackPath: string,
): string {
  for (const pluginName of chain) {
    const filePath = resolvePluginTemplateFile(pluginName, checklistSetName, 'checklist.md');
    if (filePath) {
      try {
        return readFileSync(filePath, 'utf-8');
      } catch (error) {
        throw new Error(`Failed to read ${filePath}: ${(error as Error).message}`);
      }
    }
  }
  // Path-arg fallback.
  const fallbackFile = join(fallbackPath, 'checklist.md');
  if (existsSync(fallbackFile)) {
    try {
      return readFileSync(fallbackFile, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read ${fallbackFile}: ${(error as Error).message}`);
    }
  }
  const where = chain.length > 0
    ? `chain ${chain.join(' -> ')} + fallback ${fallbackPath}`
    : `fallback ${fallbackPath}`;
  throw new Error(`checklist.md not found in any plugin of ${where}`);
}

/**
 * Assemble the complete checklist document for a plugin chain.
 *
 * Flow:
 *   1. Resolve active plugin from design.json (project > home). If missing,
 *      use empty chain (use path-arg directly, no shields, no error).
 *   2. Build the chain (cycle + broken-dep detection).
 *   3. Load checklist.md from first plugin in chain → fallback to path-arg.
 *      Throws if both lack.
 *   4. Replace {{component-name}} placeholders by walking the chain:
 *        - At each plugin P, if P has the component → use P's copy
 *          (P's own copy is exempt from P's own shield).
 *        - Else if P shields the component → STOP, return '' (silent skip
 *          — passthrough shield blocks all downstream plugins AND path-arg
 *          fallback).
 *        - Else continue to the next plugin in the chain.
 *      If chain ends without finding and without shielding → emit
 *      "[Missing component: name]" + stderr warning (aligned with template).
 *   5. Trim and return.
 *
 * No heading_level adjustment, no section numbering, no metadata prepend
 * (checklist content is metadata field text, not layered heading body).
 */
export function assembleChecklist(checklistSetPath: string): string {
  const checklistSetName = basename(checklistSetPath);
  const activePlugin = loadActivePlugin();
  const chain = activePlugin ? buildChain(activePlugin) : [];

  let checklist = loadChecklistFromChain(chain, checklistSetName, checklistSetPath);

  const placeholderRegex = /\{\{([\s\S]*?)\}\}/g;

  checklist = checklist.replace(placeholderRegex, (_match: string, rawContent: string) => {
    const strippedContent = stripHtmlComments(rawContent).trim();
    if (!strippedContent) return '';

    const innerRegex = /^([a-zA-Z0-9-.]+)$/;
    const innerMatch = strippedContent.match(innerRegex);
    if (!innerMatch) return '';

    const componentName = innerMatch[1];

    const result = resolveChecklist(chain, checklistSetName, checklistSetPath, componentName);

    if (result.kind === 'shielded') {
      return '';
    }
    if (result.kind === 'missing') {
      const where = chain.length > 0
        ? `chain ${chain.join(' -> ')} + fallback ${checklistSetPath}`
        : `fallback ${checklistSetPath}`;
      console.error(`Warning: Component not found in ${where}: ${componentName}`);
      return `[Missing component: ${componentName}]`;
    }
    return result.content;
  });

  return checklist.trim();
}

/**
 * Entry point invoked by the unified dispatcher (aet-design-env.mjs).
 * Catches all errors → stderr + exit 1.
 */
export function runChecklist(argv: string[]): void {
  try {
    const { checklistSetPath } = parseArgs(argv);
    const result = assembleChecklist(checklistSetPath);
    console.log(result);
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}
