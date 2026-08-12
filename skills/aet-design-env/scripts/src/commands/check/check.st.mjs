/**
 * ST (System Test) for the `check` subcommand of aet-design-env.
 *
 * Strategy: end-to-end audit of env config + plugin configs under the
 * plugin=wrapper + 2-level lookup model. Each case spawns the built CLI
 * (`scripts/aet-design-env.mjs check [project-root]`) inside a temp project
 * dir pre-populated with `.aet/design/<pluginName>/<templateSet>/...`
 * folders (plugin = wrapper). Asserts stdout findings, stderr summary,
 * and exit code.
 *
 * Cases:
 *   1. Clean env — no issues, exit 0, stderr "No issues found".
 *   2. design.json malformed — ERROR on stdout, exit 1.
 *   3. plugin.json depends_on wrong type — ERROR on stdout, exit 1.
 *   4. Broken depends_on (chain → missing plugin) — ERROR on stdout, exit 1.
 *   5. Circular dependency (a → b → a) — ERROR on stdout, exit 1.
 *   6. No design.json at project or home — WARNING on stdout, exit 0.
 *   7. Ghost plugin folder (no plugin.json, no template-set subdirs) — WARNING.
 *   8. Passthrough plugin (only plugin.json, no template-set subdirs) — INFO.
 *   9. Scoped scan: `check <path>` chdir's into the path.
 *  10. Bad path arg — error on stderr, exit 1.
 *
 * (Removed from old version: "missing artifact.md in chain" and
 * "placeholder not resolvable" cases — these rules were deleted from
 * check.ts because check doesn't know which template-set will be requested;
 * per-template-set audits belong to template.ts / template.test.ts.)
 *
 * Run:  npm run st      (from skills/aet-design-env/scripts/src)
 *   or: node check.st.mjs
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..', '..');
const CLI = resolve(REPO_ROOT, 'skills/aet-design-env/scripts/aet-design-env.mjs');

// --- Helpers ----------------------------------------------------------------

/**
 * Write a plugin folder under `<root>/.aet/design/<spec.name>/`. The plugin
 * wraps one or more template-set subdirs (keyed by setName in spec.templateSets).
 * If spec.config is provided, also writes plugin.json at the plugin root.
 * A plugin with only `config` (no templateSets) is a passthrough plugin.
 */
