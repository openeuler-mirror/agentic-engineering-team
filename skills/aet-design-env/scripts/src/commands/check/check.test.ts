/**
 * Unit tests for the `check` subcommand of aet-design-env.
 *
 * Each test sets up a temp project dir + temp HOME, then calls `runChecks()`
 * (which reads `process.cwd()` + `homedir()`). The scan covers the 2-level
 * plugin lookup (project `.aet/design/` + home `~/.aet/design/`); there is
 * no skill `_templates/` level under the new (plugin=wrapper) model.
 *
 * Coverage matrix (each rule from check.ts has at least one test):
 *   - Clean env (no issues)
 *   - design.json: malformed JSON / not an object / missing plugin field /
 *     plugin: null (explicit disable — no ERROR, no chain validation)
 *   - plugin.json (plugin root): malformed JSON / not an object / depends_on
 *     wrong type / depends_on empty string / shields wrong type (not object)
 *     / shields[setName] wrong type / shields[setName] entry not string /
 *     shields[setName] entry empty string
 *   - Broken depends_on (chain references missing plugin) → ERROR
 *   - Circular dependency (a → b → a) → ERROR
 *   - Ghost plugin folder (no plugin.json, no template-set subdirs) → WARNING
 *   - Passthrough plugin (only plugin.json, no template-set subdirs) → INFO
 *   - No design.json at project or home → WARNING
 *   - parseArgs: no arg → null; with arg → string
 *
 * Note: per-template-set checks (artifact.md presence, placeholder
 * reachability) are NOT in check.ts (the `check` subcommand doesn't know
 * which template-set path will be passed to `template`); they belong to
 * runtime checks in template.ts and template.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runChecks, parseArgs, type CheckIssue } from './check';

// --- Test helpers (mirror template.test.ts conventions) ---------------------

interface TemplateSetSpec {
  artifact?: string;
  components?: Record<string, string>;
}

interface PluginSpec {
  name: string;
  /** Optional plugin-root plugin.json contents (depends_on + per-template-set shields map). */
  config?: { depends_on?: string | null; shields?: Record<string, string[]> };
  templateSets?: Record<string, TemplateSetSpec>;
}

function writePlugin(root: string, spec: PluginSpec): void {
  const base = join(root, '.aet', 'design', spec.name);
  mkdirSync(base, { recursive: true });
  if (spec.config) {
    writeFileSync(join(base, 'plugin.json'), JSON.stringify(spec.config));
  }
  if (spec.templateSets) {
    for (const [setName, ts] of Object.entries(spec.templateSets)) {
      const tsDir = join(base, setName);
      mkdirSync(tsDir, { recursive: true });
      if (ts.artifact !== undefined) {
        writeFileSync(join(tsDir, 'artifact.md'), ts.artifact);
      }
      if (ts.components) {
        const compDir = join(tsDir, 'components');
        mkdirSync(compDir, { recursive: true });
        for (const [name, content] of Object.entries(ts.components)) {
          writeFileSync(join(compDir, `${name}.md`), content);
        }
      }
    }
  }
}

function writeDesign(root: string, plugin: string): void {
  const base = join(root, '.aet', 'design');
  mkdirSync(base, { recursive: true });
  writeFileSync(join(base, 'design.json'), JSON.stringify({ plugin }));
}

function writeRawDesign(root: string, raw: string): void {
  const base = join(root, '.aet', 'design');
  mkdirSync(base, { recursive: true });
  writeFileSync(join(base, 'design.json'), raw);
}

