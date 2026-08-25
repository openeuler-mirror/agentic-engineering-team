import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assembleChecklist, parseArgs } from './checklist';

// --- Plugin chain integration tests ----------------------------------------
//
// Each test creates its own temp project dir, writes plugin folders into
// `.aet/design/<plugin-name>/<checklist-set>/` (subdirs of plugin root, since
// a plugin wraps multiple checklist-sets), writes the path-arg fallback
// checklist-set as a sibling folder, optionally writes a `.aet/design/
// design.json` to select the active plugin, chdirs into the temp dir, then
// invokes `assembleChecklist(path)`. Tests mirror template.test.ts but with
// checklist semantics: skeleton = checklist.md; component content read from
// frontmatter `checklist:` field; placeholder `{{name}}` (no `,level`); no
// heading_level adjustment, no section numbering, no metadata prepend.

interface ChecklistSetSpec {
  /** Optional checklist.md skeleton content. */
  checklist?: string;
  /** Optional components/<name>.md → content map (name without .md). */
  components?: Record<string, string>;
}

interface PluginSpec {
  /** Plugin name (folder name). Required. */
  name: string;
  /** Optional plugin-root plugin.json contents (depends_on + per-template-set shields map). */
  config?: { depends_on?: string | null; shields?: Record<string, string[]> };
  /** Optional checklist-set subdirs, keyed by set name (basename of path arg). */
  checklistSets?: Record<string, ChecklistSetSpec>;
}

function writePlugin(root: string, spec: PluginSpec): void {
  const base = join(root, '.aet', 'design', spec.name);
  mkdirSync(base, { recursive: true });
  if (spec.config) {
    writeFileSync(join(base, 'plugin.json'), JSON.stringify(spec.config));
  }
  if (spec.checklistSets) {
    for (const [setName, csSpec] of Object.entries(spec.checklistSets)) {
      const csDir = join(base, setName);
      mkdirSync(csDir, { recursive: true });
      if (csSpec.checklist !== undefined) {
        writeFileSync(join(csDir, 'checklist.md'), csSpec.checklist);
      }
      if (csSpec.components) {
        const compDir = join(csDir, 'components');
        mkdirSync(compDir, { recursive: true });
        for (const [name, content] of Object.entries(csSpec.components)) {
          writeFileSync(join(compDir, `${name}.md`), content);
        }
      }
    }
  }
}

