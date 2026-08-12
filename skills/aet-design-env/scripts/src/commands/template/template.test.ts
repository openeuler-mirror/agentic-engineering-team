import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  stripHtmlComments,
  parseFrontmatter,
  adjustHeadingLevel,
  addSectionNumbers,
  validateHeadingLevel,
  validateTargetLevel,
  getCurrentTime,
  assembleTemplate,
} from './template';

describe('stripHtmlComments', () => {
  it('leaves plain text unchanged', () => {
    expect(stripHtmlComments('hello world')).toBe('hello world');
  });

  it('removes a single comment', () => {
    expect(stripHtmlComments('a<!-- comment -->b')).toBe('ab');
  });

  it('removes nested comments', () => {
    expect(stripHtmlComments('a<!-- outer <!-- inner --> still outer -->b')).toBe('ab');
  });

  it('handles comments spanning newlines', () => {
    expect(stripHtmlComments('x<!-- line1\nline2 -->y')).toBe('xy');
  });

  it('returns empty for comment-only content', () => {
    expect(stripHtmlComments('<!-- only a comment -->')).toBe('');
  });
});

describe('parseFrontmatter', () => {
  it('returns empty metadata when no frontmatter', () => {
    const result = parseFrontmatter('just body text');
    expect(result.metadata).toEqual({});
    expect(result.body).toBe('just body text');
  });

  it('parses simple key:value pairs', () => {
    const result = parseFrontmatter('---\nkey: value\nfoo: bar\n---\nbody');
    expect(result.metadata.key).toBe('value');
    expect(result.metadata.foo).toBe('bar');
    expect(result.body).toBe('body');
  });

  it('parses block scalar (|) value — whole-string trim (outer indent only)', () => {
    // Block-scalar lines are joined preserving per-line indent, then only the
    // outer string is trimmed, so the first line loses its indent but later
    // lines keep theirs (faithful to the original parser behavior).
    const result = parseFrontmatter('---\nkey: |\n  line1\n  line2\n---\nbody');
    expect(result.metadata.key).toBe('line1\n  line2');
    expect(result.body).toBe('body');
  });

  it('handles value containing colons', () => {
    const result = parseFrontmatter('---\nurl: https://example.com\n---\nbody');
    expect(result.metadata.url).toBe('https://example.com');
  });

  it('trims body', () => {
    const result = parseFrontmatter('---\nkey: val\n---\n\n  body with spaces  \n');
    expect(result.body).toBe('body with spaces');
  });
});

describe('adjustHeadingLevel', () => {
  it('returns unchanged when fromLevel === toLevel', () => {
    expect(adjustHeadingLevel('## hi', 2, 2)).toBe('## hi');
  });

  it('increases heading levels by the diff', () => {
    expect(adjustHeadingLevel('## hi', 2, 4)).toBe('#### hi');
  });

  it('decreases heading levels by the diff', () => {
    expect(adjustHeadingLevel('#### hi', 4, 2)).toBe('## hi');
  });

  it('clamps to minimum level 1', () => {
    expect(adjustHeadingLevel('## hi', 4, 1)).toBe('# hi');
  });

  it('clamps to maximum level 6', () => {
    expect(adjustHeadingLevel('###### hi', 1, 4)).toBe('###### hi');
  });

  it('leaves non-heading lines untouched', () => {
    expect(adjustHeadingLevel('plain text\n## hi', 2, 4)).toBe('plain text\n#### hi');
  });
});

describe('addSectionNumbers', () => {
  it('numbers a single H2 with §N', () => {
    expect(addSectionNumbers('## Title')).toBe('## §1 Title');
  });

  it('numbers nested H2/H3/H4', () => {
    expect(addSectionNumbers('## A\n### B\n#### C')).toBe('## §1 A\n### 1.1 B\n#### 1.1.1 C');
  });

  it('resets sub-counters on new H2', () => {
    expect(addSectionNumbers('## A\n### B\n## C')).toBe('## §1 A\n### 1.1 B\n## §2 C');
  });

  it('leaves H1 untouched', () => {
    expect(addSectionNumbers('# Title\n## A')).toBe('# Title\n## §1 A');
  });

  it('leaves H5+ untouched', () => {
    expect(addSectionNumbers('##### note')).toBe('##### note');
  });
});

