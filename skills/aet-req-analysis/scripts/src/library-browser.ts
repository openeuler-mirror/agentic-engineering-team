/**
 * Library Browser — hierarchical, level-by-level browser for a project's
 * library YAML file (scenario library, function library, or any tree-shaped
 * library sharing the same node structure).
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
 *           ...
 *
 *   Legacy plain-list format (a bare YAML list of nodes) is also accepted
 *   for backward compatibility; the library type is then auto-detected from
 *   the first leaf node's `type` (`scene`→scenario, `function`→function).
 *
 * Node shape (same across library kinds):
 *   id, type (`directory` for non-leaf; `scene`/`function`/... for leaf),
 *   name, description, children (optional, only on directories), plus any
 *   library-specific metadata fields (e.g. `actor` for scenarios;
 *   `规格`/`约束`/`无规格原因`/`无约束原因` for functions).
 *
 * Metadata rendering:
 *   Every non-core field on a node (anything except id/type/name/description/
 *   children) is dumped generically with its own key as the label. Null-valued
 *   fields are skipped (so e.g. `无规格原因: null` is hidden when 规格 is
 *   actually set). Fields listed in the per-type `hideFields` policy of the
 *   bundled config (`library-browser.config.yml`) are also skipped —
 *   currently empty, reserved for future per-type hiding.
 *
 * Usage:
 *   node library-browser.mjs <library.yml> [node-id1 node-id2 ...]
 *
 * Examples:
 *   node library-browser.mjs /path/to/scenario_library.yml
 *   node library-browser.mjs /path/to/scenario_library.yml 100001
 *   node library-browser.mjs /path/to/function_library.yml 1001 1006
 *
 * Output modes:
 *   - Root-level browse (no node IDs): all root nodes with directories
 *     collapsed (children preview = count + first few child names).
 *   - Incremental expansion (node IDs given): renders ONLY the expanded
 *     node's header + one level of children (the increment). A `路径:`
 *     breadcrumb locates the node within the tree. Directories inside the
 *     expanded subtree stay collapsed for level-by-level navigation.
 *
 * Config (optional, skill-bundled at scripts/library-browser.config.yml):
 *   Per library-type field-visibility policy. Currently all fields are shown
 *   (empty hideFields) — the file exists to reserve the capability.
 *
 * For Coding Agent:
 *   Do NOT read this file with the read tool. Run it directly via bash.
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CMD = 'library-browser';
const CONFIG_PATH = join(__dirname, 'library-browser.config.yml');
const PREVIEW_SAMPLE_SIZE = 3;

const CORE_FIELDS = new Set(['id', 'type', 'name', 'description', 'children']);
const DEFAULT_TYPE_LABELS: Record<string, string> = {
  scenario: '场景库',
  function: '功能库',
};

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
}

interface Preview {
  total: number;
  text: string;
}

export function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error(`Usage: node ${CMD}.mjs <library.yml> [node-id1 node-id2 ...]`);
    console.error(`Example: node ${CMD}.mjs /path/to/scenario_library.yml 100001 100006`);
    process.exit(1);
  }
  const libraryFile = args[0];
  const expandIds = new Set(
    args.slice(1).map((s) => String(s).trim()).filter(Boolean)
  );
  return { libraryFile, expandIds };
}

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
  const content = readFileSync(libraryFile, 'utf-8');
  let data: unknown;
  try {
    data = yaml.load(content);
  } catch (err) {
    throw new Error(`Failed to parse YAML in ${libraryFile}: ${(err as Error).message}`);
  }
  return data;
}

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

export function loadConfig(): LibraryConfig {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    const cfg = yaml.load(readFileSync(CONFIG_PATH, 'utf-8'));
    return cfg && typeof cfg === 'object' ? (cfg as LibraryConfig) : {};
  } catch (err) {
    console.error(
      `Warning: failed to parse config ${CONFIG_PATH}: ${(err as Error).message} (ignoring, showing all fields)`
    );
    return {};
  }
}

export function resolveTypeMeta(type: string | null, config: LibraryConfig): TypeMeta {
  const types = (config && config.types) || {};
  const entry: { label?: string; hideFields?: string[] } = (type && types[type]) || {};
  const label = entry.label || (type ? DEFAULT_TYPE_LABELS[type] : null) || '库';
  const hideFields = new Set<string>(Array.isArray(entry.hideFields) ? entry.hideFields : []);
  return { label, hideFields };
}

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
    lines.push(`${indent}  ${key}: ${String(val)}`);
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

export function collectExpandableIds(nodes: LibraryNode[], out: string[] = []): string[] {
  for (const node of nodes) {
    if (isDirectoryNode(node)) {
      out.push(String(node.id));
    }
    const children = Array.isArray(node.children) ? node.children : [];
    if (children.length > 0) {
      collectExpandableIds(children, out);
    }
  }
  return out;
}

function main(): void {
  try {
    const { libraryFile, expandIds } = parseArgs();
    const { type, tree } = loadLibrary(libraryFile);
    const config = loadConfig();
    const { label: libLabel, hideFields } = resolveTypeMeta(type, config);
    const index = buildIndex(tree);

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
        lines.push(`提示: 批量展开 → node "${process.argv[1]}" "${libraryFile}" ${hint}`);
      }
    } else {
      lines.push(`增量展开节点: ${requestedValid.join(', ')}`);
      lines.push('');
      const subtreeDirs: string[] = [];
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
          collectExpandableIds(children, subtreeDirs);
        }
        lines.push('');
      }
      lines.push('---');
      lines.push(`可展开的目录节点 (本次增量子树内, 共 ${subtreeDirs.length}): ${subtreeDirs.join(', ')}`);
      if (subtreeDirs.length > 0) {
        const hint = subtreeDirs.slice(0, Math.min(3, subtreeDirs.length)).join(' ');
        lines.push(`提示: 继续展开 → node "${process.argv[1]}" "${libraryFile}" ${hint}`);
      }
    }
    console.log(lines.join('\n'));
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}

function isMain(): boolean {
  try {
    return process.argv[1] === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isMain()) {
  main();
}

/**
 * DO NOT continue exploring by reading this file.
 * Execute it directly via bash with the library yml path (and optional node IDs to expand).
 */