// Write a path-arg fallback checklist-set (NOT a plugin folder — no plugin.json,
// no chain entry). Returns the absolute path to the checklist-set folder so
// it can be passed to `assembleChecklist(path)`.
function writeChecklistSet(root: string, setName: string, spec: ChecklistSetSpec): string {
  const csDir = join(root, setName);
  mkdirSync(csDir, { recursive: true });
  if (spec.checklist !== undefined) {
    writeFileSync(join(csDir, 'checklist.md'), spec.checklist);
  }
  if (spec.components) {
    const compDir = join(csDir, 'components');
    mkdirSync(compDir, { recursive: true });
    for (const [name, content] of Object.entries(spec.components)) {
      writeFileSync(join(compDir, `${name}.md`), content);
    }
  }
  return csDir;
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

// Capture console.error output (used to verify stderr warnings).
function captureStderr(fn: () => void): string {
  const orig = console.error;
  let captured = '';
  console.error = (msg: string) => { captured += msg + '\n'; };
  try { fn(); } finally { console.error = orig; }
  return captured;
}

// Component content constants. Each is a frontmatter-only file with a
// `checklist:` block scalar; body is irrelevant (ignored by checklist).
const INTRO_B = `---\nchecklist: |\n  - [ ] Item from b\n---\n`;
const SECTION_C = `---\nchecklist: |\n  - [ ] Item from c\n---\n`;
const DEEP_C = `---\nchecklist: |\n  - [ ] Deep from c\n---\n`;
const SHARED_A = `---\nchecklist: |\n  - [ ] Shared from a (self)\n---\n`;
const SHARED_B = `---\nchecklist: |\n  - [ ] Shared from b\n---\n`;
const SHARED_C = `---\nchecklist: |\n  - [ ] Shared from c\n---\n`;
const ONLY_C = `---\nchecklist: |\n  - [ ] Only C from c\n---\n`;
const ONLY_B = `---\nchecklist: |\n  - [ ] Only B from b\n---\n`;
const HAS_IT_M = `---\nchecklist: |\n  - [ ] Has It from m\n---\n`;
const FALLBACK_ONLY = `---\nchecklist: |\n  - [ ] Fallback Only\n---\n`;
const BLOCKED = `---\nchecklist: |\n  - [ ] Blocked from fallback\n---\n`;

// Components WITHOUT a `checklist:` field — should be treated as missing.
const NO_CHECKLIST_FIELD = `---\nheading_level: 2\n---\n## Has body, no checklist field\n`;

describe('assembleChecklist — plugin chain (a → b → c)', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'cl-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('walks chain: a provides skeleton, b & c provide components', () => {
    writeDesign(tmp, 'a');
    writePlugin(tmp, {
      name: 'a',
      config: { depends_on: 'b' },
      checklistSets: { base: { checklist: '# Checklist\n\n{{intro}}\n\n{{section}}\n\n{{deep}}' } },
    });
    writePlugin(tmp, {
      name: 'b',
      config: { depends_on: 'c' },
      checklistSets: { base: { components: { intro: INTRO_B, section: SECTION_C } } },
    });
    writePlugin(tmp, {
      name: 'c',
      checklistSets: { base: { components: { deep: DEEP_C } } },
    });
    const fb = writeChecklistSet(tmp, 'base', {});

    const result = withCwd(tmp, () => assembleChecklist(fb));
    expect(result).toContain('- [ ] Item from b');
    expect(result).toContain('- [ ] Item from c');
    expect(result).toContain('- [ ] Deep from c');
    expect(result).not.toContain('[Missing component');
  });
});

describe('assembleChecklist — shield self-exempt', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'cl-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('a shields "shared" AND has it → uses a\'s own copy (exempt)', () => {
    writeDesign(tmp, 'a');
    writePlugin(tmp, {
      name: 'a',
      config: { depends_on: 'b', shields: { base: ['shared'] } },
      checklistSets: { base: { checklist: '{{shared}}', components: { shared: SHARED_A } } },
    });
    writePlugin(tmp, {
      name: 'b',
      checklistSets: { base: { components: { shared: SHARED_B } } },
    });
    const fb = writeChecklistSet(tmp, 'base', {});

    const result = withCwd(tmp, () => assembleChecklist(fb));
    expect(result).toContain('Shared from a (self)');
    expect(result).not.toContain('Shared from b');
    expect(result).not.toContain('[Missing component');
  });
});

describe('assembleChecklist — passthrough shield (silent skip)', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'cl-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('b shields "only-c", c has it → silent skip (no [Missing component])', () => {
    writeDesign(tmp, 'a');
    writePlugin(tmp, {
      name: 'a',
      config: { depends_on: 'b' },
      checklistSets: { base: { checklist: '{{shared}}\n\n{{only-c}}' } },
    });
    writePlugin(tmp, {
      name: 'b',
      config: { depends_on: 'c', shields: { base: ['only-c'] } },
      checklistSets: { base: { components: { shared: SHARED_B } } },
    });
    writePlugin(tmp, {
      name: 'c',
      checklistSets: { base: { components: { shared: SHARED_C, 'only-c': ONLY_C } } },
    });
    const fb = writeChecklistSet(tmp, 'base', {});

    const result = withCwd(tmp, () => assembleChecklist(fb));
    // b has shared (exempt from b's own shield, which targets only-c) → used
    expect(result).toContain('Shared from b');
    // only-c: b shields it; b lacks it; c has it but blocked → silent skip
    expect(result).not.toContain('Only C');
    expect(result).not.toContain('[Missing component');
  });
});

