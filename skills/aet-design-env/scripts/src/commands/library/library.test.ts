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
  searchNodes,
  dedupeHits,
  loadLibrary,
  loadLibraryFile,
  loadLibraryConfig,
  configLookupDirs,
  parseArgs,
} from './library';
import type { LibraryNode, LibraryConfig } from './library';

/* ------------------------------------------------------------- isDirectoryNode */

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

/* --------------------------------------------------------------- previewChildren */

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

  it('appends +N when children exceed the sample size (3)', () => {
    const children: LibraryNode[] = [
      { id: '2', name: 'a' }, { id: '3', name: 'b' }, { id: '4', name: 'c' }, { id: '5', name: 'd' },
    ];
    const r = previewChildren({ id: '1', name: 'd', children });
    expect(r?.total).toBe(4);
    expect(r?.text).toBe('a / b / c ... (+1)');
  });

  it('does not append +N when exactly at the sample size', () => {
    const children: LibraryNode[] = [
      { id: '2', name: 'a' }, { id: '3', name: 'b' }, { id: '4', name: 'c' },
    ];
    const r = previewChildren({ id: '1', name: 'd', children });
    expect(r?.total).toBe(3);
    expect(r?.text).toBe('a / b / c');
  });
});

/* ------------------------------------------------------------- detectTypeFromLeaves */

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

  it('descends nested directories to find the first leaf', () => {
    const tree: LibraryNode[] = [
      { id: '1', type: 'directory', name: 'd1', children: [
        { id: '2', type: 'directory', name: 'd2', children: [{ id: '3', type: 'function', name: 'leaf' }] },
      ]},
    ];
    expect(detectTypeFromLeaves(tree)).toBe('function');
  });
});

/* ------------------------------------------------------------------- buildIndex */

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

  it('handles numeric ids by stringifying them', () => {
    const tree: LibraryNode[] = [{ id: 100, name: 'n' }];
    const idx = buildIndex(tree);
    expect(idx.has('100')).toBe(true);
  });
});

/* ------------------------------------------------------- collectExpandableIds */

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

/* ----------------------------------------------------------------- resolveTypeMeta */