describe('validateHeadingLevel', () => {
  it('defaults to 2 when undefined', () => {
    expect(validateHeadingLevel(undefined, 'c')).toBe(2);
  });

  it('passes through valid levels 0-6', () => {
    expect(validateHeadingLevel('0', 'c')).toBe(0);
    expect(validateHeadingLevel('3', 'c')).toBe(3);
    expect(validateHeadingLevel('6', 'c')).toBe(6);
  });

  it('defaults to 2 on non-numeric', () => {
    expect(validateHeadingLevel('abc', 'c')).toBe(2);
  });

  it('defaults to 2 when out of range (0-6)', () => {
    expect(validateHeadingLevel('-1', 'c')).toBe(2);
    expect(validateHeadingLevel('7', 'c')).toBe(2);
  });
});

describe('validateTargetLevel', () => {
  it('returns null when undefined', () => {
    expect(validateTargetLevel(undefined, 'c')).toBeNull();
  });

  it('passes through valid levels 1-6', () => {
    expect(validateTargetLevel('1', 'c')).toBe(1);
    expect(validateTargetLevel('6', 'c')).toBe(6);
  });

  it('returns null on non-numeric', () => {
    expect(validateTargetLevel('abc', 'c')).toBeNull();
  });

  it('returns null when out of range (1-6)', () => {
    expect(validateTargetLevel('0', 'c')).toBeNull();
    expect(validateTargetLevel('7', 'c')).toBeNull();
  });
});

describe('getCurrentTime', () => {
  it('matches the expected format', () => {
    expect(getCurrentTime()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \(UTC[+-]\d+(\.\d+)?\)$/);
  });
});

// --- Plugin chain integration tests ----------------------------------------
//
// Each test creates its own temp project dir, writes plugin folders into
// `.aet/design/<plugin-name>/<template-set>/` (subdirs of plugin root, since
// a plugin wraps multiple template-sets), writes the path-arg fallback
// template-set as a sibling folder, optionally writes a `.aet/design/
// design.json` to select the active plugin, chdirs into the temp dir, then
// invokes `assembleTemplate(path)`. The byte-locked helpers (parseFrontmatter
// / adjustHeadingLevel / etc.) are covered by the unit tests above; these
// tests verify the new chain + path-arg-fallback + passthrough-shield +
// design.json behavior end-to-end at the unit level.

interface TemplateSetSpec {
  /** Optional artifact.md content. */
  artifact?: string;
  /** Optional components/<name>.md → content map (name without .md). */
  components?: Record<string, string>;
}

interface PluginSpec {
  /** Plugin name (folder name). Required. */
  name: string;
  /** Optional plugin-root plugin.json contents (depends_on + per-template-set shields map). */
  config?: { depends_on?: string | null; shields?: Record<string, string[]> };
  /** Optional template-set subdirs, keyed by template-set name (basename of path arg). */
  templateSets?: Record<string, TemplateSetSpec>;
}

function writePlugin(root: string, spec: PluginSpec): void {
  const base = join(root, '.aet', 'design', spec.name);
  mkdirSync(base, { recursive: true });
  if (spec.config) {
    writeFileSync(join(base, 'plugin.json'), JSON.stringify(spec.config));
  }
  if (spec.templateSets) {
    for (const [setName, tsSpec] of Object.entries(spec.templateSets)) {
      const tsDir = join(base, setName);
      mkdirSync(tsDir, { recursive: true });
      if (tsSpec.artifact !== undefined) {
        writeFileSync(join(tsDir, 'artifact.md'), tsSpec.artifact);
      }
      if (tsSpec.components) {
        const compDir = join(tsDir, 'components');
        mkdirSync(compDir, { recursive: true });
        for (const [name, content] of Object.entries(tsSpec.components)) {
          writeFileSync(join(compDir, `${name}.md`), content);
        }
      }
    }
  }
}

