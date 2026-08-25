/**
 * ST (System Test) for the `template` subcommand of aet-design-env.
 *
 * Strategy: end-to-end test of the new plugin-chain behavior under the
 * plugin=wrapper + path-arg model. Each case spawns the built CLI
 * (`scripts/aet-design-env.mjs template <path>`) inside a temp project dir
 * pre-populated with:
 *   - `.aet/design/<pluginName>/<templateSet>/{artifact.md, components/...}`
 *     folders (plugin = wrapper around one or more template-set subdirs)
 *   - `.aet/design/<pluginName>/plugin.json` (depends_on / shields)
 *   - optional `.aet/design/design.json` (active plugin selector)
 *   - a separate `<tmpDir>/<templateSet>/` folder as the path-arg fallback
 *     (this is what the CLI is invoked with — basename(path) = template-set
 *     name that chain plugins are walked for)
 *
 * Asserts stdout (assembled document), stderr (warnings/errors), exit code.
 *
 * Cases:
 *   1. Full chain (a → b → c) — mixed component sources + metadata auto-fill.
 *   2. Self-exempt shield — a shields X, a has X → use a's copy.
 *   3. Passthrough shield — b shields Y, c has Y → silently skipped.
 *   4. design.json resolution — reads .aet/design/design.json → active plugin.
 *   5. Path-arg fallback (no design.json) — chain empty, fallback provides all.
 *   6. Shield blocks path-arg fallback — a shields X, no plugin has X,
 *      path-arg has X → silently skipped.
 *   7. Missing component (chain exhausted, no shield, fallback lacks it)
 *      → placeholder + stderr warning.
 *   8. Circular dependency (a → b → a) → error + exit 1.
 *   9. Broken depends_on (a → z, z missing) → error + exit 1.
 *
 * Run:  npm run st      (from skills/aet-design-env/scripts/src)
 *   or: node template.st.mjs
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
 * Each template-set subdir contains artifact.md and/or components/<X>.md.
 * If spec.config is provided, also writes plugin.json at the plugin root.
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

/**
 * Write a standalone template-set folder at `<root>/<setName>/`. This is the
 * path-arg fallback — what the CLI is invoked with. Returns the absolute path
 * to the template-set folder so it can be passed to runCli.
 */
