/**
 * ST (System Test) for the `checklist` subcommand of aet-design-env.
 *
 * Strategy: end-to-end test of plugin-chain behavior under the
 * plugin=wrapper + path-arg model. Each case spawns the built CLI
 * (`scripts/aet-design-env.mjs checklist <path>`) inside a temp project dir
 * pre-populated with:
 *   - `.aet/design/<pluginName>/<checklistSet>/{checklist.md, components/...}`
 *     folders (plugin = wrapper around one or more checklist-set subdirs)
 *   - `.aet/design/<pluginName>/plugin.json` (depends_on / shields)
 *   - optional `.aet/design/design.json` (active plugin selector)
 *   - a separate `<tmpDir>/<checklistSet>/` folder as the path-arg fallback
 *     (this is what the CLI is invoked with — basename(path) = checklist-set
 *     name that chain plugins are walked for)
 *
 * Asserts stdout (assembled checklist), stderr (warnings/errors), exit code.
 *
 * Differences from template.st.mjs:
 *   - skeleton = checklist.md (not artifact.md)
 *   - component content read from frontmatter `checklist:` field (not body)
 *   - placeholder `{{name}}` (no `,level`)
 *   - no heading_level adjustment, no section numbering, no metadata prepend
 *
 * Cases:
 *   1. Full chain (a → b → c) — mixed component sources.
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
 *   or: node checklist.st.mjs
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

function writePlugin(root, spec) {
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

function writeChecklistSet(root, setName, spec) {
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

function writeDesign(root, plugin) {
  const base = join(root, '.aet', 'design');
  mkdirSync(base, { recursive: true });
  writeFileSync(join(base, 'design.json'), JSON.stringify({ plugin }));
}

function runCli(cwd, args, home) {
  // Always isolate HOME so the author's real ~/.aet/design/ doesn't leak in.
  const isolatedHome = home ?? mkdtempSync(join(tmpdir(), 'cl-st-home-'));
  const env = { ...process.env, HOME: isolatedHome };
  const r = spawnSync(process.execPath, [CLI, 'checklist', ...args], {
    encoding: 'utf-8',
    cwd,
    env,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

function assertContains(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    console.error(`\n[FAIL] ${label}`);
    console.error(`Expected stdout/stderr to contain: ${JSON.stringify(needle)}`);
    console.error('--- actual ---');
    console.error(haystack);
    process.exit(1);
  } else {
    console.log(`[PASS] ${label}`);
  }
}

function assertNotContains(haystack, needle, label) {
  if (haystack.includes(needle)) {
    console.error(`\n[FAIL] ${label}`);
    console.error(`Expected stdout/stderr NOT to contain: ${JSON.stringify(needle)}`);
    console.error('--- actual ---');
    console.error(haystack);
    process.exit(1);
  } else {
    console.log(`[PASS] ${label}`);
  }
}

// --- Component fixtures (frontmatter-only: `checklist:` block scalar) ------

const INTRO_B = `---
checklist: |
  - [ ] Intro item from b
---\n`;
const SECTION_C = `---
checklist: |
  - [ ] Section item from c
---\n`;
const DEEP_C = `---
checklist: |
  - [ ] Deep item from c
---\n`;
const SHARED_A = `---
checklist: |
  - [ ] Shared from a (self)
---\n`;
const SHARED_B = `---
checklist: |
  - [ ] Shared from b
---\n`;
const SHARED_C = `---
checklist: |
  - [ ] Shared from c
---\n`;
const ONLY_C = `---
checklist: |
  - [ ] Only C from c
---\n`;
const ONLY_B = `---
checklist: |
  - [ ] Only B from b
---\n`;
const HAS_IT_M = `---
checklist: |
  - [ ] Has It from m
---\n`;
const FALLBACK_INTRO = `---
checklist: |
  - [ ] Intro from fallback
---\n`;
const FALLBACK_HAS_IT = `---
checklist: |
  - [ ] Has It from fallback
---\n`;
const FALLBACK_BLOCKED = `---
checklist: |
  - [ ] Blocked from fallback
---\n`;

// --- Main ------------------------------------------------------------------

function main() {
  if (!existsSync(CLI)) {
    console.error(`CLI not found: ${CLI} — run \`npm run build\` first.`);
    process.exit(2);
  }

  console.log('=== ST: aet-design-env checklist (plugin=wrapper + path-arg) ===\n');

  // Case 1: full chain (a → b → c) — mixed component sources.
  // Chain provides everything; path-arg fallback is empty.
  {
    const dir = mkdtempSync(join(tmpdir(), 'cl-st-chain-'));
    try {
      writeDesign(dir, 'a');
      writePlugin(dir, {
        name: 'a',
        config: { depends_on: 'b' },
        checklistSets: { base: { checklist: `# Checklist\n\n{{intro}}\n\n{{section}}\n\n{{deep}}\n` } },
      });
      writePlugin(dir, {
        name: 'b',
        config: { depends_on: 'c' },
        checklistSets: { base: { components: { intro: INTRO_B } } },
      });
      writePlugin(dir, {
        name: 'c',
        checklistSets: { base: { components: { section: SECTION_C, deep: DEEP_C } } },
      });
      const fb = writeChecklistSet(dir, 'base', {});
      const r = runCli(dir, [fb]);
      if (r.status !== 0) {
        throw new Error(`Case 1 exited ${r.status}\nstderr: ${r.stderr}`);
      }
      assertContains(r.stdout, 'Intro item from b', 'Case 1: intro from b');
      assertContains(r.stdout, 'Section item from c', 'Case 1: section from c');
      assertContains(r.stdout, 'Deep item from c', 'Case 1: deep from c');
      assertNotContains(r.stdout, 'Missing component', 'Case 1: no missing-component placeholder');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // Case 2: self-exempt shield (a shields X, a has X → use a's copy).
  {
    const dir = mkdtempSync(join(tmpdir(), 'cl-st-self-'));
    try {
      writeDesign(dir, 'a');
      writePlugin(dir, {
        name: 'a',
        config: { depends_on: 'b', shields: { base: ['shared'] } },
        checklistSets: {
          base: {
            checklist: `{{shared}}\n\n{{only-b}}\n`,
            components: { shared: SHARED_A },
          },
        },
      });
      writePlugin(dir, {
        name: 'b',
        checklistSets: { base: { components: { shared: SHARED_B, 'only-b': ONLY_B } } },
      });
      const fb = writeChecklistSet(dir, 'base', {});
      const r = runCli(dir, [fb]);
      if (r.status !== 0) {
        throw new Error(`Case 2 exited ${r.status}\nstderr: ${r.stderr}`);
      }
      assertContains(r.stdout, 'Shared from a (self)', "Case 2: a's own shared (self-exempt)");
      assertNotContains(r.stdout, 'Shared from b', "Case 2: b's shared NOT used");
      assertContains(r.stdout, 'Only B from b', 'Case 2: only-b from b (unshielded)');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // Case 3: passthrough shield (b shields Y, c has Y → silently skipped).
  {
    const dir = mkdtempSync(join(tmpdir(), 'cl-st-passthrough-'));
    try {
      writeDesign(dir, 'a');
      writePlugin(dir, {
        name: 'a',
        config: { depends_on: 'b' },
        checklistSets: { base: { checklist: `{{shared}}\n\n{{only-c}}\n` } },
      });
      writePlugin(dir, {
        name: 'b',
        config: { depends_on: 'c', shields: { base: ['only-c'] } },
        checklistSets: { base: {} },
      });
      writePlugin(dir, {
        name: 'c',
        checklistSets: { base: { components: { shared: SHARED_C, 'only-c': ONLY_C } } },
      });
      const fb = writeChecklistSet(dir, 'base', {});
      const r = runCli(dir, [fb]);
      if (r.status !== 0) {
        throw new Error(`Case 3 exited ${r.status}\nstderr: ${r.stderr}`);
      }
      assertContains(r.stdout, 'Shared from c', 'Case 3: shared from c (unshielded, chain reaches c)');
      assertNotContains(r.stdout, 'Only C', "Case 3: only-c silently skipped (b's passthrough shield)");
      assertNotContains(r.stdout, 'Missing component', 'Case 3: no missing-component placeholder for shielded');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // Case 4: design.json resolution (CLI reads .aet/design/design.json → active plugin).
  {
    const dir = mkdtempSync(join(tmpdir(), 'cl-st-design-'));
    try {
      writeDesign(dir, 'a');
      writePlugin(dir, {
        name: 'a',
        config: { depends_on: 'b' },
        checklistSets: { base: { checklist: `{{intro}}\n` } },
      });
      writePlugin(dir, {
        name: 'b',
        checklistSets: { base: { components: { intro: INTRO_B } } },
      });
      const fb = writeChecklistSet(dir, 'base', {});
      const r = runCli(dir, [fb]);
      if (r.status !== 0) {
        throw new Error(`Case 4 exited ${r.status}\nstderr: ${r.stderr}`);
      }
      assertContains(r.stdout, 'Intro item from b', 'Case 4: reads design.json → plugin a, chain reaches b');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // Case 5: path-arg fallback (no design.json, no plugins) — fallback provides all.
  {
    const dir = mkdtempSync(join(tmpdir(), 'cl-st-fallback-'));
    try {
      // No writeDesign, no writePlugin — chain is empty.
      const fb = writeChecklistSet(dir, 'base', {
        checklist: `{{intro}}\n\n{{has-it}}\n`,
        components: { intro: FALLBACK_INTRO, 'has-it': FALLBACK_HAS_IT },
      });
      const r = runCli(dir, [fb]);
      if (r.status !== 0) {
        throw new Error(`Case 5 exited ${r.status}\nstderr: ${r.stderr}`);
      }
      assertContains(r.stdout, 'Intro from fallback', 'Case 5: intro from path-arg fallback');
      assertContains(r.stdout, 'Has It from fallback', 'Case 5: has-it from path-arg fallback');
      assertNotContains(r.stdout, 'Missing component', 'Case 5: no missing-component (fallback has everything)');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // Case 6: shield blocks path-arg fallback (a shields X, no plugin has X,
  // path-arg has X → silently skipped).
  {
    const dir = mkdtempSync(join(tmpdir(), 'cl-st-shield-fallback-'));
    try {
      writeDesign(dir, 'a');
      writePlugin(dir, {
        name: 'a',
        config: { depends_on: 'b', shields: { base: ['blocked'] } },
        checklistSets: {
          base: {
            checklist: `{{blocked}}\n\n{{intro}}\n`,
          },
        },
      });
      writePlugin(dir, {
        name: 'b',
        checklistSets: { base: { components: { intro: INTRO_B } } },
      });
      const fb = writeChecklistSet(dir, 'base', {
        components: { blocked: FALLBACK_BLOCKED },
      });
      const r = runCli(dir, [fb]);
      if (r.status !== 0) {
        throw new Error(`Case 6 exited ${r.status}\nstderr: ${r.stderr}`);
      }
      assertNotContains(r.stdout, 'Blocked from fallback', 'Case 6: blocked silently skipped (shield blocks fallback)');
      assertNotContains(r.stdout, 'Missing component', 'Case 6: no missing placeholder (shielded, not missing)');
      assertContains(r.stdout, 'Intro item from b', 'Case 6: intro from b (unshielded, chain reaches b)');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // Case 7: missing component (chain exhausted, no shield, fallback lacks it)
  // → placeholder + stderr warning.
  {
    const dir = mkdtempSync(join(tmpdir(), 'cl-st-missing-'));
    try {
      // No design.json, no plugins — chain is empty.
      const fb = writeChecklistSet(dir, 'base', {
        checklist: `{{has-it}}\n\n{{no-it}}\n`,
        components: { 'has-it': FALLBACK_HAS_IT },
      });
      const r = runCli(dir, [fb]);
      if (r.status !== 0) {
        throw new Error(`Case 7 exited ${r.status}\nstderr: ${r.stderr}`);
      }
      assertContains(r.stdout, 'Has It from fallback', 'Case 7: present component inlined from fallback');
      assertContains(r.stdout, '[Missing component: no-it]', 'Case 7: missing-component placeholder emitted');
      assertContains(r.stderr, 'Component not found', 'Case 7: stderr warning emitted');
      assertContains(r.stderr, 'no-it', 'Case 7: stderr warning names missing component');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  // Case 8: circular dependency (a → b → a) → error + exit 1.
  {
    const dir = mkdtempSync(join(tmpdir(), 'cl-st-circular-'));
    try {
      writeDesign(dir, 'a');
      writePlugin(dir, {
        name: 'a',
        config: { depends_on: 'b' },
        checklistSets: { base: { checklist: `# A\n` } },
      });
      writePlugin(dir, {
        name: 'b',
        config: { depends_on: 'a' },
        checklistSets: { base: { checklist: `# B\n` } },
      });
      const fb = writeChecklistSet(dir, 'base', {});
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
    const dir = mkdtempSync(join(tmpdir(), 'cl-st-broken-dep-'));
    try {
      writeDesign(dir, 'a');
      writePlugin(dir, {
        name: 'a',
        config: { depends_on: 'z' },
        checklistSets: { base: { checklist: `# A\n` } },
      });
      const fb = writeChecklistSet(dir, 'base', {});
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