describe('assembleChecklist — design.json selects active plugin chain', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'cl-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('design.json picks a; chain a→b provides skeleton + components', () => {
    writeDesign(tmp, 'a');
    writePlugin(tmp, {
      name: 'a',
      config: { depends_on: 'b' },
      checklistSets: { base: { checklist: '{{intro}}' } },
    });
    writePlugin(tmp, {
      name: 'b',
      checklistSets: { base: { components: { intro: INTRO_B } } },
    });
    const fb = writeChecklistSet(tmp, 'base', {});

    const result = withCwd(tmp, () => assembleChecklist(fb));
    expect(result).toContain('Item from b');
  });
});

describe('assembleChecklist — no design.json → path-arg used directly', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'cl-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('no design.json, no plugins → uses fallback path-arg content only', () => {
    const fb = writeChecklistSet(tmp, 'base', {
      checklist: '{{has-it}}',
      components: { 'has-it': HAS_IT_M },
    });

    const result = withCwd(tmp, () => assembleChecklist(fb));
    expect(result).toContain('Has It from m');
    expect(result).not.toContain('[Missing component');
  });
});

describe('assembleChecklist — active plugin folder exists but no plugin.json (path-only mode)', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'cl-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('design.json selects "abc" but abc has no plugin.json → path-only mode, abc files ignored', () => {
    writeDesign(tmp, 'abc');
    // Plugin "abc" folder exists with a checklist.md AND a component, but
    // NO plugin.json. Under the new rule this is "user didn't really
    // configure plugins" → path-only mode: abc's own files are NOT read;
    // the chain is empty and lookup falls straight through to the path-arg
    // fallback (which provides its own checklist.md and component).
    writePlugin(tmp, {
      name: 'abc',
      checklistSets: { base: { checklist: 'IGNORED from abc\n{{from-abc}}', components: { 'from-abc': `---\nchecklist: |\n  - [ ] IGNORED component from abc\n---\n` } } },
    });
    const fb = writeChecklistSet(tmp, 'base', {
      checklist: 'From fallback\n{{from-fb}}',
      components: { 'from-fb': `---\nchecklist: |\n  - [ ] From fallback component\n---\n` },
    });

    const result = withCwd(tmp, () => assembleChecklist(fb));
    expect(result).toContain('From fallback');
    expect(result).toContain('From fallback component');
    expect(result).not.toContain('IGNORED');
  });
});

describe('assembleChecklist — path-arg fallback provides component', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'cl-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('chain lacks "fallback-only", no shield, path-arg has it → uses path-arg copy', () => {
    writeDesign(tmp, 'a');
    // Active plugin needs plugin.json (even empty) to opt into plugin mode;
    // otherwise the new "no plugin.json = path-only mode" rule kicks in and
    // the chain is empty (no checklist.md to walk).
    writePlugin(tmp, {
      name: 'a',
      config: {},
      checklistSets: { base: { checklist: '{{fallback-only}}' } },
    });
    const fb = writeChecklistSet(tmp, 'base', { components: { 'fallback-only': FALLBACK_ONLY } });

    const result = withCwd(tmp, () => assembleChecklist(fb));
    expect(result).toContain('Fallback Only');
    expect(result).not.toContain('[Missing component');
  });
});

describe('assembleChecklist — shield blocks path-arg fallback', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'cl-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('a shields "blocked", no plugin has it, path-arg has it → silent skip', () => {
    writeDesign(tmp, 'a');
    writePlugin(tmp, {
      name: 'a',
      config: { depends_on: 'b', shields: { base: ['blocked'] } },
      checklistSets: { base: { checklist: '{{blocked}}\n\n{{intro}}' } },
    });
    writePlugin(tmp, {
      name: 'b',
      checklistSets: { base: { components: { intro: INTRO_B } } },
    });
    const fb = writeChecklistSet(tmp, 'base', { components: { blocked: BLOCKED } });

    const result = withCwd(tmp, () => assembleChecklist(fb));
    expect(result).not.toContain('Blocked');
    expect(result).not.toContain('From fallback');
    expect(result).not.toContain('[Missing component');
    expect(result).toContain('Item from b');
  });
});