// Write a path-arg fallback template-set (NOT a plugin folder — no plugin.json,
// no chain entry). Returns the absolute path to the template-set folder so
// it can be passed to `assembleTemplate(path)`.
function writeTemplateSet(root: string, setName: string, spec: TemplateSetSpec): string {
  const tsDir = join(root, setName);
  mkdirSync(tsDir, { recursive: true });
  if (spec.artifact !== undefined) {
    writeFileSync(join(tsDir, 'artifact.md'), spec.artifact);
  }
  if (spec.components) {
    const compDir = join(tsDir, 'components');
    mkdirSync(compDir, { recursive: true });
    for (const [name, content] of Object.entries(spec.components)) {
      writeFileSync(join(compDir, `${name}.md`), content);
    }
  }
  return tsDir;
}

function writeDesign(root: string, plugin: string): void {
  const base = join(root, '.aet', 'design');
  mkdirSync(base, { recursive: true });
  writeFileSync(join(base, 'design.json'), JSON.stringify({ plugin }));
}

function withCwd<T>(cwd: string, fn: () => T): T {
  const orig = process.cwd();
  process.chdir(cwd);
  try { return fn(); } finally { process.chdir(orig); }
}

function withHome<T>(home: string, fn: () => T): T {
  const orig = process.env.HOME;
  process.env.HOME = home;
  try { return fn(); } finally { process.env.HOME = orig; }
}

// Capture console.error output (used by the missing-component test to verify
// the stderr warning is emitted).
function captureStderr(fn: () => void): string {
  const orig = console.error;
  let captured = '';
  console.error = (msg: string) => { captured += msg + '\n'; };
  try { fn(); } finally { console.error = orig; }
  return captured;
}

const INTRO_B = `---\nheading_level: 2\n---\n## Intro\nFrom plugin b\n`;
const SECTION_C = `---\nheading_level: 2\n---\n## Section\nFrom c\n`;
const DEEP_C = `---\nheading_level: 2\n---\n## Deep\nFrom c\n`;
const SHARED_A = `---\nheading_level: 2\n---\n## Shared\nFrom a (self)\n`;
const SHARED_B = `---\nheading_level: 2\n---\n## Shared\nFrom b\n`;
const SHARED_C = `---\nheading_level: 2\n---\n## Shared\nFrom c\n`;
const ONLY_C = `---\nheading_level: 2\n---\n## Only C\nFrom c\n`;
const ONLY_B = `---\nheading_level: 2\n---\n## Only B\nFrom b\n`;
const HAS_IT_M = `---\nheading_level: 2\n---\n## Has It\nFrom m\n`;
const META_B = `---\nupdate_time: 2020-01-01 00:00:00 (UTC+0)\nversion: 1.0\n---\n`;
const FALLBACK_ONLY = `---\nheading_level: 2\n---\n## Fallback Only\nFrom fallback\n`;
const BLOCKED = `---\nheading_level: 2\n---\n## Blocked\nFrom fallback\n`;

describe('assembleTemplate — plugin chain (a → b → c)', () => {
  let tmp: string;
  let result: string;

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'tmpl-chain-'));
    writeDesign(tmp, 'a');
    writePlugin(tmp, {
      name: 'a',
      config: { depends_on: 'b' },
      templateSets: { base: { artifact: `{{intro,2}}\n\n{{section,3}}\n\n{{deep,2}}\n` } },
    });
    writePlugin(tmp, {
      name: 'b',
      config: { depends_on: 'c' },
      templateSets: { base: { components: { intro: INTRO_B, metadata: META_B } } },
    });
    writePlugin(tmp, {
      name: 'c',
      templateSets: { base: { components: { section: SECTION_C, deep: DEEP_C } } },
    });
    const fallbackPath = writeTemplateSet(tmp, 'base', {});
    result = withCwd(tmp, () => assembleTemplate(fallbackPath));
  });

  afterAll(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('inlines intro from plugin b (first chain fallback)', () => {
    expect(result).toContain('## §1 Intro');
    expect(result).toContain('From plugin b');
  });
  it('inlines section from plugin c (second chain fallback, level 3)', () => {
    expect(result).toContain('### 1.1 Section');
    expect(result).toContain('From c');
  });
  it('inlines deep from plugin c (same plugin as section)', () => {
    expect(result).toContain('## §2 Deep');
    expect(result).toContain('From c');
  });
  it('prepends metadata from plugin b (auto-fill update_time)', () => {
    expect(result.startsWith('---\nupdate_time:')).toBe(true);
    expect(result).toContain('version: 1.0');
    expect(result).toMatch(/update_time: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \(UTC[+-]\d+(\.\d+)?\)/);
  });
});

