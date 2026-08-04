import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  isDirectoryNode,
  previewChildren,
  detectTypeFromLeaves,
  buildIndex,
  collectExpandableIds,
  resolveTypeMeta,
  renderNode,
  loadLibrary,
} from './library-browser';
import type { LibraryNode, LibraryConfig } from './library-browser';

describe('isDirectoryNode', () => {
  it('treats type=directory as a directory', () => {
    expect(isDirectoryNode({ id: '1', type: 'directory', name: 'dir' })).toBe(true);
  });

  it('treats a node with non-empty children as a directory', () => {
    expect(isDirectoryNode({ id: '1', name: 'dir', children: [{ id: '2', name: 'c' }] })).toBe(true);
  });

  it('treats a leaf (scene) node as non-directory', () => {
    expect(isDirectoryNode({ id: '2', type: 'scene', name: 'leaf' })).toBe(false);
  });

  it('treats a node with empty children as non-directory', () => {
    expect(isDirectoryNode({ id: '1', name: 'dir', children: [] })).toBe(false);
  });
});

describe('previewChildren', () => {
  it('returns null when there are no children', () => {
    expect(previewChildren({ id: '1', name: 'leaf' })).toBeNull();
  });

  it('samples few children without a +N suffix', () => {
    const node: LibraryNode = { id: '1', name: 'd', children: [{ id: '2', name: 'a' }, { id: '3', name: 'b' }] };
    const r = previewChildren(node);
    expect(r?.total).toBe(2);
    expect(r?.text).toBe('a / b');
  });

  it('appends +N when children exceed the sample size', () => {
    const children: LibraryNode[] = [
      { id: '2', name: 'a' }, { id: '3', name: 'b' }, { id: '4', name: 'c' }, { id: '5', name: 'd' },
    ];
    const r = previewChildren({ id: '1', name: 'd', children });
    expect(r?.total).toBe(4);
    expect(r?.text).toBe('a / b / c ... (+1)');
  });
});

describe('detectTypeFromLeaves', () => {
  it('maps a scene leaf to scenario', () => {
    expect(detectTypeFromLeaves([{ id: '1', type: 'directory', name: 'd', children: [{ id: '2', type: 'scene', name: 's' }] }])).toBe('scenario');
  });

  it('maps a function leaf to function', () => {
    expect(detectTypeFromLeaves([{ id: '2', type: 'function', name: 'f' }])).toBe('function');
  });

  it('passes through an unknown leaf type', () => {
    expect(detectTypeFromLeaves([{ id: '3', type: 'custom', name: 'x' }])).toBe('custom');
  });

  it('returns null when only directories exist', () => {
    expect(detectTypeFromLeaves([{ id: '1', type: 'directory', name: 'd', children: [] }])).toBeNull();
  });
});

describe('buildIndex', () => {
  it('indexes all nodes with their ancestor path', () => {
    const tree: LibraryNode[] = [
      { id: '1', name: 'root', children: [{ id: '2', name: 'child' }] },
    ];
    const idx = buildIndex(tree);
    expect(idx.size).toBe(2);
    expect(idx.get('1')?.path.map((p) => p.name)).toEqual(['root']);
    expect(idx.get('2')?.path.map((p) => p.name)).toEqual(['root', 'child']);
  });
});

describe('collectExpandableIds', () => {
  it('collects directory ids recursively, skipping leaves', () => {
    const tree: LibraryNode[] = [
      { id: '1', type: 'directory', name: 'd1', children: [
        { id: '2', type: 'directory', name: 'd2', children: [{ id: '3', type: 'scene', name: 'leaf' }] },
      ]},
      { id: '4', type: 'scene', name: 'leaf2' },
    ];
    expect(collectExpandableIds(tree)).toEqual(['1', '2']);
  });

  it('returns an empty list for an all-leaf tree', () => {
    expect(collectExpandableIds([{ id: '1', type: 'scene', name: 's' }])).toEqual([]);
  });
});