describe('assembleChecklist — missing component (aligned with template)', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'cl-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('chain lacks "no-it", no shield, path-arg lacks it → [Missing component] + stderr', () => {
    const fb = writeChecklistSet(tmp, 'base', {
      checklist: '{{has-it}}\n\n{{no-it}}',
      components: { 'has-it': HAS_IT_M },
    });

    const stderr = captureStderr(() => {
      const result = withCwd(tmp, () => assembleChecklist(fb));
      expect(result).toContain('Has It from m');
      expect(result).toContain('[Missing component: no-it]');
    });
    expect(stderr).toContain('Component not found');
    expect(stderr).toContain('no-it');
  });

  it('component file exists but lacks `checklist:` field → treated as missing', () => {
    const fb = writeChecklistSet(tmp, 'base', {
      checklist: '{{has-field}}\n\n{{no-field}}',
      components: {
        'has-field': HAS_IT_M,
        'no-field': NO_CHECKLIST_FIELD,
      },
    });

    const stderr = captureStderr(() => {
      const result = withCwd(tmp, () => assembleChecklist(fb));
      expect(result).toContain('Has It from m');
      expect(result).toContain('[Missing component: no-field]');
    });
    expect(stderr).toContain('no-field');
  });
});

describe('assembleChecklist — circular dependency', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'cl-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('a → b → a → ... throws Circular plugin dependency', () => {
    writeDesign(tmp, 'a');
    writePlugin(tmp, {
      name: 'a',
      config: { depends_on: 'b' },
      checklistSets: { base: { checklist: 'body' } },
    });
    writePlugin(tmp, {
      name: 'b',
      config: { depends_on: 'a' },
      checklistSets: { base: { checklist: 'body' } },
    });
    const fb = writeChecklistSet(tmp, 'base', {});

    expect(() => withCwd(tmp, () => assembleChecklist(fb))).toThrow(/Circular plugin dependency detected/);
  });
});

describe('assembleChecklist — broken depends_on', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'cl-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it("a depends on 'z' (not at any 2 level) → throws", () => {
    writeDesign(tmp, 'a');
    writePlugin(tmp, {
      name: 'a',
      config: { depends_on: 'z' },
      checklistSets: { base: { checklist: 'body' } },
    });
    const fb = writeChecklistSet(tmp, 'base', {});

    expect(() => withCwd(tmp, () => assembleChecklist(fb))).toThrow(/Dependency 'z'.*not found at either level/);
  });
});

describe('assembleChecklist — no checklist.md in chain + path-arg', () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'cl-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('no plugin & no path-arg has checklist.md → throws', () => {
    writeDesign(tmp, 'a');
    writePlugin(tmp, { name: 'a', checklistSets: { base: { components: { intro: INTRO_B } } } });
    const fb = writeChecklistSet(tmp, 'base', {});

    expect(() => withCwd(tmp, () => assembleChecklist(fb))).toThrow(/checklist\.md not found/);
  });
});

describe('parseArgs', () => {
  it('returns the path arg', () => {
    expect(parseArgs(['/some/path/base'])).toEqual({ checklistSetPath: '/some/path/base' });
  });

  it('exits with usage message if no arg given', () => {
    const origExit = process.exit;
    const origError = console.error;
    let exitCode: number | undefined;
    let captured = '';
    process.exit = ((code?: number) => { exitCode = code; throw new Error('exit'); }) as never;
    console.error = (msg: string) => { captured += msg + '\n'; };
    try {
      expect(() => parseArgs([])).toThrow('exit');
    } finally {
      process.exit = origExit;
      console.error = origError;
    }
    expect(exitCode).toBe(1);
    expect(captured).toContain('Usage: checklist');
  });
});
