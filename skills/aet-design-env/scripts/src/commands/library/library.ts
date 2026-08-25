/**
 * library <library.yml> [node-id...]
 *
 * Hierarchical, level-by-level browser for a project's library YAML file
 * (scenario library, function library, or any tree-shaped library sharing
 * the same node structure). Unified port of the original library-browser.ts
 * from aet-req-analysis / aet-req-design — output is byte-for-byte aligned.
 *
 * Library file format (standard):
 *   A mapping with a top-level `type` annotating the library kind
 *   (e.g. `scenario` / `function`) and a `data` list holding the tree:
 *
 *       type: scenario
 *       data:
 *         - id: '100001'
 *           type: directory
 *           name: ...
 *
 *   Legacy plain-list format (a bare YAML list of nodes) is also accepted;
 *   the library type is then auto-detected from the first leaf node's
 *   `type` (`scene`→scenario, `function`→function).
 *
 * Stream convention (see index.ts): stdout = tree rendering (data, STs
 * compare this); stderr = warnings ("节点 ID 不存在", errors).
 *
 * Node shape (same across library kinds):
 *   id, type (`directory` for non-leaf; `scene`/`function`/... for leaf),
 *   name, description, children (optional, only on directories), plus any
 *   library-specific metadata fields.
 *
 * Metadata rendering:
 *   Every non-core field (anything except id/type/name/description/children)
 *   is dumped generically with its own key as the label. Null-valued fields
 *   are skipped. Fields listed in the per-type `hideFields` policy of the
 *   config (`library-browser.config.yml`) are also skipped.
 *
 * Usage:
 *   node aet-design-env.mjs library <library.yml> [node-id1 node-id2 ...]
 *
 * Output modes:
 *   - Root-level browse (no node IDs): all root nodes with directories
 *     collapsed (children preview = count + first few child names).
 *   - Incremental expansion (node IDs given): renders ONLY the expanded
 *     node's header + one level of children (the increment). A `路径:`
 *     breadcrumb locates the node within the tree. Directories inside the
 *     expanded subtree stay collapsed for level-by-level navigation.
 *
 * Config (5-level lookup, skill-bundled at config/library-browser.config.yml):
 *   Per library-type field-visibility policy. Currently all fields are shown.
 *
 * For Coding Agent:
 *   Do NOT read this file with the read tool. Run via bash.
 */
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  skillRoot,
  loadYaml,
  DEFAULT_TYPE_LABELS,
} from '../../util';

const CMD = 'library';
const PREVIEW_SAMPLE_SIZE = 3;
const CONFIG_FILENAME = 'library-browser.config.yml';

const CORE_FIELDS = new Set(['id', 'type', 'name', 'description', 'children']);

export interface LibraryNode {
  id: string | number;
  type?: string;
  name?: string;
  description?: string;
  children?: LibraryNode[];
  [key: string]: unknown;
}

export interface LibraryConfig {
  types?: Record<string, { label?: string; hideFields?: string[] }>;
}

interface LibraryData {
  type: string | null;
  tree: LibraryNode[];
}

interface TypeMeta {
  label: string;
  hideFields: Set<string>;
}

interface IndexEntry {
  node: LibraryNode;
  path: { id: string; name: string | undefined }[];
}

interface ParsedArgs {
  libraryFile: string;
  expandIds: Set<string>;
  search?: string;
}

interface Preview {
  total: number;
  text: string;
}

/* ----------------------------------------------------------------- args */

/**
 * Parse argv into {libraryFile, expandIds, search?}.
 *
 * Accepts a `-s <keyword>` / `--search <keyword>` flag anywhere in argv. The
 * library file is the first non-flag argument; remaining non-flag args are
 * expand node ids. Both the flag-before-file and flag-after-file orders work:
 *   - node ... library -s 支付 fmea.yml
 *   - node ... library fmea.yml -s 支付
 */