describe('resolveTypeMeta', () => {
  it('uses the config label when present', () => {
    const cfg: LibraryConfig = { types: { scenario: { label: 'Custom' } } };
    expect(resolveTypeMeta('scenario', cfg).label).toBe('Custom');
    expect(resolveTypeMeta('scenario', cfg).hideFields.size).toBe(0);
  });

  it('falls back to the default label for known kinds', () => {
    expect(resolveTypeMeta('function', {}).label).toBe('功能库');
  });

  it('falls back to 库 for an unknown type', () => {
    expect(resolveTypeMeta('custom', {}).label).toBe('库');
  });

  it('falls back to 库 for a null type', () => {
    expect(resolveTypeMeta(null, {}).label).toBe('库');
  });

  it('honors hideFields from config', () => {
    const cfg: LibraryConfig = { types: { scenario: { hideFields: ['actor'] } } };
    expect(resolveTypeMeta('scenario', cfg).hideFields.has('actor')).toBe(true);
  });
});

describe('renderNode', () => {
  it('emits the [id] name (type) header plus description', () => {
    const lines: string[] = [];
    renderNode({ id: '1', type: 'scene', name: 'My Scene', description: 'A desc' }, 0, new Set(), new Set(), lines);
    expect(lines.some((l) => l.includes('[1] My Scene') && l.includes('(scene)'))).toBe(true);
    expect(lines.some((l) => l.includes('描述: A desc'))).toBe(true);
  });

  it('dumps non-core metadata, skipping core fields', () => {
    const lines: string[] = [];
    const node: LibraryNode = { id: '1', type: 'scene', name: 'S', description: 'd', actor: 'user', children: [] };
    renderNode(node, 0, new Set(), new Set(), lines);
    expect(lines.some((l) => l.includes('actor: user'))).toBe(true);
    expect(lines.some((l) => l.startsWith('  id:'))).toBe(false);
    expect(lines.some((l) => l.startsWith('  children:'))).toBe(false);
  });

  it('collapses directory children as a preview when not expanded', () => {
    const lines: string[] = [];
    const node: LibraryNode = { id: '1', type: 'directory', name: 'dir', children: [{ id: '2', name: 'a' }] };
    renderNode(node, 0, new Set(), new Set(), lines);
    expect(lines.some((l) => l.includes('子内容 (1): a'))).toBe(true);
  });

  it('expands children when the node id is in expandIds', () => {
    const lines: string[] = [];
    const node: LibraryNode = { id: '1', type: 'directory', name: 'dir', children: [{ id: '2', type: 'scene', name: 'child' }] };
    renderNode(node, 0, new Set(['1']), new Set(), lines);
    expect(lines.some((l) => l.includes('已展开'))).toBe(true);
    expect(lines.some((l) => l.includes('[2] child') && l.includes('(scene)'))).toBe(true);
  });
});

describe('loadLibrary (integration with temp yaml files)', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lib-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('loads the standard { type, data } format', () => {
    const file = join(dir, 'lib.yml');
    writeFileSync(file, 'type: scenario\ndata:\n  - id: "1"\n    type: directory\n    name: root\n');
    const { type, tree } = loadLibrary(file);
    expect(type).toBe('scenario');
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('root');
  });

  it('auto-detects the type from a legacy plain list', () => {
    const file = join(dir, 'lib.yml');
    writeFileSync(file, '- id: "1"\n  type: scene\n  name: s\n');
    const { type, tree } = loadLibrary(file);
    expect(type).toBe('scenario');
    expect(tree[0].name).toBe('s');
  });

  it('throws when the library file is missing', () => {
    expect(() => loadLibrary(join(dir, 'nope.yml'))).toThrow(/not found/);
  });

  it('throws on malformed YAML root (scalar)', () => {
    const file = join(dir, 'lib.yml');
    writeFileSync(file, 'just a string\n');
    expect(() => loadLibrary(file)).toThrow(/mapping with a 'data' list/);
  });
});