function writePlugin(root, spec) {
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

function writeDesign(root, plugin) {
  const base = join(root, '.aet', 'design');
  mkdirSync(base, { recursive: true });
  writeFileSync(join(base, 'design.json'), JSON.stringify({ plugin }));
}

function writeRawDesign(root, raw) {
  const base = join(root, '.aet', 'design');
  mkdirSync(base, { recursive: true });
  writeFileSync(join(base, 'design.json'), raw);
}

function writeRawPluginJson(root, pluginName, raw) {
  const base = join(root, '.aet', 'design', pluginName);
  mkdirSync(base, { recursive: true });
  writeFileSync(join(base, 'plugin.json'), raw);
}

// Run `aet-design-env check [path]`. If `path` omitted, runs from `cwd`.
// We always set HOME to a temp empty dir so the test author's real
// ~/.aet/design/ doesn't interfere.
function runCli(cwd, args, home) {
  const env = { ...process.env, HOME: home };
  const r = spawnSync(process.execPath, [CLI, 'check', ...args], {
    encoding: 'utf-8',
    cwd,
    env,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    console.error(`\n[FAIL] ${label}`);
    console.error(`  expected: ${JSON.stringify(expected)}`);
    console.error(`  actual  : ${JSON.stringify(actual)}`);
    fails++;
  } else {
    passes++;
    console.log(`  [PASS] ${label}`);
  }
}

function assertContains(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    console.error(`\n[FAIL] ${label}`);
    console.error(`  expected stdout to contain: ${JSON.stringify(needle)}`);
    console.error(`  actual stdout:\n${haystack}`);
    fails++;
  } else {
    passes++;
    console.log(`  [PASS] ${label}`);
  }
}

function assertNotContains(haystack, needle, label) {
  if (haystack.includes(needle)) {
    console.error(`\n[FAIL] ${label}`);
    console.error(`  expected stdout to NOT contain: ${JSON.stringify(needle)}`);
    console.error(`  actual stdout:\n${haystack}`);
    fails++;
  } else {
    passes++;
    console.log(`  [PASS] ${label}`);
  }
}

let passes = 0;
let fails = 0;
let caseNum = 0;

function caseStart(name) {
  caseNum++;
  console.log(`\n--- Case ${caseNum}: ${name} ---`);
}

// --- Cases ------------------------------------------------------------------

// Case 1: clean env — no issues
{
  caseStart('clean env (no issues)');
  const tmp = mkdtempSync(join(tmpdir(), 'st-chk-clean-'));
  const home = mkdtempSync(join(tmpdir(), 'st-chk-clean-h-'));
  try {
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
    const r = runCli(tmp, [], home);
    assertEqual(r.status, 0, 'exit 0 (no errors)');
    assertEqual(r.stdout, '', 'stdout empty (no findings)');
    assertContains(r.stderr, 'No issues found', 'stderr says no issues');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}

// Case 2: design.json malformed JSON
{
  caseStart('design.json malformed JSON');
  const tmp = mkdtempSync(join(tmpdir(), 'st-chk-djm-'));
  const home = mkdtempSync(join(tmpdir(), 'st-chk-djm-h-'));
  try {
    writePlugin(tmp, { name: 'a', templateSets: { base: { artifact: 'body' } } });
    writeRawDesign(tmp, '{ not json');
    const r = runCli(tmp, [], home);
    assertEqual(r.status, 1, 'exit 1 (ERROR)');
    assertContains(r.stdout, '[ERROR]', 'stdout has ERROR line');
    assertContains(r.stdout, 'malformed JSON', 'stdout mentions malformed JSON');
    assertContains(r.stderr, '1 error(s)', 'stderr summary shows 1 error');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}

// Case 3: plugin.json depends_on wrong type
{
  caseStart('plugin.json depends_on wrong type');
  const tmp = mkdtempSync(join(tmpdir(), 'st-chk-pjdt-'));
  const home = mkdtempSync(join(tmpdir(), 'st-chk-pjdt-h-'));
  try {
    writeRawPluginJson(tmp, 'a', JSON.stringify({ depends_on: 42 }));
    writePlugin(tmp, { name: 'a', templateSets: { base: { artifact: 'body' } } });
    writeDesign(tmp, 'a');
    const r = runCli(tmp, [], home);
    assertEqual(r.status, 1, 'exit 1');
    assertContains(r.stdout, "'depends_on' must be a string or null", 'stdout mentions depends_on type');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}

// Case 4: broken depends_on (chain → missing plugin)
{
  caseStart('broken depends_on');
  const tmp = mkdtempSync(join(tmpdir(), 'st-chk-brk-'));
  const home = mkdtempSync(join(tmpdir(), 'st-chk-brk-h-'));
  try {
    writePlugin(tmp, {
      name: 'a',
      config: { depends_on: 'ghost' },
      templateSets: { base: { artifact: 'body' } },
    });
    writeDesign(tmp, 'a');
    const r = runCli(tmp, [], home);
    assertEqual(r.status, 1, 'exit 1');
    assertContains(r.stdout, '[ERROR]', 'stdout has ERROR');
    assertContains(r.stdout, 'ghost', 'stdout mentions missing plugin');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}

// Case 5: circular dependency
{
  caseStart('circular dependency (a → b → a)');
  const tmp = mkdtempSync(join(tmpdir(), 'st-chk-cyc-'));
  const home = mkdtempSync(join(tmpdir(), 'st-chk-cyc-h-'));
  try {
    writePlugin(tmp, {
      name: 'a',
      config: { depends_on: 'b' },
      templateSets: { base: { artifact: 'body' } },
    });
    writePlugin(tmp, { name: 'b', config: { depends_on: 'a' } });
    writeDesign(tmp, 'a');
    const r = runCli(tmp, [], home);
    assertEqual(r.status, 1, 'exit 1');
    assertContains(r.stdout, 'Circular', 'stdout mentions Circular');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}

// Case 6: no design.json at project or home — WARNING (chain empty,
// `template` path-arg fallback used directly)
{
  caseStart('no design.json (WARNING)');
  const tmp = mkdtempSync(join(tmpdir(), 'st-chk-nodj-'));
  const home = mkdtempSync(join(tmpdir(), 'st-chk-nodj-h-'));
  try {
    writePlugin(tmp, {
      name: 'a',
      templateSets: { base: { artifact: 'body' } },
    });
    // No writeDesign — neither project nor home has design.json.
    const r = runCli(tmp, [], home);
    assertEqual(r.status, 0, 'exit 0 (warnings only)');
    assertContains(r.stdout, '[WARNING]', 'stdout has WARNING');
    assertContains(r.stdout, 'no design.json', 'stdout mentions no design.json');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}

// Case 7: ghost plugin folder (no plugin.json, no template-set subdirs)
{
  caseStart('ghost plugin folder');
  const tmp = mkdtempSync(join(tmpdir(), 'st-chk-ghost-'));
  const home = mkdtempSync(join(tmpdir(), 'st-chk-ghost-h-'));
  try {
    writePlugin(tmp, { name: 'a', templateSets: { base: { artifact: 'body' } } });
    writeDesign(tmp, 'a');
    // Empty 'ghost' plugin folder — no plugin.json, no template-set subdirs.
    mkdirSync(join(tmp, '.aet', 'design', 'ghost'), { recursive: true });
    const r = runCli(tmp, [], home);
    assertEqual(r.status, 0, 'exit 0 (warnings only)');
    assertContains(r.stdout, '[WARNING]', 'stdout has WARNING');
    assertContains(r.stdout, 'ghost plugin folder', 'stdout mentions ghost folder');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}

// Case 8: passthrough plugin (only plugin.json, no template-set subdirs)
{
  caseStart('passthrough plugin (only plugin.json)');
  const tmp = mkdtempSync(join(tmpdir(), 'st-chk-pass-'));
  const home = mkdtempSync(join(tmpdir(), 'st-chk-pass-h-'));
  try {
    // Plugin a: only plugin.json (depends_on: 'b'), no templateSets → INFO.
    writePlugin(tmp, { name: 'a', config: { depends_on: 'b' } });
    writePlugin(tmp, { name: 'b', templateSets: { base: { artifact: 'body' } } });
    writeDesign(tmp, 'a');
    const r = runCli(tmp, [], home);
    assertEqual(r.status, 0, 'exit 0');
    assertContains(r.stdout, '[INFO]', 'stdout has INFO');
    assertContains(r.stdout, 'passthrough plugin', 'stdout mentions passthrough');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}

// Case 9: scoped scan — `check <path>` chdir's into the path
{
  caseStart('scoped scan via path arg');
  const outer = mkdtempSync(join(tmpdir(), 'st-chk-scope-outer-'));
  const home = mkdtempSync(join(tmpdir(), 'st-chk-scope-h-'));
  try {
    // outer/project/ is the path we'll pass to `check`
    const proj = join(outer, 'project');
    writePlugin(proj, { name: 'a', templateSets: { base: { artifact: 'body' } } });
    writeDesign(proj, 'a');
    // Run from `outer` (which has no .aet/design/) but pass `project/` as arg.
    // Should chdir into outer/project and find the clean env.
    const r = runCli(outer, ['project'], home);
    assertEqual(r.status, 0, 'exit 0 (clean scoped env)');
    assertEqual(r.stdout, '', 'stdout empty (no findings)');
    assertContains(r.stderr, 'No issues found', 'stderr says no issues');
  } finally {
    rmSync(outer, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}

// Case 10: bad path arg — error on stderr, exit 1
{
  caseStart('bad path arg');
  const tmp = mkdtempSync(join(tmpdir(), 'st-chk-badpath-'));
  const home = mkdtempSync(join(tmpdir(), 'st-chk-badpath-h-'));
  try {
    const r = runCli(tmp, ['nonexistent-subdir'], home);
    assertEqual(r.status, 1, 'exit 1');
    assertContains(r.stderr, 'does not exist', 'stderr mentions does not exist');
    assertEqual(r.stdout, '', 'stdout empty (no findings — hard failure)');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}

// --- Summary ----------------------------------------------------------------

console.log(`\n========================================================`);
console.log(`check.st.mjs: ${passes} passes, ${fails} fails`);
console.log(`========================================================`);
if (fails > 0) {
  process.exit(1);
}