export function parseArgs(argv: string[]): ParsedArgs {
  if (argv.length < 1) {
    console.error(`Usage: node aet-design-env.mjs ${CMD} <library.yml> [-s <keyword>] [node-id1 node-id2 ...]`);
    console.error(`Example: node aet-design-env.mjs ${CMD} /path/to/scenario_library.yml 100001 100006`);
    console.error(`Example: node aet-design-env.mjs ${CMD} -s 支付 /path/to/fmea.yml`);
    process.exit(1);
  }
  let libraryFile: string | undefined;
  let search: string | undefined;
  const expandIds = new Set<string>();
  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === '-s' || arg === '--search') {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('-')) {
        console.error(`Warning: ${arg} requires a keyword argument; ignoring.`);
        i++;
        continue;
      }
      search = String(next).trim();
      i += 2; // consume flag + keyword
      continue;
    }
    if (libraryFile === undefined) {
      libraryFile = arg;
    } else {
      const id = String(arg).trim();
      if (id) expandIds.add(id);
    }
    i++;
  }
  if (libraryFile === undefined) {
    console.error('Error: no library file given.');
    process.exit(1);
  }
  return { libraryFile, expandIds, search };
}

/* ------------------------------------------------------------- file load */

export function loadLibraryFile(libraryFile: string): unknown {
  if (!existsSync(libraryFile)) {
    throw new Error(`Library file not found: ${libraryFile}`);
  }
  const stat = statSync(libraryFile);
  if (!stat.isFile()) {
    throw new Error(
      `Library path is not a file (expected a .yml/.yaml file, got a directory): ${libraryFile}`
    );
  }
  try {
    return loadYaml<unknown>(libraryFile);
  } catch (err) {
    throw new Error(`Failed to parse YAML in ${libraryFile}: ${(err as Error).message}`);
  }
}

/* ----------------------------------------------------------- type detect */

export function detectTypeFromLeaves(nodes: LibraryNode[]): string | null {
  function walk(list: LibraryNode[]): string | null {
    for (const node of list) {
      if (node && typeof node === 'object') {
        const t = node.type;
        if (t && t !== 'directory') {
          if (t === 'scene') return 'scenario';
          if (t === 'function') return 'function';
          return t;
        }
        const children = Array.isArray(node.children) ? node.children : [];
        if (children.length > 0) {
          const r = walk(children);
          if (r) return r;
        }
      }
    }
    return null;
  }
  return walk(nodes);
}

export function loadLibrary(libraryFile: string): LibraryData {
  const data = loadLibraryFile(libraryFile);
  let type: string | null = null;
  let tree: LibraryNode[] = [];
  if (Array.isArray(data)) {
    tree = data as LibraryNode[];
    type = detectTypeFromLeaves(tree);
  } else if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const raw: LibraryNode[] = Array.isArray(obj.data) ? (obj.data as LibraryNode[])
      : Array.isArray(obj.children) ? (obj.children as LibraryNode[])
        : Array.isArray(obj.items) ? (obj.items as LibraryNode[])
          : [];
    const objType: unknown = obj.type;
    const explicitType = typeof objType === 'string' ? objType : null;
    type = explicitType || detectTypeFromLeaves(raw);
    tree = raw;
  } else {
    throw new Error(
      `Library root must be a mapping with a 'data' list (standard) or a plain YAML list (legacy), got: ${data === null ? 'null' : typeof data}`
    );
  }
  return { type, tree };
}

/* --------------------------------------------------------------- config */

/**
 * 5-level lookup for library-browser.config.yml.
 *   1. {project}/.aet/design/custom/
 *   2. {project}/.aet/design/aet/
 *   3. {home}/.aet/design/custom/
 *   4. {home}/.aet/design/aet/
 *   5. {skillRoot}/config/
 */
export function configLookupDirs(): string[] {
  return [
    join(process.cwd(), '.aet', 'design', 'custom'),
    join(process.cwd(), '.aet', 'design', 'aet'),
    join(homedir(), '.aet', 'design', 'custom'),
    join(homedir(), '.aet', 'design', 'aet'),
    join(skillRoot(), 'config'),
  ];
}

