/**
 * ST (System Test) for the `setup` subcommand of aet-design-env.
 *
 * Strategy: run the actual bundle in temp project directories, verifying
 * real-world scenarios that UTs (base-agent-tests.ts) can't cover:
 *   1. Fresh "setup all" → all 8 agents' files produced + valid
 *   2. Coexistence → pre-existing deny entries / AGENTS.md content preserved
 *   3. Idempotent re-run → no file changes on second run
 *   4. Uninstall hash-matched → all produced files removed
 *   5. Uninstall user-modified → modified files preserved (hash mismatch)
 *
 * UTs use temp dirs but mock the project structure. This ST uses the REAL
 * bundle + REAL config/agents.json, catching integration bugs that UTs miss
 * (e.g., .claude/settings.local.json coexistence with existing deny arrays,
 * AGENTS.md multi-agent tag injection, manifest hash verification).
 *
 * Run:  npm run st      (from skills/aet-design-env/scripts/src)
 *   or: node setup.st.mjs
 */
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync,
  readdirSync, statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..', '..');
const BUNDLE = resolve(REPO_ROOT, 'skills/aet-design-env/scripts/aet-design-env.mjs');

// Files produced by "setup all" — all 8 agents × their managed files.
const ALL_PRODUCED_FILES = [
  '.claude/rules/aet-design-env.md',
  '.claude/settings.local.json',
  'CLAUDE.md',
  'AGENTS.md',
  '.codex/hooks.json',
  '.cursor/rules/aet-design-env.mdc',
  '.cursor/cli.json',
  'GEMINI.md',
  '.gemini/settings.json',
  '.opencode/agents/aet-design-env.md',
  'opencode.json',
  '.omp/hooks/pre/aet-design-env.ts',
  '.trae/rules/aet-design-env.md',
  '.trae/hooks.json',
];

// Files that uninstall SHOULD remove (PRODUCED — hash-tracked, owned by us).
// Does NOT include CLAUDE.md / AGENTS.md / GEMINI.md — these are RECOVERED
// (inline_tag targets or ruleConfigPath) and are preserved on uninstall
// even if we created them fresh (they are conceptually user-owned).
const REMOVABLE_FILES = [
  '.claude/rules/aet-design-env.md',
  '.claude/settings.local.json',
  '.codex/hooks.json',
  '.cursor/rules/aet-design-env.mdc',
  '.cursor/cli.json',
  '.gemini/settings.json',
  '.opencode/agents/aet-design-env.md',
  'opencode.json',
  '.omp/hooks/pre/aet-design-env.ts',
  '.trae/rules/aet-design-env.md',
  '.trae/hooks.json',
];

// Files that are PRESERVED on uninstall (RECOVERED — user-owned).
const PRESERVED_FILES = [
  'CLAUDE.md',
  'AGENTS.md',
  'GEMINI.md',
];

const JSON_FILES = [
  '.claude/settings.local.json',
  '.codex/hooks.json',
  '.cursor/cli.json',
  '.gemini/settings.json',
  'opencode.json',
  '.trae/hooks.json',
];

let passed = 0;
let failed = 0;