function writeRawPluginJson(root: string, pluginName: string, raw: string): void {
  const base = join(root, '.aet', 'design', pluginName);
  mkdirSync(base, { recursive: true });
  writeFileSync(join(base, 'plugin.json'), raw);
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

function bySev(issues: CheckIssue[], sev: CheckIssue['severity']): CheckIssue[] {
  return issues.filter((i) => i.severity === sev);
}

function findIssue(
  issues: CheckIssue[],
  sev: CheckIssue['severity'],
  fragment: string,
): CheckIssue | undefined {
  return issues.find((i) => i.severity === sev && i.message.includes(fragment));
}

// Track temp dirs for cleanup. We use beforeAll/afterAll per describe for
// setup-heavy tests; the per-test setup pattern would create many small
// dirs. Each test gets its own dir via the helper.
function setupTmp(prefix: string): { tmp: string; home: string } {
  return {
    tmp: mkdtempSync(join(tmpdir(), prefix)),
    home: mkdtempSync(join(tmpdir(), prefix + '-home-')),
  };
}

function cleanupTmp(dirs: string[]): void {
  for (const d of dirs) {
    try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

// --- Tests ------------------------------------------------------------------

describe('check — clean env (no issues)', () => {
  let tmp: string; let home: string;
  let issues: CheckIssue[];

  beforeAll(() => {
    ({ tmp, home } = setupTmp('chk-clean-'));
    writePlugin(tmp, {
      name: 'a',
      config: { depends_on: 'b' },
      templateSets: { base: { artifact: '{{intro,2}}\n\n{{section,3}}' } },
    });
    writePlugin(tmp, {
      name: 'b',
      templateSets: { base: { components: { intro: '## Intro\n', section: '## Section\n' } } },
    });
    writeDesign(tmp, 'a');
    issues = withHome(home, () => withCwd(tmp, () => runChecks()));
  });
  afterAll(() => cleanupTmp([tmp, home]));

  it('reports no errors', () => expect(bySev(issues, 'ERROR')).toEqual([]));
  it('reports no warnings', () => expect(bySev(issues, 'WARNING')).toEqual([]));
  it('reports no infos', () => expect(bySev(issues, 'INFO')).toEqual([]));
  it('issues list is empty', () => expect(issues).toEqual([]));
});

describe('check — design.json malformed JSON', () => {
  let tmp: string; let home: string;
  let issues: CheckIssue[];

  beforeAll(() => {
    ({ tmp, home } = setupTmp('chk-dj-malformed-'));
    writePlugin(tmp, { name: 'a', templateSets: { base: { artifact: 'body' } } });
    writeRawDesign(tmp, '{ not valid json');
    issues = withHome(home, () => withCwd(tmp, () => runChecks()));
  });
  afterAll(() => cleanupTmp([tmp, home]));

  it('reports 1 ERROR', () => expect(bySev(issues, 'ERROR')).toHaveLength(1));
  it('ERROR message says malformed JSON', () => {
    expect(findIssue(issues, 'ERROR', 'malformed JSON')).toBeDefined();
  });
  it('does not run chain checks (no active plugin resolved)', () => {
    expect(findIssue(issues, 'ERROR', 'artifact.md')).toBeUndefined();
  });
});

describe('check — design.json missing plugin field', () => {
  let tmp: string; let home: string;
  let issues: CheckIssue[];

  beforeAll(() => {
    ({ tmp, home } = setupTmp('chk-dj-noplug-'));
    writeRawDesign(tmp, JSON.stringify({ active: 'a' }));
    issues = withHome(home, () => withCwd(tmp, () => runChecks()));
  });
  afterAll(() => cleanupTmp([tmp, home]));

  it('reports 1 ERROR', () => expect(bySev(issues, 'ERROR')).toHaveLength(1));
  it('ERROR mentions plugin field', () => {
    expect(findIssue(issues, 'ERROR', "'plugin' field")).toBeDefined();
  });
});

describe('check — design.json not an object', () => {
  let tmp: string; let home: string;
  let issues: CheckIssue[];

  beforeAll(() => {
    ({ tmp, home } = setupTmp('chk-dj-notobj-'));
    writeRawDesign(tmp, JSON.stringify(['a', 'b']));
    issues = withHome(home, () => withCwd(tmp, () => runChecks()));
  });
  afterAll(() => cleanupTmp([tmp, home]));

  it('reports ERROR mentioning JSON object', () => {
    expect(findIssue(issues, 'ERROR', 'must be a JSON object')).toBeDefined();
  });
});

describe('check — plugin.json malformed JSON', () => {
  let tmp: string; let home: string;
  let issues: CheckIssue[];

  beforeAll(() => {
    ({ tmp, home } = setupTmp('chk-pj-malformed-'));
    writePlugin(tmp, { name: 'a', templateSets: { base: { artifact: 'body' } } });
    writeRawPluginJson(tmp, 'a', '{ broken');
    writeDesign(tmp, 'a');
    issues = withHome(home, () => withCwd(tmp, () => runChecks()));
  });
  afterAll(() => cleanupTmp([tmp, home]));

  it('reports ERROR for plugin.json malformed JSON', () => {
    expect(findIssue(issues, 'ERROR', 'malformed JSON')).toBeDefined();
  });
  // loadPluginConfig reads plugin.json from the first level that has it; if
  // it can't be parsed it throws, which propagates as a chain-construction
  // ERROR. So we get ≥1 ERROR mentioning the failure.
  it('reports at least one ERROR', () => {
    expect(bySev(issues, 'ERROR').length).toBeGreaterThanOrEqual(1);
  });
});

describe('check — plugin.json depends_on wrong type (number)', () => {
  let tmp: string; let home: string;
  let issues: CheckIssue[];

  beforeAll(() => {
    ({ tmp, home } = setupTmp('chk-pj-depnum-'));
    writeRawPluginJson(tmp, 'a', JSON.stringify({ depends_on: 42 }));
    writePlugin(tmp, { name: 'a', templateSets: { base: { artifact: 'body' } } }); // creates folder if missing; overwrites artifact.md
    writeDesign(tmp, 'a');
    issues = withHome(home, () => withCwd(tmp, () => runChecks()));
  });
  afterAll(() => cleanupTmp([tmp, home]));

  it('reports ERROR mentioning depends_on type', () => {
    expect(findIssue(issues, 'ERROR', "'depends_on' must be a string or null")).toBeDefined();
  });
});

describe('check — plugin.json depends_on empty string', () => {
  let tmp: string; let home: string;
  let issues: CheckIssue[];

  beforeAll(() => {
    ({ tmp, home } = setupTmp('chk-pj-depempty-'));
    writeRawPluginJson(tmp, 'a', JSON.stringify({ depends_on: '' }));
    writePlugin(tmp, { name: 'a', templateSets: { base: { artifact: 'body' } } });
    writeDesign(tmp, 'a');
    issues = withHome(home, () => withCwd(tmp, () => runChecks()));
  });
  afterAll(() => cleanupTmp([tmp, home]));

  it('reports ERROR mentioning depends_on non-empty', () => {
    expect(findIssue(issues, 'ERROR', "'depends_on' must be a non-empty string")).toBeDefined();
  });
});

describe('check — plugin.json shields wrong type (string, not object map)', () => {
  let tmp: string; let home: string;
  let issues: CheckIssue[];

  beforeAll(() => {
    ({ tmp, home } = setupTmp('chk-pj-shstr-'));
    // shields must be an object { templateSetName: [components] }, not a bare
    // array or primitive. A string here is a malformed shields value.
    writeRawPluginJson(tmp, 'a', JSON.stringify({ shields: 'foo' }));
    writePlugin(tmp, { name: 'a', templateSets: { base: { artifact: 'body' } } });
    writeDesign(tmp, 'a');
    issues = withHome(home, () => withCwd(tmp, () => runChecks()));
  });
  afterAll(() => cleanupTmp([tmp, home]));

  it("reports ERROR mentioning shields must be an object mapping template-set name", () => {
    expect(findIssue(issues, 'ERROR', "'shields' must be an object mapping template-set name to array of strings")).toBeDefined();
  });
});

describe('check — plugin.json shields[setName] wrong type (string, not array)', () => {
  let tmp: string; let home: string;
  let issues: CheckIssue[];

  beforeAll(() => {
    ({ tmp, home } = setupTmp('chk-pj-shsetstr-'));
    writePlugin(tmp, { name: 'a', templateSets: { base: { artifact: 'body' } } });
    writeRawPluginJson(tmp, 'a', JSON.stringify({ shields: { base: 'foo' } }));
    writeDesign(tmp, 'a');
    issues = withHome(home, () => withCwd(tmp, () => runChecks()));
  });
  afterAll(() => cleanupTmp([tmp, home]));

  it("reports ERROR mentioning shields[setName] must be array of strings", () => {
    expect(findIssue(issues, 'ERROR', "'shields[\"base\"]' must be an array of strings")).toBeDefined();
  });
});

describe('check — plugin.json shields[setName] entry not string (number in array)', () => {
  let tmp: string; let home: string;
  let issues: CheckIssue[];

  beforeAll(() => {
    ({ tmp, home } = setupTmp('chk-pj-shentry-'));
    writePlugin(tmp, { name: 'a', templateSets: { base: { artifact: 'body' } } });
    writeRawPluginJson(tmp, 'a', JSON.stringify({ shields: { base: ['ok', 7] } }));
    writeDesign(tmp, 'a');
    issues = withHome(home, () => withCwd(tmp, () => runChecks()));
  });
  afterAll(() => cleanupTmp([tmp, home]));

  it("reports ERROR mentioning shields[setName] entries must be strings", () => {
    expect(findIssue(issues, 'ERROR', "'shields[\"base\"]' entries must be strings")).toBeDefined();
  });
});

describe('check — broken depends_on (chain → missing plugin)', () => {
  let tmp: string; let home: string;
  let issues: CheckIssue[];

  beforeAll(() => {
    ({ tmp, home } = setupTmp('chk-broken-'));
    writePlugin(tmp, {
      name: 'a',
      config: { depends_on: 'ghost' },
      templateSets: { base: { artifact: 'body' } },
    });
    writeDesign(tmp, 'a');
    issues = withHome(home, () => withCwd(tmp, () => runChecks()));
  });
  afterAll(() => cleanupTmp([tmp, home]));

  it('reports ERROR from chain construction', () => {
    expect(findIssue(issues, 'ERROR', 'ghost')).toBeDefined();
  });
});

describe('check — circular dependency (a → b → a)', () => {
  let tmp: string; let home: string;
  let issues: CheckIssue[];

  beforeAll(() => {
    ({ tmp, home } = setupTmp('chk-cyclic-'));
    writePlugin(tmp, {
      name: 'a',
      config: { depends_on: 'b' },
      templateSets: { base: { artifact: 'body' } },
    });
    writePlugin(tmp, {
      name: 'b',
      config: { depends_on: 'a' },
    });
    writeDesign(tmp, 'a');
    issues = withHome(home, () => withCwd(tmp, () => runChecks()));
  });
  afterAll(() => cleanupTmp([tmp, home]));

  it('reports ERROR mentioning circular', () => {
    expect(findIssue(issues, 'ERROR', 'Circular')).toBeDefined();
  });
});

describe('check — ghost plugin folder (no plugin.json, no artifact, no components)', () => {
  let tmp: string; let home: string;
  let issues: CheckIssue[];

  beforeAll(() => {
    ({ tmp, home } = setupTmp('chk-ghost-'));
    // active plugin a — clean
    writePlugin(tmp, { name: 'a', templateSets: { base: { artifact: 'body' } } });
    writeDesign(tmp, 'a');
    // ghost folder: just a dir, nothing inside
    mkdirSync(join(tmp, '.aet', 'design', 'ghost'), { recursive: true });
    issues = withHome(home, () => withCwd(tmp, () => runChecks()));
  });
  afterAll(() => cleanupTmp([tmp, home]));

  it('reports 1 WARNING about ghost folder', () => {
    expect(bySev(issues, 'WARNING').length).toBeGreaterThanOrEqual(1);
  });
  it('WARNING mentions ghost plugin folder', () => {
    expect(findIssue(issues, 'WARNING', 'ghost plugin folder')).toBeDefined();
  });
});

describe('check — passthrough plugin (only plugin.json)', () => {
  let tmp: string; let home: string;
  let issues: CheckIssue[];

  beforeAll(() => {
    ({ tmp, home } = setupTmp('chk-pass-'));
    // a is passthrough: only plugin.json declaring depends_on: b
    writePlugin(tmp, {
      name: 'a',
      config: { depends_on: 'b' },
    });
    writePlugin(tmp, {
      name: 'b',
      templateSets: { base: { artifact: 'body' } },
    });
    writeDesign(tmp, 'a');
    issues = withHome(home, () => withCwd(tmp, () => runChecks()));
  });
  afterAll(() => cleanupTmp([tmp, home]));

  it('reports 1 INFO about passthrough', () => {
    expect(bySev(issues, 'INFO')).toHaveLength(1);
  });
  it('INFO mentions passthrough plugin', () => {
    expect(findIssue(issues, 'INFO', 'passthrough plugin')).toBeDefined();
  });
  it('reports no ERRORs', () => {
    expect(bySev(issues, 'ERROR')).toEqual([]);
  });
});

describe('check — no design.json at project or home', () => {
  let tmp: string; let home: string;
  let issues: CheckIssue[];

  beforeAll(() => {
    ({ tmp, home } = setupTmp('chk-nodj-'));
    // has a plugin folder but no design.json
    writePlugin(tmp, { name: 'a', templateSets: { base: { artifact: 'body' } } });
    issues = withHome(home, () => withCwd(tmp, () => runChecks()));
  });
  afterAll(() => cleanupTmp([tmp, home]));

  it('reports WARNING about no design.json', () => {
    expect(findIssue(issues, 'WARNING', 'no design.json')).toBeDefined();
  });
  it('reports no ERRORs', () => {
    expect(bySev(issues, 'ERROR')).toEqual([]);
  });
});

describe('check — design.json with plugin: null (explicit disable)', () => {
  let tmp: string; let home: string;
  let issues: CheckIssue[];

  beforeAll(() => {
    ({ tmp, home } = setupTmp('chk-dj-nullplug-'));
    // plugin folder exists, but design.json explicitly disables the chain
    writePlugin(tmp, { name: 'a', templateSets: { base: { artifact: 'body' } } });
    writeRawDesign(tmp, JSON.stringify({ plugin: null }));
    issues = withHome(home, () => withCwd(tmp, () => runChecks()));
  });
  afterAll(() => cleanupTmp([tmp, home]));

  it('reports no ERRORs (null is a valid disable, not malformed)', () => {
    expect(bySev(issues, 'ERROR')).toEqual([]);
  });
  it('does NOT report the no-design.json WARNING (file exists, just disabled)', () => {
    expect(findIssue(issues, 'WARNING', 'no design.json')).toBeUndefined();
  });
  it('does NOT run chain validation (no active plugin resolved)', () => {
    expect(findIssue(issues, 'ERROR', 'Circular')).toBeUndefined();
    expect(findIssue(issues, 'ERROR', 'not found')).toBeUndefined();
  });
});

describe('check — design.json project takes precedence over home', () => {
  let tmp: string; let home: string;
  let issues: CheckIssue[];

  beforeAll(() => {
    ({ tmp, home } = setupTmp('chk-precedence-'));
    // project design.json → a (valid)
    writePlugin(tmp, { name: 'a', templateSets: { base: { artifact: 'body' } } });
    writeDesign(tmp, 'a');
    // home design.json → z (broken — z doesn't exist); should be IGNORED
    mkdirSync(join(home, '.aet', 'design'), { recursive: true });
    writeFileSync(join(home, '.aet', 'design', 'design.json'), JSON.stringify({ plugin: 'z' }));
    issues = withHome(home, () => withCwd(tmp, () => runChecks()));
  });
  afterAll(() => cleanupTmp([tmp, home]));

  it('does NOT report ERROR about missing z (home design.json is shadowed)', () => {
    expect(findIssue(issues, 'ERROR', "'z'")).toBeUndefined();
  });
  it('reports no ERRORs', () => {
    expect(bySev(issues, 'ERROR')).toEqual([]);
  });
});

describe('check — home design.json used when project lacks one', () => {
  let tmp: string; let home: string;
  let issues: CheckIssue[];

  beforeAll(() => {
    ({ tmp, home } = setupTmp('chk-homefallback-'));
    // project: a plugin folder but no design.json
    writePlugin(tmp, { name: 'a', templateSets: { base: { artifact: 'body' } } });
    // home: design.json → a (project's a folder will be used because
    // pluginLookupOrder checks project first)
    mkdirSync(join(home, '.aet', 'design'), { recursive: true });
    writeFileSync(join(home, '.aet', 'design', 'design.json'), JSON.stringify({ plugin: 'a' }));
    issues = withHome(home, () => withCwd(tmp, () => runChecks()));
  });
  afterAll(() => cleanupTmp([tmp, home]));

  it('resolves active plugin a from home design.json', () => {
    expect(findIssue(issues, 'WARNING', 'no design.json')).toBeUndefined();
  });
  it('reports no ERRORs', () => {
    expect(bySev(issues, 'ERROR')).toEqual([]);
  });
});

describe('check — parseArgs', () => {
  it('no arg → null', () => {
    expect(parseArgs([]).projectRoot).toBeNull();
  });
  it('one arg → that string', () => {
    expect(parseArgs(['/tmp/proj']).projectRoot).toBe('/tmp/proj');
  });
  it('relative path passed through', () => {
    expect(parseArgs(['foo/bar']).projectRoot).toBe('foo/bar');
  });
});