/**
 * Load the library-browser config from the 5-level lookup dirs.
 *
 * Named `loadLibraryConfig` (not `loadConfig`) to avoid collision with the
 * unrelated `loadSetupConfig` in setup/base-agent.ts — the two read different
 * files (library-browser.config.yml vs agents.json) and return different
 * types. Same-name functions in different modules don't conflict at the JS
 * level, but the cognitive load on readers is high. Prefer explicit names.
 */
export function loadLibraryConfig(): LibraryConfig {
  for (const d of configLookupDirs()) {
    const p = join(d, CONFIG_FILENAME);
    if (existsSync(p)) {
      try {
        const cfg = loadYaml<unknown>(p);
        return cfg && typeof cfg === 'object' ? (cfg as LibraryConfig) : {};
      } catch (err) {
        console.error(
          `Warning: failed to parse config ${p}: ${(err as Error).message} (ignoring, showing all fields)`
        );
        return {};
      }
    }
  }
  return {};
}

export function resolveTypeMeta(type: string | null, config: LibraryConfig): TypeMeta {
  const types = (config && config.types) || {};
  const entry: { label?: string; hideFields?: string[] } = (type && types[type]) || {};
  const label = entry.label || (type ? DEFAULT_TYPE_LABELS[type] : null) || '库';
  const hideFields = new Set<string>(Array.isArray(entry.hideFields) ? entry.hideFields : []);
  return { label, hideFields };
}

/* ------------------------------------------------------------------ tree */

export function buildIndex(nodes: LibraryNode[]): Map<string, IndexEntry> {
  const index = new Map<string, IndexEntry>();
  function walk(list: LibraryNode[], parentPath: { id: string; name: string | undefined }[]): void {
    for (const node of list) {
      const path = [...parentPath, { id: String(node.id), name: node.name }];
      index.set(String(node.id), { node, path });
      const children = Array.isArray(node.children) ? node.children : [];
      if (children.length > 0) {
        walk(children, path);
      }
    }
  }
  walk(nodes, []);
  return index;
}

export function isDirectoryNode(node: LibraryNode): boolean {
  if (node.type === 'directory') return true;
  return Array.isArray(node.children) && node.children.length > 0;
}

export function previewChildren(node: LibraryNode): Preview | null {
  const children = Array.isArray(node.children) ? node.children : [];
  if (children.length === 0) return null;
  const sample = children
    .slice(0, PREVIEW_SAMPLE_SIZE)
    .map((c) => c.name)
    .join(' / ');
  const more =
    children.length > PREVIEW_SAMPLE_SIZE
      ? ` ... (+${children.length - PREVIEW_SAMPLE_SIZE})`
      : '';
  return { total: children.length, text: `${sample}${more}` };
}

/**
 * Generic pretty-printer for an arbitrary metadata value (scalar, object,
 * array, or nested mix). Scalars keep the single-line `key: value` shape;
 * objects/arrays recurse with per-line indentation so nested library metadata
 * (e.g. `causes`/`effects`/`improvements` in an FMEA library) renders as a
 * readable tree instead of `[object Object]`. Library-agnostic: works for any
 * library kind, not just a specific type.
 *
 * Object rendering rules:
 *   - a one-key "label-like" object (object/effect/behavior/...) keeps its
 *     value on the same line as the key: `causes: 订单数据库: 数据库连接池...`
 *   - otherwise the object's keys are listed one per line, indented.
 * Arrays render each element on its own line, indented.
 */