function check(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  [PASS] ${msg}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${msg}`);
  }
}

function runCmd(sub, args, cwd) {
  // Builds: aet-design-env setup <sub> [args...]
  // For setup-all: sub='all', args=[]
  // For uninstall: sub='uninstall', args=['all']
  const r = spawnSync(process.execPath, [BUNDLE, 'setup', sub, ...args], {
    encoding: 'utf-8',
    cwd,
    stdio: 'pipe',
  });
  if (r.status !== 0) {
    throw new Error(
      `setup ${sub} ${args.join(' ')} exited ${r.status}\n` +
      `STDOUT:\n${r.stdout}\nSTDERR:\n${r.stderr}`
    );
  }
  return r;
}

function snapshotDir(root) {
  const snap = {};
  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      if (entry === '.git' || entry === 'node_modules') continue;
      const p = join(dir, entry);
      const rel = relative(root, p);
      const st = statSync(p);
      if (st.isDirectory()) {
        walk(p);
      } else {
        snap[rel] = readFileSync(p, 'utf-8');
      }
    }
  }
  walk(root);
  return snap;
}

// --- Test 1: Fresh "setup all" produces all expected files ---
function testFreshSetupAll() {
  console.log('\n=== ST setup: fresh "setup all" ===');
  const root = mkdtempSync(join(tmpdir(), 'aet-setup-fresh-'));
  try {
    runCmd('all', [], root);

    for (const f of ALL_PRODUCED_FILES) {
      check(existsSync(join(root, f)), `${f} exists`);
    }
    check(
      existsSync(join(root, '.aet/design/.manifest/aet-design-env.json')),
      'manifest exists'
    );

    // JSON files are valid
    for (const f of JSON_FILES) {
      try {
        JSON.parse(readFileSync(join(root, f), 'utf-8'));
        passed++;
        console.log(`  [PASS] ${f} is valid JSON`);
      } catch (e) {
        failed++;
        console.error(`  [FAIL] ${f} invalid JSON: ${e.message}`);
      }
    }

    // .ts hook file has expected structure
    const tsContent = readFileSync(join(root, '.omp/hooks/pre/aet-design-env.ts'), 'utf-8');
    check(tsContent.includes('import type { HookAPI }'), '.omp/hooks .ts has HookAPI import');
    check(tsContent.includes('export default function'), '.omp/hooks .ts has export default');
    check(tsContent.includes('pi.on("tool_call"'), '.omp/hooks .ts has pi.on hook');

    // Rule files have content
    const ruleFiles = [
      '.claude/rules/aet-design-env.md',
      '.cursor/rules/aet-design-env.mdc',
      '.opencode/agents/aet-design-env.md',
      '.trae/rules/aet-design-env.md',
    ];
    for (const f of ruleFiles) {
      const content = readFileSync(join(root, f), 'utf-8');
      check(content.length > 100, `${f} has rule content (>100 chars)`);
    }

    // Cursor + Trae rules have alwaysApply frontmatter
    const cursorRule = readFileSync(join(root, '.cursor/rules/aet-design-env.mdc'), 'utf-8');
    check(
      cursorRule.startsWith('---\n') && cursorRule.includes('alwaysApply: true'),
      '.cursor/rules has alwaysApply frontmatter'
    );
    const traeRule = readFileSync(join(root, '.trae/rules/aet-design-env.md'), 'utf-8');
    check(
      traeRule.startsWith('---\n') && traeRule.includes('alwaysApply: true'),
      '.trae/rules has alwaysApply frontmatter'
    );

    // Inline-tag files have the rule tag
    for (const f of ['AGENTS.md', 'GEMINI.md']) {
      const content = readFileSync(join(root, f), 'utf-8');
      check(content.includes('<aet-design-env-rule>'), `${f} has opening tag`);
      check(content.includes('</aet-design-env-rule>'), `${f} has closing tag`);
    }

    // CLAUDE.md has @import
    const claudeMd = readFileSync(join(root, 'CLAUDE.md'), 'utf-8');
    check(claudeMd.includes('@.claude/rules/aet-design-env.md'), 'CLAUDE.md has @import');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// --- Test 2: Coexistence with pre-existing files ---
function testCoexistence() {
  console.log('\n=== ST setup: coexistence with pre-existing files ===');
  const root = mkdtempSync(join(tmpdir(), 'aet-setup-coexist-'));
  try {
    // Pre-existing .claude/settings.local.json with deny entries
    mkdirSync(join(root, '.claude'), { recursive: true });
    writeFileSync(
      join(root, '.claude/settings.local.json'),
      JSON.stringify({
        permissions: { deny: ['Read(./.env)', 'Write(./secrets/*)'] },
      }, null, 2)
    );

    // Pre-existing AGENTS.md with user content
    writeFileSync(join(root, 'AGENTS.md'), '# My Project\n\nThis is my project.\n');

    runCmd('all', [], root);

    // Pre-existing deny entries PRESERVED
    const claudeSettings = JSON.parse(
      readFileSync(join(root, '.claude/settings.local.json'), 'utf-8')
    );
    const deny = claudeSettings.permissions?.deny ?? [];
    check(deny.includes('Read(./.env)'), 'pre-existing Read(./.env) preserved');
    check(deny.includes('Write(./secrets/*)'), 'pre-existing Write(./secrets/*) preserved');

    // Our deny entries ADDED (not replacing)
    check(deny.includes('Read(scripts/src/)'), 'our Read(scripts/src/) added');
    check(deny.includes('Edit(scripts/src/)'), 'our Edit(scripts/src/) added');

    // AGENTS.md user content PRESERVED + tag INJECTED
    const agentsMd = readFileSync(join(root, 'AGENTS.md'), 'utf-8');
    check(agentsMd.includes('# My Project'), 'pre-existing AGENTS.md header preserved');
    check(agentsMd.includes('This is my project.'), 'pre-existing AGENTS.md body preserved');
    check(agentsMd.includes('<aet-design-env-rule>'), 'AGENTS.md has our tag injected');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// --- Test 3: Idempotent re-run ---
function testIdempotentRerun() {
  console.log('\n=== ST setup: idempotent re-run ===');
  const root = mkdtempSync(join(tmpdir(), 'aet-setup-idem-'));
  try {
    runCmd('all', [], root);
    const before = snapshotDir(root);

    runCmd('all', [], root);
    const after = snapshotDir(root);

    let changed = 0;
    for (const [rel, beforeContent] of Object.entries(before)) {
      // The manifest file's installed_at timestamp updates on every run —
      // that's expected. Only compare produced files, not the manifest.
      if (rel.includes('.manifest')) continue;
      if (after[rel] !== beforeContent) {
        failed++;
        console.error(`  [FAIL] ${rel} changed on re-run`);
        changed++;
      }
    }
    for (const rel of Object.keys(after)) {
      if (!(rel in before)) {
        failed++;
        console.error(`  [FAIL] ${rel} is new on re-run`);
        changed++;
      }
    }
    if (changed === 0) {
      passed++;
      console.log(`  [PASS] all ${Object.keys(before).length} files unchanged on re-run`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// --- Test 4: Uninstall removes hash-matched files ---
function testUninstallHashMatched() {
  console.log('\n=== ST setup: uninstall hash-matched ===');
  const root = mkdtempSync(join(tmpdir(), 'aet-setup-uninstall-'));
  try {
    runCmd('all', [], root);
    runCmd('uninstall', ['all'], root);

    for (const f of REMOVABLE_FILES) {
      check(!existsSync(join(root, f)), `${f} removed by uninstall`);
    }
    // RECOVERED files are PRESERVED (even if we created them fresh)
    for (const f of PRESERVED_FILES) {
      check(existsSync(join(root, f)), `${f} preserved (RECOVERED, user-owned)`);
    }
    check(
      !existsSync(join(root, '.aet/design/.manifest/aet-design-env.json')),
      'manifest removed'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// --- Test 5: Uninstall preserves user-modified files ---
function testUninstallUserModified() {
  console.log('\n=== ST setup: uninstall preserves user-modified ===');
  const root = mkdtempSync(join(tmpdir(), 'aet-setup-modified-'));
  try {
    runCmd('all', [], root);

    // Modify a produced file (simulating user edits)
    const settingsPath = join(root, '.claude/settings.local.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    settings.permissions.deny.push('Read(./user-added)');
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    runCmd('uninstall', ['all'], root);

    // User-modified file PRESERVED (hash mismatch)
    check(
      existsSync(settingsPath),
      '.claude/settings.local.json preserved (user-modified)'
    );
    const after = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    check(
      after.permissions?.deny?.includes('Read(./user-added)'),
      'user addition preserved after uninstall'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// --- Test 6: Single-agent setup (`setup <agent>`) ---
function testSingleAgent() {
  console.log('\n=== ST setup: single-agent mode (setup claude) ===');
  const root = mkdtempSync(join(tmpdir(), 'aet-setup-single-'));
  try {
    runCmd('claude', [], root);

    // Claude's files present
    check(existsSync(join(root, 'CLAUDE.md')), 'CLAUDE.md exists (claude only)');
    check(
      existsSync(join(root, '.claude/rules/aet-design-env.md')),
      '.claude/rules/aet-design-env.md exists (claude only)'
    );
    check(
      existsSync(join(root, '.claude/settings.local.json')),
      '.claude/settings.local.json exists (claude only)'
    );

    // Other agents' files ABSENT — proves single-agent isolation, not "all"
    const absent = [
      'AGENTS.md',
      'opencode.json',
      '.codex/hooks.json',
      'GEMINI.md',
      '.cursor/rules/aet-design-env.mdc',
      '.cursor/cli.json',
      '.gemini/settings.json',
      '.opencode/agents/aet-design-env.md',
      '.omp/hooks/pre/aet-design-env.ts',
      '.trae/rules/aet-design-env.md',
      '.trae/hooks.json',
    ];
    for (const f of absent) {
      check(!existsSync(join(root, f)), `${f} absent (not installed by single claude)`);
    }

    // Manifest tracks ONLY claude's files — other agents' files are not tracked
    const manifestPath = join(root, '.aet/design/.manifest/aet-design-env.json');
    check(existsSync(manifestPath), 'manifest exists for single-agent setup');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    const tracked = Object.keys(manifest.files || {});
    for (const f of ['.claude/rules/aet-design-env.md', 'CLAUDE.md', '.claude/settings.local.json']) {
      check(tracked.includes(f), `manifest tracks ${f}`);
    }
    for (const f of ['opencode.json', '.codex/hooks.json', 'AGENTS.md', 'GEMINI.md']) {
      check(!tracked.includes(f), `manifest does NOT track ${f} (single-agent isolation)`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// --- Test 7: setup status output format ---
function testStatus() {
  console.log('\n=== ST setup: status output ===');
  const root = mkdtempSync(join(tmpdir(), 'aet-setup-status-'));
  try {
    // Before install: status reports no manifest
    const r0 = runCmd('status', [], root);
    check(r0.stdout.includes('No manifest found'), 'status before install reports "No manifest found"');

    // After install: status reports manifest metadata + present/recovered sections
    runCmd('all', [], root);
    const r1 = runCmd('status', [], root);
    check(r1.stdout.includes('Manifest:'), 'status shows "Manifest:" header');
    check(r1.stdout.includes('files tracked:'), 'status shows "files tracked:" count');
    check(r1.stdout.includes('present'), 'status shows "present" section');
    check(r1.stdout.includes('recovered'), 'status shows "recovered" section');

    // Modify a produced file → status reports it under "modified"
    const settingsPath = join(root, '.claude/settings.local.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    settings.permissions.deny.push('Read(./user-modified-for-status)');
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    const r2 = runCmd('status', [], root);
    check(r2.stdout.includes('modified'), 'status reports "modified" section after user edit');
    check(
      r2.stdout.includes('.claude/settings.local.json'),
      'status lists the modified file path'
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// --- Test 8: uninstall --force removes user-modified files ---
function testUninstallForce() {
  console.log('\n=== ST setup: uninstall --force removes modified ===');
  const root = mkdtempSync(join(tmpdir(), 'aet-setup-force-'));
  try {
    runCmd('all', [], root);

    // Modify a produced file (hash mismatch — would be preserved without --force)
    const settingsPath = join(root, '.claude/settings.local.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    settings.permissions.deny.push('Read(./user-added-for-force-test)');
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    runCmd('uninstall', ['all', '--force'], root);

    // User-modified file REMOVED by --force (contrast with Test 5, no --force → preserved)
    check(
      !existsSync(settingsPath),
      '.claude/settings.local.json REMOVED by uninstall --force (was modified)'
    );

    // RECOVERED files STILL preserved even with --force (recovered is unconditional)
    for (const f of PRESERVED_FILES) {
      check(existsSync(join(root, f)), `${f} preserved even with --force (RECOVERED)`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// --- Main ---
function main() {
  if (!existsSync(BUNDLE)) {
    console.error(`Bundle not found: ${BUNDLE} — run \`npm run build\` first.`);
    process.exit(2);
  }

  console.log('=== ST: aet-design-env setup (real-world integration) ===');

  testFreshSetupAll();
  testCoexistence();
  testIdempotentRerun();
  testUninstallHashMatched();
  testUninstallUserModified();
  testSingleAgent();
  testStatus();
  testUninstallForce();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
  console.log('All setup system tests passed.');
}

main();