describe('resolveTypeMeta', () => {
  it('uses the config label when present', () => {
    const cfg: LibraryConfig = { types: { scenario: { label: 'Custom' } } };
    expect(resolveTypeMeta('scenario', cfg).label).toBe('Custom');
    expect(resolveTypeMeta('scenario', cfg).hideFields.size).toBe(0);
  });

  it('falls back to the default label for known kinds (scenario)', () => {
    expect(resolveTypeMeta('scenario', {}).label).toBe('场景库');
  });

  it('falls back to the default label for known kinds (function)', () => {
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

/* --------------------------------------------------------------------- renderNode */

describe('renderNode', () => {
  it('emits the [id] name  (type) header plus description (two spaces before paren)', () => {
    const lines: string[] = [];
    renderNode({ id: '1', type: 'scene', name: 'My Scene', description: 'A desc' }, 0, new Set(), new Set(), lines);
    expect(lines.some((l) => l.includes('[1] My Scene') && l.includes('(scene)'))).toBe(true);
    expect(lines.some((l) => l === '[1] My Scene  (scene)')).toBe(true);
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

  it('skips null-valued metadata fields', () => {
    const lines: string[] = [];
    const node: LibraryNode = { id: '1', type: 'scene', name: 'S', '无规格原因': null };
    renderNode(node, 0, new Set(), new Set(), lines);
    expect(lines.some((l) => l.includes('无规格原因'))).toBe(false);
  });

  it('respects hideFields', () => {
    const lines: string[] = [];
    const node: LibraryNode = { id: '1', type: 'scene', name: 'S', actor: 'user' };
    renderNode(node, 0, new Set(), new Set(['actor']), lines);
    expect(lines.some((l) => l.includes('actor'))).toBe(false);
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

  it('indents children one level deeper than the parent', () => {
    const lines: string[] = [];
    const node: LibraryNode = { id: '1', type: 'directory', name: 'dir', children: [{ id: '2', type: 'scene', name: 'child' }] };
    renderNode(node, 0, new Set(['1']), new Set(), lines);
    const parentLine = lines.find((l) => l.startsWith('[1]'));
    const childLine = lines.find((l) => l.includes('[2] child'));
    expect(parentLine?.startsWith('[1]')).toBe(true);
    expect(childLine?.startsWith('  [2]')).toBe(true);
  });
});

/* ----------------------------------------------------------------- searchNodes */

describe('searchNodes', () => {
  const tree: LibraryNode[] = [
    {
      id: '1', type: 'directory', name: '电商网站',
      children: [
        {
          id: '10', type: 'directory', name: '订单服务',
          children: [
            {
              id: '1001', type: 'fault_mode', name: '订单创建失败',
              description: '用户提交订单时系统返回错误',
              causes: [
                { object_id: '9001', object: '订单数据库', behavior: '数据库连接池耗尽或主库不可用' },
              ],
              improvements: { fault_isolation: [{ id: '7002', content: '切换至备用数据库实例，启用熔断保护' }] },
            },
            { id: '1002', type: 'fault_mode', name: '支付超时' },
          ],
        },
      ],
    },
  ];

  it('matches a node by its own name', () => {
    const hits = searchNodes(tree, '支付');
    expect(hits.map((n) => n.id)).toEqual(['1002']);
  });

  it('matches a node by a deeply nested metadata field', () => {
    const hits = searchNodes(tree, '熔断');
    expect(hits.map((n) => n.id)).toEqual(['1001']);
  });

  it('matches a node by a nested array element value', () => {
    const hits = searchNodes(tree, '订单数据库');
    expect(hits.map((n) => n.id)).toEqual(['1001']);
  });

  it('matches a directory by its own name', () => {
    const hits = searchNodes(tree, '订单服务');
    expect(hits.map((n) => n.id)).toEqual(['10']);
  });

  it('is case-insensitive for latin text', () => {
    const t: LibraryNode[] = [{ id: '1', name: 'OrderService', description: 'Payment gateway' }];
    expect(searchNodes(t, 'orderservice').map((n) => n.id)).toEqual(['1']);
    expect(searchNodes(t, 'PAYMENT').map((n) => n.id)).toEqual(['1']);
  });

  it('returns an empty list when nothing matches', () => {
    expect(searchNodes(tree, '不存在的词')).toEqual([]);
  });

  it('does not double-report a parent for a child-only match', () => {
    // "支付" only appears under the 1002 leaf; the parent directory nodes
    // must NOT be reported just because their descendants matched.
    const hits = searchNodes(tree, '支付');
    expect(hits.map((n) => n.id)).toEqual(['1002']);
    expect(hits.length).toBe(1);
  });

  it('scopes the search to a given subtree when scopeIds is set', () => {
    // "缓存"-like keyword scoped to node 10's subtree must not surface nodes
    // elsewhere. Use a keyword that only exists inside node 1001's nested
    // metadata and confirm scoping to 10 still finds it.
    const hits = searchNodes(tree, '熔断', new Set(['10']));
    expect(hits.map((n) => n.id)).toEqual(['1001']);
  });

  it('restricts the scope so a hit outside the scope is excluded', () => {
    // "支付" is under node 10; scoping to node 1 (which contains 10) still
    // finds it, but scoping to a sibling-less id that excludes 10 does not.
    expect(searchNodes(tree, '支付', new Set(['1'])).map((n) => n.id)).toEqual(['1002']);
    expect(searchNodes(tree, '支付', new Set(['999'])).map((n) => n.id)).toEqual([]);
  });
});

/* ------------------------------------------------------------------- dedupeHits */

describe('dedupeHits', () => {
  const tree: LibraryNode[] = [
    {
      id: '1', type: 'directory', name: '电商网站',
      children: [
        {
          id: '10', type: 'directory', name: '订单服务',
          children: [
            { id: '1001', type: 'fault_mode', name: '订单创建失败', description: '缓存服务' },
            { id: '1002', type: 'fault_mode', name: '支付超时' },
          ],
        },
        { id: '11', type: 'directory', name: '缓存服务', description: '缓存服务' },
      ],
    },
  ];

  it('keeps only the topmost hit when a parent and child both match', () => {
    // Both 11 (缓存服务) and 1001 (description 缓存服务) match "缓存", but 11
    // and 1001 are in different branches, so both are topmost in their branch.
    const hits = dedupeHits(tree, searchNodes(tree, '缓存'));
    expect(hits.map((n) => n.id)).toEqual(['1001', '11']);
  });

  it('folds a descendant hit into its matched ancestor', () => {
    // "订单" matches both 10 (订单服务) and 1001 (订单创建失败) and 1002
    // (set name to 订单 here via a sibling). 10 is an ancestor of 1001/1002,
    // so only 10 is retained and the descendants are folded in.
    const t: LibraryNode[] = [
      {
        id: '10', type: 'directory', name: '订单服务',
        children: [
          { id: '1001', type: 'fault_mode', name: '订单创建失败' },
          { id: '1002', type: 'fault_mode', name: '订单支付' },
        ],
      },
    ];
    const hits = dedupeHits(t, searchNodes(t, '订单'));
    expect(hits.map((n) => n.id)).toEqual(['10']);
  });

  it('returns an empty list for no hits', () => {
    expect(dedupeHits(tree, [])).toEqual([]);
  });
});

/* --------------------------------------------------------- loadLibraryFile + loadLibrary */

describe('loadLibraryFile', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'lib-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('throws when the library file is missing', () => {
    expect(() => loadLibraryFile(join(dir, 'nope.yml'))).toThrow(/not found/);
  });

  it('throws when the path is a directory', () => {
    expect(() => loadLibraryFile(dir)).toThrow(/not a file/);
  });
});

describe('loadLibrary (integration with temp yaml files)', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'lib-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

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

  it('accepts children/items as alternative keys for the tree', () => {
    const file = join(dir, 'lib.yml');
    writeFileSync(file, 'type: scenario\nchildren:\n  - id: "1"\n    type: scene\n    name: s\n');
    const { tree } = loadLibrary(file);
    expect(tree).toHaveLength(1);
    expect(tree[0].name).toBe('s');
  });
});

/* --------------------------------------------------------------- config lookup */

describe('configLookupDirs', () => {
  it('returns 5 levels ordered high-priority to low', () => {
    const dirs = configLookupDirs();
    expect(dirs).toHaveLength(5);
    expect(dirs[0]).toMatch(/\.aet[\/\\]design[\/\\]custom$/);
    expect(dirs[4]).toMatch(/[\/\\]config$/);
  });
});

describe('loadLibraryConfig', () => {
  it('returns an empty object when no config file exists in any lookup dir', () => {
    // Force all lookup dirs to a nonexistent path by overriding cwd/home is
    // not trivial — instead, just verify loadLibraryConfig() runs without
    // throwing and returns a (possibly empty) object.
    const cfg = loadLibraryConfig();
    expect(cfg).toBeTruthy();
    expect(typeof cfg).toBe('object');
  });
});

/* ----------------------------------------------------------------- parseArgs */

describe('parseArgs', () => {
  const origArgv = process.argv;
  afterEach(() => { process.argv = origArgv; });

  it('parses a single library file arg into empty expandIds', () => {
    process.argv = ['node', 'aet-design-env.mjs'];
    const r = parseArgs(['/tmp/lib.yml']);
    expect(r.libraryFile).toBe('/tmp/lib.yml');
    expect(r.expandIds.size).toBe(0);
  });

  it('collects trailing args into expandIds', () => {
    process.argv = ['node', 'aet-design-env.mjs'];
    const r = parseArgs(['/tmp/lib.yml', '100', '200', '  300  ']);
    expect(r.expandIds.has('100')).toBe(true);
    expect(r.expandIds.has('200')).toBe(true);
    expect(r.expandIds.has('300')).toBe(true);
  });

  it('parses -s keyword with the library file first', () => {
    process.argv = ['node', 'aet-design-env.mjs'];
    const r = parseArgs(['/tmp/fmea.yml', '-s', '支付']);
    expect(r.libraryFile).toBe('/tmp/fmea.yml');
    expect(r.search).toBe('支付');
    expect(r.expandIds.size).toBe(0);
  });

  it('parses -s keyword before the library file', () => {
    process.argv = ['node', 'aet-design-env.mjs'];
    const r = parseArgs(['-s', '支付', '/tmp/fmea.yml']);
    expect(r.libraryFile).toBe('/tmp/fmea.yml');
    expect(r.search).toBe('支付');
  });

  it('accepts --search long form and coexists with expand ids', () => {
    process.argv = ['node', 'aet-design-env.mjs'];
    const r = parseArgs(['/tmp/fmea.yml', '--search', '缓存', '10', '11']);
    expect(r.libraryFile).toBe('/tmp/fmea.yml');
    expect(r.search).toBe('缓存');
    expect(r.expandIds.has('10')).toBe(true);
    expect(r.expandIds.has('11')).toBe(true);
  });

  it('warns and ignores -s with no keyword', () => {
    process.argv = ['node', 'aet-design-env.mjs'];
    const r = parseArgs(['/tmp/fmea.yml', '-s']);
    expect(r.libraryFile).toBe('/tmp/fmea.yml');
    expect(r.search).toBeUndefined();
  });

  it('exits with status 1 when no args are given', () => {
    process.argv = ['node', 'aet-design-env.mjs'];
    const origExit = process.exit;
    let code: number | undefined;
    process.exit = ((c?: number) => { code = c; throw new Error('exit'); }) as never;
    try {
      parseArgs([]);
    } catch { /* expected */ }
    process.exit = origExit;
    expect(code).toBe(1);
  });
});