describe('assembleTemplate — shield self-exempt (a shields X, a has X → use a)', () => {
  let tmp: string;
  let result: string;

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'tmpl-shield-self-'));
    writeDesign(tmp, 'a');
    writePlugin(tmp, {
      name: 'a',
      config: { depends_on: 'b', shields: { base: ['shared'] } },
      templateSets: { base: { artifact: `{{shared,2}}\n\n{{only-b,2}}\n`, components: { shared: SHARED_A } } },
    });
    writePlugin(tmp, {
      name: 'b',
      templateSets: { base: { components: { shared: SHARED_B, 'only-b': ONLY_B } } },
    });
    const fallbackPath = writeTemplateSet(tmp, 'base', {});
    result = withCwd(tmp, () => assembleTemplate(fallbackPath));
  });

  afterAll(() => { rmSync(tmp, { recursive: true, force: true }); });

  it("uses a's own shared copy (a's shield is exempt from a itself)", () => {
    expect(result).toContain('## §1 Shared\nFrom a (self)');
    expect(result).not.toContain('## §1 Shared\nFrom b');
  });
  it('inlines only-b from b (not shielded by anyone)', () => {
    expect(result).toContain('From b');
  });
});

describe('assembleTemplate — passthrough shield (b shields only-c, c has it → silent skip)', () => {
  let tmp: string;
  let result: string;

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'tmpl-shield-passthrough-'));
    writeDesign(tmp, 'a');
    writePlugin(tmp, {
      name: 'a',
      config: { depends_on: 'b' },
      templateSets: { base: { artifact: `{{shared,2}}\n\n{{only-c,2}}\n` } },
    });
    writePlugin(tmp, {
      name: 'b',
      config: { depends_on: 'c', shields: { base: ['only-c'] } },
      templateSets: { base: {} },
    });
    writePlugin(tmp, {
      name: 'c',
      templateSets: { base: { components: { shared: SHARED_C, 'only-c': ONLY_C } } },
    });
    const fallbackPath = writeTemplateSet(tmp, 'base', {});
    result = withCwd(tmp, () => assembleTemplate(fallbackPath));
  });

  afterAll(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('inlines shared from c (no shield on shared, chain reaches c)', () => {
    expect(result).toContain('## §1 Shared');
    expect(result).toContain('From c');
  });
  it("silently skips only-c (b's shield blocks c's copy — no error, no placeholder)", () => {
    expect(result).not.toContain('Only C');
    expect(result).not.toContain('From c\n## Only C');
    expect(result).not.toContain('Missing component');
  });
});

describe('assembleTemplate — design.json selects active plugin chain', () => {
  let tmp: string;
  let result: string;

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'tmpl-design-'));
    writeDesign(tmp, 'a');
    writePlugin(tmp, {
      name: 'a',
      config: { depends_on: 'b' },
      templateSets: { base: { artifact: `{{intro,2}}\n` } },
    });
    writePlugin(tmp, {
      name: 'b',
      templateSets: { base: { components: { intro: INTRO_B } } },
    });
    const fallbackPath = writeTemplateSet(tmp, 'base', {});
    result = withCwd(tmp, () => assembleTemplate(fallbackPath));
  });

  afterAll(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('reads active plugin from .aet/design/design.json and walks the chain', () => {
    expect(result).toContain('## §1 Intro');
    expect(result).toContain('From plugin b');
  });
});

describe('assembleTemplate — no design.json → path-arg used directly', () => {
  let tmp: string;
  let result: string;

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'tmpl-no-design-'));
    // No design.json, no plugins — empty chain, path-arg provides everything
    const fallbackPath = writeTemplateSet(tmp, 'base', {
      artifact: `{{intro,2}}\n`,
      components: { intro: INTRO_B },
    });
    result = withCwd(tmp, () => assembleTemplate(fallbackPath));
  });

  afterAll(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('uses path-arg fallback directly (no chain, no error)', () => {
    expect(result).toContain('## §1 Intro');
    expect(result).toContain('From plugin b');
  });
});