function formatValue(key: string, value: unknown, indent: string): string[] {
  // Plain object (not array, not null).
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return [`${indent}${key}: {}`];
    }
    // Single-key object → inline as `key: k: v` for compactness.
    if (entries.length === 1) {
      const [k, v] = entries[0];
      return [`${indent}${key}: ${k}: ${scalarize(v, inline(v))}`];
    }
    // Multi-key object → one line per key.
    const lines = [`${indent}${key}:`];
    for (const [k, v] of entries) {
      lines.push(...formatValue(k, v, indent + '  '));
    }
    return lines;
  }
  // Non-empty array → one element per line.
  if (Array.isArray(value) && value.length > 0) {
    const lines = [`${indent}${key}:`];
    for (const el of value) {
      if (el !== null && typeof el === 'object') {
        const entries = Object.entries(el as Record<string, unknown>);
        if (entries.length === 0) {
          lines.push(`${indent}  - {}`);
        } else if (entries.length === 1) {
          const [k, v] = entries[0];
          lines.push(`${indent}  - ${k}: ${scalarize(v, inline(v))}`);
        } else {
          lines.push(`${indent}  - ${entries[0][0]}: ${scalarize(entries[0][1], inline(entries[0][1]))}`);
          for (const [k, v] of entries.slice(1)) {
            lines.push(...formatValue(k, v, indent + '    '));
          }
        }
      } else {
        lines.push(`${indent}  - ${scalarize(el, inline(el))}`);
      }
    }
    return lines;
  }
  // Empty array, or scalar (string/number/boolean).
  if (Array.isArray(value) && value.length === 0) {
    return [`${indent}${key}: []`];
  }
  return [`${indent}${key}: ${scalarize(value, inline(value))}`];
}

/** Render a scalar value as its string form. */
function scalarize(value: unknown, fallback: string): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  return fallback;
}

