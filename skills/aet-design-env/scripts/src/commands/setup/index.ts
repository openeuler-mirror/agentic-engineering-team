/**
 * setup <agent|all|uninstall <agent|all>|status>
 *
 * Top-level dispatcher. Per-agent behavior lives in setup/agents/<key>.ts
 * subclasses (extending BaseAgent); this file only:
 *   - parses user input (agent key/alias OR `all` OR `uninstall`/`status`)
 *   - looks up the agent instance via AGENT_REGISTRY
 *   - invokes BaseAgent.setup() (inherited — no per-agent dispatch logic)
 *   - prints the outcome
 *
 * Architecture (referenced from Spec Kit):
 *   - Registry is single source of truth — agent list comes from
 *     AGENT_REGISTRY, not hardcoded arrays.
 *   - Manifest hash system tracks every produced file (manifest.py pattern).
 *   - Marker-based idempotent injection (update-agent-context.sh pattern).
 *   - Path safety invariants reject absolute/`..`/symlink/out-of-root
 *     (delegated to setup/path-safe.ts).
 *
 * Manifest path: {projectRoot}/.aet/design/.manifest/aet-design-env.json
 * Config source : {skillRoot}/config/agents.json (rule + permissions only)
 *
 * Stream convention (see index.ts): stdout = setup outcome per agent (this IS
 * the command's result — printHeader/printOutcome are status output the user
 * reads as the result, not diagnostics); stderr = errors (unknown agent,
 * unknown command). Note: setup has no separate "data" stream — its stdout
 * status messages ARE the deliverable.
 */
import { existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { sha256, SetupManifest } from './manifest';
import { loadSetupConfig, SetupOutcome } from './base-agent';
import {
  AGENT_REGISTRY,
  agentKeys,
  registerBuiltinAgents,
  resolveAgent,
} from './registry';
import { skillRoot } from '../../util';

// Derive the manifest key from the skill directory name so that renaming
// the skill propagates automatically instead of silently mismatching.
const MANIFEST_KEY = basename(skillRoot());

// Ensure built-ins are registered on first import.
registerBuiltinAgents();

function printHeader(name: string, key: string): void {
  console.log(`\n=== Setup ${name} (${key}) ===`);
}

function printOutcome(o: SetupOutcome): void {
  if (o.ruleFile) {
    const label = o.rule === 'written' ? '(written)'
      : o.rule === 'recovered' ? '(preserved pre-existing)'
      : o.rule === 'unchanged' ? '(unchanged)'
      : '(skipped)';
    console.log(`  rule file : ${o.ruleFile} ${label}`);
  }
  if (o.configPath) {
    const label = o.config === 'updated' ? '(updated)'
      : o.config === 'linked' ? '(already linked)'
      : o.config === 'unchanged' ? '(unchanged)'
      : '(skipped)';
    console.log(`  config    : ${o.configPath} ${label}`);
  }
  if (o.permsFile) {
    const label = o.perms === 'updated' ? '(updated)'
      : o.perms === 'skipped' ? '(skipped)'
      : '(none)';
    console.log(`  perms     : ${o.permsFile} ${label}${o.note ? ` - ${o.note}` : ''}`);
  } else {
    console.log(`  perms     : (no permissions configured)`);
  }
}

export function runSetup(argv: string[]): void {
  if (argv.length === 0) {
    printUsage();
    process.exit(1);
  }

  const sub = argv[0].toLowerCase();

  if (sub === 'status') {
    return runStatus();
  }
  if (sub === 'uninstall') {
    return runUninstall(argv.slice(1));
  }

  // Install/refresh
  const config = loadSetupConfig();
  const cwd = process.cwd();
  const manifest = new SetupManifest(MANIFEST_KEY, cwd);

  if (sub === 'all') {
    let hadError = false;
    for (const key of agentKeys()) {
      const agent = AGENT_REGISTRY.get(key)!;
      printHeader(agent.name, agent.key);
      try {
        const outcome = agent.setup(manifest, config);
        printOutcome(outcome);
      } catch (e) {
        hadError = true;
        console.error(`  ERROR: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    manifest.save();
    if (hadError) process.exitCode = 1;
    console.log(`\nSetup complete for all ${agentKeys().length} agents.`);
    console.log(`Manifest: ${manifest.manifestPath}`);
    return;
  }

  const agent = resolveAgent(sub);
  if (!agent) {
    console.error(`Unknown agent: ${sub}`);
    console.error(`Valid agents: ${agentKeys().join(', ')}, or "all"`);
    process.exit(1);
  }
  printHeader(agent.name, agent.key);
  try {
    const outcome = agent.setup(manifest, config);
    printOutcome(outcome);
  } catch (e) {
    console.error(`  ERROR: ${e instanceof Error ? e.message : String(e)}`);
    manifest.save();
    process.exit(1);
  }
  manifest.save();
  console.log(`\nManifest: ${manifest.manifestPath}`);
}

function printUsage(): void {
  console.error('Usage:');
  console.error('  setup <agent|all>                Inject rule + permissions');
  console.error('  setup uninstall <agent|all> [--force]');
  console.error('                                  Remove only hash-matched files');
  console.error('  setup status                     Show manifest-tracked files');
  console.error('');
  console.error(`Agents: ${agentKeys().join(', ')}, or "all"`);
}

function runStatus(): void {
  const cwd = process.cwd();
  const manifest = SetupManifest.load(MANIFEST_KEY, cwd);
  if (!manifest) {
    console.log(`No manifest found at .aet/design/.manifest/${MANIFEST_KEY}.json`);
    console.log('Run: setup <agent|all>');
    return;
  }
  const check = manifest.checkModified();
  console.log(`\nManifest: .aet/design/.manifest/${MANIFEST_KEY}.json`);
  console.log(`installed_at: ${manifest.installedAt || '(unknown)'}`);
  console.log(`version: ${manifest.version}`);
  console.log(`files tracked: ${Object.keys(manifest.files).length}`);
  if (check.present.length > 0) {
    console.log(`\n  present (hash matches, safe to uninstall):`);
    for (const k of check.present) console.log(`    ${k}`);
  }
  if (check.modified.length > 0) {
    console.log(`\n  modified (hash differs — preserved on uninstall):`);
    for (const k of check.modified) console.log(`    ${k}`);
  }
  if (check.recovered.length > 0) {
    console.log(`\n  recovered (pre-existing, never removed):`);
    for (const k of check.recovered) console.log(`    ${k}`);
  }
  if (check.missing.length > 0) {
    console.log(`\n  missing (already removed):`);
    for (const k of check.missing) console.log(`    ${k}`);
  }
}

function runUninstall(argv: string[]): void {
  const cwd = process.cwd();
  const manifest = SetupManifest.load(MANIFEST_KEY, cwd);
  if (!manifest) {
    console.log(`No manifest found at .aet/design/.manifest/${MANIFEST_KEY}.json`);
    console.log('Nothing to uninstall.');
    return;
  }
  const force = argv.includes('--force');
  const target = argv.find((a) => !a.startsWith('--'))?.toLowerCase();

  if (!target || target === 'all') {
    const result = manifest.uninstall(force);
    console.log(`\nUninstalled ${result.removed.length} file(s):`);
    for (const k of result.removed) console.log(`  removed: ${k}`);
    if (result.skipped.length > 0) {
      console.log(`\nSkipped ${result.skipped.length} file(s):`);
      for (const k of result.skipped) console.log(`  skipped: ${k}`);
    }
    return;
  }

  const agent = resolveAgent(target);
  if (!agent) {
    console.error(`Unknown agent: ${target}`);
    console.error(`Valid agents: ${agentKeys().join(', ')}, or "all"`);
    process.exit(1);
  }
  const candidates = agent.managedFiles;

  const result = { removed: [] as string[], skipped: [] as string[] };
  for (const rel of candidates) {
    if (manifest.isRecovered(rel)) {
      result.skipped.push(rel);
      continue;
    }
    const abs = join(cwd, rel);
    const tracked = manifest.files[rel];
    if (!tracked) {
      result.skipped.push(rel);
      continue;
    }
    try {
      const onDisk = sha256(readFileSync(abs));
      if (onDisk === tracked || force) {
        try { rmSync(abs, { recursive: false }); } catch { /* ignore */ }
        manifest.remove(rel);
        result.removed.push(rel);
      } else {
        result.skipped.push(rel);
      }
    } catch {
      result.skipped.push(rel);
    }
  }
  if (result.removed.length > 0) manifest.save();

  console.log(`\nUninstalled ${result.removed.length} file(s) for ${agent.name}:`);
  for (const k of result.removed) console.log(`  removed: ${k}`);
  if (result.skipped.length > 0) {
    console.log(`\nSkipped ${result.skipped.length} file(s):`);
    for (const k of result.skipped) console.log(`  skipped: ${k}`);
  }
}