describe('assembleTemplate — path-arg fallback provides component not in any chain plugin', () => {
  let tmp: string;
  let result: string;

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'tmpl-fallback-provides-'));
    writeDesign(tmp, 'a');
    writePlugin(tmp, {
      name: 'a',
      config: { depends_on: 'b' },
      templateSets: { base: { artifact: `{{intro,2}}\n\n{{fallback-only,2}}\n` } },
    });
    writePlugin(tmp, {
      name: 'b',
      templateSets: { base: { components: { intro: INTRO_B } } },
    });
    // 'fallback-only' is ONLY in path-arg fallback, NOT in any chain plugin
    const fallbackPath = writeTemplateSet(tmp, 'base', {
      components: { 'fallback-only': FALLBACK_ONLY },
    });
    result = withCwd(tmp, () => assembleTemplate(fallbackPath));
  });

  afterAll(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('inlines intro from plugin b (chain provides it)', () => {
    expect(result).toContain('## §1 Intro');
    expect(result).toContain('From plugin b');
  });
  it('inlines fallback-only from path-arg fallback (chain lacks it, fallback provides it)', () => {
    expect(result).toContain('## §2 Fallback Only');
    expect(result).toContain('From fallback');
  });
});

describe('assembleTemplate — shield blocks path-arg fallback (no plugin has X, fallback has X → silent skip)', () => {
  let tmp: string;
  let result: string;

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'tmpl-shield-blocks-fallback-'));
    writeDesign(tmp, 'a');
    writePlugin(tmp, {
      name: 'a',
      config: { shields: { base: ['blocked'] } },
      templateSets: { base: { artifact: `{{blocked,2}}\n` } },
    });
    // 'blocked' is ONLY in path-arg fallback, but plugin a shields it
    const fallbackPath = writeTemplateSet(tmp, 'base', {
      components: { blocked: BLOCKED },
    });
    result = withCwd(tmp, () => assembleTemplate(fallbackPath));
  });

  afterAll(() => { rmSync(tmp, { recursive: true, force: true }); });

  it("silently skips blocked (a's shield blocks path-arg fallback copy too)", () => {
    expect(result).not.toContain('Blocked');
    expect(result).not.toContain('From fallback');
    expect(result).not.toContain('Missing component');
  });
});

describe('assembleTemplate — project > home precedence', () => {
  let tmp: string;
  let tmpHome: string;
  let result: string;

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'tmpl-proj-over-home-proj-'));
    tmpHome = mkdtempSync(join(tmpdir(), 'tmpl-proj-over-home-home-'));
    writeDesign(tmp, 'shadow');
    // Same plugin name "shadow" at BOTH project and home, different artifact content.
    // Active plugin must have plugin.json (even empty) to opt into plugin mode;
    // otherwise the new "no plugin.json = path-only mode" rule kicks in.
    writePlugin(tmp, { name: 'shadow', config: {}, templateSets: { base: { artifact: `## From project\n` } } });
    writePlugin(tmpHome, { name: 'shadow', config: {}, templateSets: { base: { artifact: `## From home\n` } } });
    const fallbackPath = writeTemplateSet(tmp, 'base', {});
    result = withHome(tmpHome, () => withCwd(tmp, () => assembleTemplate(fallbackPath)));
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it("uses project's shadow plugin (project wins over home)", () => {
    expect(result).toContain('From project');
    expect(result).not.toContain('From home');
  });
});

describe('assembleTemplate — home fallback when project lacks plugin', () => {
  let tmp: string;
  let tmpHome: string;
  let result: string;

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'tmpl-home-fallback-proj-'));
    tmpHome = mkdtempSync(join(tmpdir(), 'tmpl-home-fallback-home-'));
    writeDesign(tmp, 'homely');
    // Plugin "homely" exists ONLY in home, NOT in project. Active plugin
    // needs plugin.json (even empty) to opt into plugin mode under the new
    // "no plugin.json = path-only mode" rule.
    writePlugin(tmpHome, { name: 'homely', config: {}, templateSets: { base: { artifact: `## From home only\n` } } });
    const fallbackPath = writeTemplateSet(tmp, 'base', {});
    result = withHome(tmpHome, () => withCwd(tmp, () => assembleTemplate(fallbackPath)));
  });

  afterAll(() => {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(tmpHome, { recursive: true, force: true });
  });

  it('falls back to home when project does not have the plugin', () => {
    expect(result).toContain('From home only');
  });
});