function writeTemplateSet(root, setName, spec) {
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

function writeDesign(root, plugin) {
  const base = join(root, '.aet', 'design');
  mkdirSync(base, { recursive: true });
  writeFileSync(join(base, 'design.json'), JSON.stringify({ plugin }));
}

// update_time carries the generation timestamp — normalize before compare.
const UPDATE_TIME_RE = /^update_time:.*$/m;
function normalize(stdout) {
  return stdout.replace(UPDATE_TIME_RE, 'update_time: NORMALIZED');
}

function runCli(cwd, args, home) {
  // Always isolate HOME so the author's real ~/.aet/design/ doesn't leak in.
  // If caller doesn't pass one, use a fresh empty tmp dir.
  const isolatedHome = home ?? mkdtempSync(join(tmpdir(), 'tmpl-st-home-'));
  const env = { ...process.env, HOME: isolatedHome };
  const r = spawnSync(process.execPath, [CLI, 'template', ...args], {
    encoding: 'utf-8',
    cwd,
    env,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    console.error(`\n[FAIL] ${label}`);
    console.error('--- expected ---');
    console.error(JSON.stringify(expected));
    console.error('--- actual ---');
    console.error(JSON.stringify(actual));
    process.exit(1);
  } else {
    console.log(`[PASS] ${label}`);
  }
}

function assertContains(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    console.error(`\n[FAIL] ${label}`);
    console.error(`Expected stdout to contain: ${JSON.stringify(needle)}`);
    console.error('--- actual stdout ---');
    console.error(haystack);
    process.exit(1);
  } else {
    console.log(`[PASS] ${label}`);
  }
}

function assertNotContains(haystack, needle, label) {
  if (haystack.includes(needle)) {
    console.error(`\n[FAIL] ${label}`);
    console.error(`Expected stdout NOT to contain: ${JSON.stringify(needle)}`);
    console.error('--- actual stdout ---');
    console.error(haystack);
    process.exit(1);
  } else {
    console.log(`[PASS] ${label}`);
  }
}

function assertMatch(haystack, re, label) {
  if (!re.test(haystack)) {
    console.error(`\n[FAIL] ${label}`);
    console.error(`Expected stdout to match: ${re}`);
    console.error('--- actual stdout ---');
    console.error(haystack);
    process.exit(1);
  } else {
    console.log(`[PASS] ${label}`);
  }
}

// --- Component fixtures (frontmatter + body) -------------------------------

const INTRO_B = `---
heading_level: 2
---
## Intro
From plugin b
`;

const SECTION_C = `---
heading_level: 2
---
## Section
From c
`;

const DEEP_C = `---
heading_level: 2
---
## Deep
From c
`;

const SHARED_A = `---
heading_level: 2
---
## Shared
From a (self)
`;

const SHARED_B = `---
heading_level: 2
---
## Shared
From b
`;

const SHARED_C = `---
heading_level: 2
---
## Shared
From c
`;

const ONLY_C = `---
heading_level: 2
---
## Only C
From c
`;

const ONLY_B = `---
heading_level: 2
---
## Only B
From b
`;

const HAS_IT_M = `---
heading_level: 2
---
## Has It
From m
`;

const META_B = `---
update_time: 2020-01-01 00:00:00 (UTC+0)
version: 1.0
---
`;

// Path-arg fallback fixtures (prove the path-arg source is used).
const FALLBACK_INTRO = `---
heading_level: 2
---
## Intro
From fallback
`;

const FALLBACK_HAS_IT = `---
heading_level: 2
---
## Has It
From fallback
`;

const FALLBACK_BLOCKED = `---
heading_level: 2
---
## Blocked
From fallback
`;

// --- Main ------------------------------------------------------------------

function main() {
  if (!existsSync(CLI)) {
    console.error(`CLI not found: ${CLI} — run \`npm run build\` first.`);
    process.exit(2);
  }

  console.log('=== ST: aet-design-env template (plugin=wrapper + path-arg) ===\n');

  // Case 1: full chain (a → b → c) with mixed component sources + metadata.
  // Chain provides everything; path-arg fallback is empty.
  {
    const dir = mkdtempSync(join(tmpdir(), 'tmpl-st-chain-'));
    try {
      writeDesign(dir, 'a');
      writePlugin(dir, {
        name: 'a',
        config: { depends_on: 'b' },
        templateSets: { base: { artifact: `{{intro,2}}\n\n{{section,3}}\n\n{{deep,2}}\n` } },
      });
      writePlugin(dir, {
        name: 'b',
        config: { depends_on: 'c' },
        templateSets: { base: { components: { intro: INTRO_B, metadata: META_B } } },
      });
      writePlugin(dir, {
        name: 'c',
        templateSets: { base: { components: { section: SECTION_C, deep: DEEP_C } } },
      });
      const fb = writeTemplateSet(dir, 'base', {});
      const r = runCli(dir, [fb]);
      if (r.status !== 0) {
        throw new Error(`Case 1 exited ${r.status}\nstderr: ${r.stderr}`);
      }
      const out = normalize(r.stdout);
      assertContains(out, '## §1 Intro', 'Case 1: intro from b (level 2, §1)');
      assertContains(out, 'From plugin b', 'Case 1: intro body from b');
      assertContains(out, '### 1.1 Section', 'Case 1: section from c (level 3, 1.1)');
      assertContains(out, 'From c', 'Case 1: section body from c');
      assertContains(out, '## §2 Deep', 'Case 1: deep from c (level 2, §2)');
      assertContains(out, 'version: 1.0', 'Case 1: metadata from b (version)');
      assertMatch(out, /update_time: NORMALIZED/, 'Case 1: metadata update_time auto-filled');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // Case 2: self-exempt shield (a shields X, a has X → use a's copy).
  {
    const dir = mkdtempSync(join(tmpdir(), 'tmpl-st-self-'));
    try {
      writeDesign(dir, 'a');
      writePlugin(dir, {
        name: 'a',
        config: { depends_on: 'b', shields: { base: ['shared'] } },
        templateSets: {
          base: {
            artifact: `{{shared,2}}\n\n{{only-b,2}}\n`,
            components: { shared: SHARED_A },
          },
        },
      });
      writePlugin(dir, {
        name: 'b',
        templateSets: { base: { components: { shared: SHARED_B, 'only-b': ONLY_B } } },
      });
      const fb = writeTemplateSet(dir, 'base', {});
      const r = runCli(dir, [fb]);
      if (r.status !== 0) {
        throw new Error(`Case 2 exited ${r.status}\nstderr: ${r.stderr}`);
      }
      assertContains(r.stdout, '## §1 Shared\nFrom a (self)', 'Case 2: a\'s own shared (self-exempt)');
      assertNotContains(r.stdout, '## §1 Shared\nFrom b', 'Case 2: b\'s shared NOT used');
      assertContains(r.stdout, 'From b', 'Case 2: only-b from b (unshielded)');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // Case 3: passthrough shield (b shields Y, c has Y → silently skipped).
  {
    const dir = mkdtempSync(join(tmpdir(), 'tmpl-st-passthrough-'));
    try {
      writeDesign(dir, 'a');
      writePlugin(dir, {
        name: 'a',
        config: { depends_on: 'b' },
        templateSets: { base: { artifact: `{{shared,2}}\n\n{{only-c,2}}\n` } },
      });
      writePlugin(dir, {
        name: 'b',
        config: { depends_on: 'c', shields: { base: ['only-c'] } },
        templateSets: { base: {} },
      });
      writePlugin(dir, {
        name: 'c',
        templateSets: { base: { components: { shared: SHARED_C, 'only-c': ONLY_C } } },
      });
      const fb = writeTemplateSet(dir, 'base', {});
      const r = runCli(dir, [fb]);
      if (r.status !== 0) {
        throw new Error(`Case 3 exited ${r.status}\nstderr: ${r.stderr}`);
      }
      assertContains(r.stdout, '## §1 Shared\nFrom c', 'Case 3: shared from c (unshielded, chain reaches c)');
      assertNotContains(r.stdout, 'Only C', 'Case 3: only-c silently skipped (b\'s passthrough shield)');
      assertNotContains(r.stdout, 'Missing component', 'Case 3: no missing-component placeholder for shielded');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // Case 4: design.json resolution (CLI reads .aet/design/design.json → active plugin).
  {
    const dir = mkdtempSync(join(tmpdir(), 'tmpl-st-design-'));
    try {
      writeDesign(dir, 'a');
      writePlugin(dir, {
        name: 'a',
        config: { depends_on: 'b' },
        templateSets: { base: { artifact: `{{intro,2}}\n` } },
      });
      writePlugin(dir, {
        name: 'b',
        templateSets: { base: { components: { intro: INTRO_B } } },
      });
      const fb = writeTemplateSet(dir, 'base', {});
      const r = runCli(dir, [fb]);
      if (r.status !== 0) {
        throw new Error(`Case 4 exited ${r.status}\nstderr: ${r.stderr}`);
      }
      assertContains(r.stdout, '## §1 Intro', 'Case 4: reads design.json → plugin a');
      assertContains(r.stdout, 'From plugin b', 'Case 4: chain reaches b');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // Case 5: path-arg fallback (no design.json, no plugins) — fallback provides all.
  {
    const dir = mkdtempSync(join(tmpdir(), 'tmpl-st-fallback-'));
    try {
      // No writeDesign, no writePlugin — chain is empty.
      const fb = writeTemplateSet(dir, 'base', {
        artifact: `{{intro,2}}\n\n{{has-it,2}}\n`,
        components: { intro: FALLBACK_INTRO, 'has-it': FALLBACK_HAS_IT },
      });
      const r = runCli(dir, [fb]);
      if (r.status !== 0) {
        throw new Error(`Case 5 exited ${r.status}\nstderr: ${r.stderr}`);
      }
      assertContains(r.stdout, '## §1 Intro', 'Case 5: intro section from path-arg fallback');
      assertContains(r.stdout, 'From fallback', 'Case 5: intro body from fallback');
      assertContains(r.stdout, '## §2 Has It', 'Case 5: has-it section from path-arg fallback');
      assertNotContains(r.stdout, 'Missing component', 'Case 5: no missing-component (fallback has everything)');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // Case 6: shield blocks path-arg fallback (a shields X, no plugin has X,
  // path-arg has X → silently skipped).
  {
    const dir = mkdtempSync(join(tmpdir(), 'tmpl-st-shield-fallback-'));
    try {
      writeDesign(dir, 'a');
      writePlugin(dir, {
        name: 'a',
        config: { depends_on: 'b', shields: { base: ['blocked'] } },
        templateSets: {
          base: {
            artifact: `{{blocked,2}}\n\n{{intro,2}}\n`,
          },
        },
      });
      writePlugin(dir, {
        name: 'b',
        templateSets: { base: { components: { intro: INTRO_B } } },
      });
      const fb = writeTemplateSet(dir, 'base', {
        components: { blocked: FALLBACK_BLOCKED },
      });
      const r = runCli(dir, [fb]);
      if (r.status !== 0) {
        throw new Error(`Case 6 exited ${r.status}\nstderr: ${r.stderr}`);
      }
      assertNotContains(r.stdout, '## §1 Blocked', 'Case 6: blocked section silently skipped (shield blocks fallback)');
      assertNotContains(r.stdout, 'From fallback', 'Case 6: fallback copy NOT used (shielded)');
      assertNotContains(r.stdout, 'Missing component', 'Case 6: no missing placeholder (shielded, not missing)');
      assertContains(r.stdout, '## §1 Intro', 'Case 6: intro from b (unshielded, chain reaches b)');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // Case 7: missing component (chain exhausted, no shield, fallback lacks it)
  // → placeholder + stderr warning.
  {
    const dir = mkdtempSync(join(tmpdir(), 'tmpl-st-missing-'));
    try {
      // No design.json, no plugins — chain is empty.
      const fb = writeTemplateSet(dir, 'base', {
        artifact: `{{has-it,2}}\n\n{{no-it,2}}\n`,
        components: { 'has-it': FALLBACK_HAS_IT },
      });
      const r = runCli(dir, [fb]);
      if (r.status !== 0) {
        throw new Error(`Case 7 exited ${r.status}\nstderr: ${r.stderr}`);
      }
      assertContains(r.stdout, '## §1 Has It', 'Case 7: present component inlined from fallback');
      assertContains(r.stdout, '[Missing component: no-it]', 'Case 7: missing-component placeholder emitted');
      assertContains(r.stderr, 'Component not found', 'Case 7: stderr warning emitted');
      assertContains(r.stderr, 'no-it', 'Case 7: stderr warning names missing component');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // Case 8: circular dependency (a → b → a) → error + exit 1.
  {
    const dir = mkdtempSync(join(tmpdir(), 'tmpl-st-circular-'));
    try {
      writeDesign(dir, 'a');
      writePlugin(dir, {
        name: 'a',
        config: { depends_on: 'b' },
        templateSets: { base: { artifact: `## A\n` } },
      });
      writePlugin(dir, {
        name: 'b',
        config: { depends_on: 'a' },
        templateSets: { base: { artifact: `## B\n` } },
      });
      const fb = writeTemplateSet(dir, 'base', {});
      const r = runCli(dir, [fb]);
      if (r.status === 0) {
        throw new Error(`Case 8 expected non-zero exit, got ${r.status}`);
      }
      assertContains(r.stderr, 'Circular plugin dependency detected', 'Case 8: circular-dep error message');
      assertContains(r.stderr, 'a -> b -> a', 'Case 8: cycle path in error message');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // Case 9: broken depends_on (a → z, z missing) → error + exit 1.
  {
    const dir = mkdtempSync(join(tmpdir(), 'tmpl-st-broken-dep-'));
    try {
      writeDesign(dir, 'a');
      writePlugin(dir, {
        name: 'a',
        config: { depends_on: 'z' },
        templateSets: { base: { artifact: `## A\n` } },
      });
      const fb = writeTemplateSet(dir, 'base', {});
      const r = runCli(dir, [fb]);
      if (r.status === 0) {
        throw new Error(`Case 9 expected non-zero exit, got ${r.status}`);
      }
      assertContains(r.stderr, "Dependency 'z'", 'Case 9: error names the missing dependency');
      assertContains(r.stderr, 'not found at either level', 'Case 9: error says "not found at either level"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  console.log('\nAll system tests passed.');
}

main();