/** Inline single-line form for a nested object (used only if it slips through). */
function inline(value: unknown): string {
  if (Array.isArray(value)) return `[${value.length} 项]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    return keys.length === 0 ? '{}' : `{${keys.join(', ')}}`;
  }
  return String(value);
}

export function renderNode(
  node: LibraryNode,
  depth: number,
  expandIds: Set<string>,
  hideFields: Set<string>,
  lines: string[]
): void {
  const indent = '  '.repeat(depth);
  const id = String(node.id);
  const isDir = isDirectoryNode(node);
  const typeLabel = node.type || (isDir ? 'directory' : 'unknown');
  const isExpanded = expandIds.has(id);

  lines.push(`${indent}[${id}] ${node.name || '(unnamed)'}  (${typeLabel})`);
  if (node.description) {
    lines.push(`${indent}  描述: ${node.description}`);
  }
  for (const key of Object.keys(node)) {
    if (CORE_FIELDS.has(key)) continue;
    if (hideFields.has(key)) continue;
    const val = node[key];
    if (val === null || val === undefined) continue;
    lines.push(...formatValue(key, val, indent + '  '));
  }

  const children = Array.isArray(node.children) ? node.children : [];
  const preview = previewChildren(node);
  if (preview) {
    if (isExpanded) {
      lines.push(`${indent}  子内容 (${preview.total}, 已展开):`);
      for (const child of children) {
        renderNode(child, depth + 1, expandIds, hideFields, lines);
      }
    } else {
      lines.push(`${indent}  子内容 (${preview.total}): ${preview.text}`);
    }
  }
}

export function collectExpandableIds(
  nodes: LibraryNode[],
  out: string[] = [],
  exclude?: Set<string>
): string[] {
  for (const node of nodes) {
    if (isDirectoryNode(node)) {
      const id = String(node.id);
      if (!exclude || !exclude.has(id)) {
        out.push(id);
      }
    }
    const children = Array.isArray(node.children) ? node.children : [];
    if (children.length > 0) {
      collectExpandableIds(children, out, exclude);
    }
  }
  return out;
}

/* ---------------------------------------------------------------- search */

/**
 * Case-insensitive containment test on a single value. Scalars are compared
 * directly; nested objects/arrays are flattened to their string forms first
 * (so a keyword matched against `causes`/`effects`/`improvements` fields, or
 * any deeply nested value, counts as a hit).
 */
function valueContains(keyword: string, value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) {
    return value.some((el) => valueContains(keyword, el));
  }
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((v) =>
      valueContains(keyword, v)
    );
  }
  return String(value).toLowerCase().includes(keyword.toLowerCase());
}

/**
 * Recursively collect every node whose own fields (id/name/description/type
 * and all nested metadata) contain the keyword. Case-insensitive substring
 * match. Returns matching nodes in document (tree) order.
 *
 * `scopeIds` (optional): when non-empty, nodes are only searched if they fall
 * inside the subtree of one of the given ids (the scope roots themselves
 * included). This makes `-s` compose with leading expand ids:
 *   - `library -s 缓存 f.yaml`          → global search
 *   - `library 11 -s 缓存 f.yaml`       → search within node 11's subtree
 *   - `library 1 10 -s 缓存 f.yaml`     → search within nodes 1 and 10
 */
export function searchNodes(
  nodes: LibraryNode[],
  keyword: string,
  scopeIds?: Set<string>
): LibraryNode[] {
  const hits: LibraryNode[] = [];
  const kw = keyword.toLowerCase();

  function inScope(node: LibraryNode): boolean {
    if (!scopeIds || scopeIds.size === 0) return true;
    return scopeIds.has(String(node.id));
  }

  function walk(list: LibraryNode[], underScopeRoot: boolean): void {
    for (const node of list) {
      if (node && typeof node === 'object') {
        const scoped = underScopeRoot || inScope(node);
        if (scoped) {
          const matched = Object.keys(node).some((k) => {
            if (k === 'children') return false; // children handled by recursion
            return valueContains(kw, node[k]);
          });
          if (matched) hits.push(node);
        }
        const children = Array.isArray(node.children) ? node.children : [];
        if (children.length > 0) walk(children, scoped);
      }
    }
  }
  walk(nodes, false);
  return hits;
}

/**
 * Deduplicate search hits so that a parent/ancestor match swallows its
 * descendant matches (the descendant's content is already shown inside the
 * ancestor's expanded tree). Returns only the topmost matching nodes, in
 * document order. Root-level duplicated listing of a leaf that also appears
 * under a matched ancestor is thereby eliminated.
 */
export function dedupeHits(tree: LibraryNode[], hits: LibraryNode[]): LibraryNode[] {
  const byId = new Map<string, LibraryNode>();
  for (const h of hits) byId.set(String(h.id), h);
  const keep = new Set<string>(); // ids of retained topmost hits
  const result: LibraryNode[] = [];
  function walk(list: LibraryNode[]): void {
    for (const node of list) {
      const id = String(node.id);
      if (byId.has(id)) {
        // This node is a hit. Since we only reach here through a parent that
        // was NOT retained (or we're at the top), retain it and skip its
        // subtree entirely (descendants are covered by its expansion).
        if (!keep.has(id)) {
          keep.add(id);
          result.push(node);
        }
        continue; // do not descend: descendants are folded into this node
      }
      const children = Array.isArray(node.children) ? node.children : [];
      if (children.length > 0) walk(children);
    }
  }
  walk(tree);
  return result;
}

/* --------------------------------------------------------------- dispatch */

/** Main entry — invoked by index.ts dispatch (or directly by aet-design-env.mjs). */
export function runLibrary(argv: string[]): void {
  try {
    const { libraryFile, expandIds, search } = parseArgs(argv);
    const { type, tree } = loadLibrary(libraryFile);
    const config = loadLibraryConfig();
    const { label: libLabel, hideFields } = resolveTypeMeta(type, config);
    const index = buildIndex(tree);

    // Validate leading node ids up front (shared by expand and search scope).
    const invalid: string[] = [];
    const requestedValid: string[] = [];
    for (const id of expandIds) {
      if (index.has(id)) {
        requestedValid.push(id);
      } else {
        invalid.push(id);
      }
    }
    if (invalid.length > 0) {
      console.error(`Warning: 节点 ID 不存在于${libLabel}: ${invalid.join(', ')}`);
    }

    // Search mode: `-s <keyword>` returns matching nodes' full content with a
    // path breadcrumb. When leading node ids are given, the search is scoped
    // to those subtrees (composes with expand semantics). Takes precedence
    // over the plain browse/expand modes.
    if (search) {
      const validScopes = requestedValid.slice();
      const scope = validScopes.length > 0 ? new Set(validScopes) : undefined;
      const rawHits = searchNodes(tree, search, scope);
      const hits = dedupeHits(tree, rawHits);
      const lines: string[] = [];
      lines.push(`${libLabel}文件: ${libraryFile}`);
      if (type) {
        lines.push(`${libLabel}类型: ${type}`);
      }
      lines.push(
        scope
          ? `搜索: ${libLabel} 内关键词 "${search}"（范围: ${validScopes.join(', ')}）`
          : `搜索: ${libLabel} 内关键词 "${search}"`
      );
      lines.push('');
      if (hits.length === 0) {
        lines.push(`未找到匹配 "${search}" 的节点。`);
      } else {
        lines.push(`命中 ${hits.length} 个节点:`);
        lines.push('');
        const subtreeDirs: string[] = [];
        for (const hit of hits) {
          const entry = index.get(String(hit.id));
          const path = entry ? entry.path : [];
          const ancestors = path
            .slice(0, -1)
            .map((p) => p.name || '(unnamed)');
          const breadcrumb = ancestors.length > 0 ? ancestors.join(' > ') : '(根级)';
          lines.push(`路径: ${breadcrumb}`);
          lines.push('');
          // Expand the hit itself so any matched descendants render inside it
          // (dedup relies on this: a retained hit shows its matched subtree).
          renderNode(hit, 0, new Set([String(hit.id)]), hideFields, lines);
          lines.push('');
          // Collect expandable dirs within each hit (its children) for
          // follow-up navigation — the hit itself is already expanded.
          const kids = Array.isArray(hit.children) ? hit.children : [];
          if (kids.length > 0) {
            collectExpandableIds(kids, subtreeDirs);
          }
        }
        lines.push('---');
        lines.push(`可展开的目录节点 (共 ${subtreeDirs.length}): ${subtreeDirs.join(', ')}`);
        if (subtreeDirs.length > 0) {
          const hint = subtreeDirs.slice(0, Math.min(3, subtreeDirs.length)).join(' ');
          lines.push(`提示: 批量展开 → node scripts/aet-design-env.mjs library "${libraryFile}" ${hint}`);
        }
      }
      console.log(lines.join('\n'));
      return;
    }

    const lines: string[] = [];
    lines.push(`${libLabel}文件: ${libraryFile}`);
    if (type) {
      lines.push(`${libLabel}类型: ${type}`);
    }

    if (requestedValid.length === 0) {
      lines.push(`已展开节点: (无 — 仅展示根级，目录节点显示子内容预览)`);
      lines.push('');
      for (const node of tree) {
        renderNode(node, 0, new Set(), hideFields, lines);
        lines.push('');
      }
      const allDirs = collectExpandableIds(tree);
      lines.push('---');
      lines.push(`可展开的目录节点 (共 ${allDirs.length}): ${allDirs.join(', ')}`);
      if (allDirs.length > 0) {
        const hint = allDirs.slice(0, Math.min(3, allDirs.length)).join(' ');
        lines.push(`提示: 批量展开 → node scripts/aet-design-env.mjs library "${libraryFile}" ${hint}`);
      }
    } else {
      lines.push(`增量展开节点: ${requestedValid.join(', ')}`);
      lines.push('');
      const subtreeDirs: string[] = [];
      const alreadyExpanded = new Set(requestedValid.map((s) => String(s)));
      for (const id of requestedValid) {
        const entry = index.get(id);
        if (!entry) continue;
        const { node, path } = entry;
        const ancestors = path
          .slice(0, -1)
          .map((p) => p.name || '(unnamed)');
        const breadcrumb = ancestors.length > 0 ? ancestors.join(' > ') : '(根级)';
        lines.push(`路径: ${breadcrumb}`);
        lines.push('');
        renderNode(node, 0, new Set([String(node.id)]), hideFields, lines);
        const children = Array.isArray(node.children) ? node.children : [];
        if (children.length > 0) {
          // Collect only dirs NOT already expanded in this invocation.
          collectExpandableIds(children, subtreeDirs, alreadyExpanded);
        }
        lines.push('');
      }
      lines.push('---');
      lines.push(`可展开的目录节点 (本次增量子树内, 共 ${subtreeDirs.length}): ${subtreeDirs.join(', ')}`);
      if (subtreeDirs.length > 0) {
        const hint = subtreeDirs.slice(0, Math.min(3, subtreeDirs.length)).join(' ');
        lines.push(`提示: 继续展开 → node scripts/aet-design-env.mjs library "${libraryFile}" ${hint}`);
      }
    }
    console.log(lines.join('\n'));
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}