describe('assembleTemplate — active plugin folder exists but no plugin.json (path-only mode)', () => {
  let tmp: string;
  let result: string;

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'tmpl-active-no-pluginjson-'));
    writeDesign(tmp, 'abc');
    // Plugin "abc" folder exists with artifact.md AND a component, but NO
    // plugin.json. Under the new rule this is "user didn't really configure
    // plugins" → path-only mode: abc's own files are NOT read; the chain is
    // empty and lookup falls straight through to the path-arg fallback.
    writePlugin(tmp, {
      name: 'abc',
      templateSets: { base: { artifact: `## From plugin abc (should be IGNORED)\n` } },
    });
    const fallbackPath = writeTemplateSet(tmp, 'base', {
      artifact: `## From fallback\n`,
    });
    result = withCwd(tmp, () => assembleTemplate(fallbackPath));
  });

  afterAll(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('uses the path-arg fallback artifact (active plugin without plugin.json is ignored)', () => {
    expect(result).toContain('From fallback');
    expect(result).not.toContain('From plugin abc');
  });
});

describe('assembleTemplate — missing component (chain + fallback both lack, no shield → placeholder + warning)', () => {
  let tmp: string;
  let result: string;
  let stderrOutput: string;

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'tmpl-missing-'));
    // No design.json, no chain — path-arg fallback provides everything.
    // 'has-it' resolves via fallback; 'no-it' is missing everywhere.
    const fallbackPath = writeTemplateSet(tmp, 'base', {
      artifact: `{{has-it,2}}\n\n{{no-it,2}}\n`,
      components: { 'has-it': HAS_IT_M },
    });
    stderrOutput = captureStderr(() => {
      result = withCwd(tmp, () => assembleTemplate(fallbackPath));
    });
  });

  afterAll(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('inlines the component the fallback has', () => {
    expect(result).toContain('## §1 Has It');
    expect(result).toContain('From m');
  });
  it('emits [Missing component: no-it] placeholder for the absent one', () => {
    expect(result).toContain('[Missing component: no-it]');
  });
  it('emits a stderr warning about the missing component', () => {
    expect(stderrOutput).toContain('Component not found');
    expect(stderrOutput).toContain('no-it');
  });
});

describe('assembleTemplate — circular dependency (a → b → a → error)', () => {
  let tmp: string;

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'tmpl-circular-'));
    writeDesign(tmp, 'a');
    writePlugin(tmp, { name: 'a', config: { depends_on: 'b' }, templateSets: { base: { artifact: `## A\n` } } });
    writePlugin(tmp, { name: 'b', config: { depends_on: 'a' }, templateSets: { base: { artifact: `## B\n` } } });
  });

  afterAll(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('throws with a cycle-path message', () => {
    const fallbackPath = writeTemplateSet(tmp, 'base', {});
    expect(() => withCwd(tmp, () => assembleTemplate(fallbackPath)))
      .toThrow(/Circular plugin dependency detected: a -> b -> a/);
  });
});

describe('assembleTemplate — broken depends_on (a → z, z missing → error)', () => {
  let tmp: string;

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'tmpl-broken-dep-'));
    writeDesign(tmp, 'a');
    writePlugin(tmp, { name: 'a', config: { depends_on: 'z' }, templateSets: { base: { artifact: `## A\n` } } });
  });

  afterAll(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('throws naming the missing dependency and its declarer', () => {
    const fallbackPath = writeTemplateSet(tmp, 'base', {});
    expect(() => withCwd(tmp, () => assembleTemplate(fallbackPath)))
      .toThrow(/Dependency 'z'.*not found at either level/);
  });
});

describe('assembleTemplate — active plugin not found anywhere', () => {
  let tmp: string;

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'tmpl-active-missing-'));
    writeDesign(tmp, 'ghost');
  });

  afterAll(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('throws naming the missing active plugin', () => {
    const fallbackPath = writeTemplateSet(tmp, 'base', {});
    expect(() => withCwd(tmp, () => assembleTemplate(fallbackPath)))
      .toThrow(/Active plugin 'ghost' not found at either level/);
  });
});
