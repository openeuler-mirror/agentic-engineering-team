/**
 * BaseAgent — abstract base class for pluggable agent definitions.
 *
 * Architecture (referenced from Spec Kit's IntegrationBase / MarkdownIntegration):
 *   - Each agent is a self-contained subpackage under setup/agents/<key>.ts
 *     extending BaseAgent. The subclass declares only readonly metadata
 *     (key, name, aliases, paths, formats); all setup/teardown behavior is
 *     inherited from the base class.
 *   - A central AGENT_REGISTRY (see registry.ts) is the single source of
 *     truth — `registerBuiltinAgents()` instantiates each subclass once.
 *   - Rule injection and permission writing are delegated to pluggable
 *     strategies (see strategies/). The orchestrator looks up by key in
 *     RULE_STRATEGY_REGISTRY / PERMISSION_WRITER_REGISTRY — uniform
 *     extension: adding a new rule mode = 1 file + 1 registerRuleStrategy()
 *     call; adding a new permission format = 1 file + 1
 *     registerPermissionWriter() call.
 *   - Adding a new agent = 2 edits: (1) new agents/<key>.ts subclass, (2) one
 *     registerAgent() call in registerBuiltinAgents(). No edits to lookup
 *     tables or test scaffolding — per-agent tests inherit BaseAgentTests
 *     mixin and pick up all acceptance checks automatically.
 *
 * Ownership rules (mirror Spec Kit's manifest.py invariants):
 *   - separate_file rule_file        → we OWN; PRODUCED in manifest
 *   - inline_tag target_file         → user OWNS (CLAUDE.md/AGENTS.md/etc);
 *                                      always RECOVERED (never deleted on
 *                                      uninstall — only un-inject would,
 *                                      which is a future subcommand)
 *   - rule_config_path               → user OWNS; RECOVERED (we only append
 *                                      the @import line if missing)
 *   - permissions_targets[].file    → if pre-existing → RECOVERED; if we
 *                                      created fresh → PRODUCED
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { skillRoot } from '../../util';
import { SetupManifest } from './manifest';
import { assertSafeRelativePath } from './path-safe';
import { RULE_STRATEGY_REGISTRY, PERMISSION_WRITER_REGISTRY } from './strategies';

export type RuleInjectStrategy = 'separate_file' | 'inline_tag';
export type PermissionsFormat =
  | 'claude_settings'
  | 'opencode_json'
  | 'codex_hooks'
  | 'cursor_ignore'
  | 'cursor_settings'
  | 'trae_hooks'
  | 'omp_hooks'
  | 'gemini_hooks'
  | 'none';

export interface PermissionsTarget {
  /** Path relative to project root where permission rules are written. */
  file: string;
  /** Format of the permission file (determines how deny paths are encoded). */
  format: PermissionsFormat;
}

/** Shared rule + permission config loaded from agents.json. */
export interface SetupConfig {
  rule: { tag: string; content: string };
  permissions: {
    deny: { read?: string[]; write?: string[] };
  };
}

export interface SetupOutcome {
  rule: 'written' | 'unchanged' | 'recovered' | 'skipped';
  ruleFile?: string;
  config: 'updated' | 'linked' | 'skipped' | 'unchanged';
  configPath?: string;
  perms: 'updated' | 'skipped' | 'none';
  permsFile?: string;
  note?: string;
}

/* ----------------------------------------------------------- BaseAgent class */

/**
 * Abstract base for agent definitions. Subclasses declare readonly metadata;
 * setup() behavior is inherited unchanged (mirrors Spec Kit's
 * MarkdownIntegration — minimal subclasses, zero method overrides).
 */
export abstract class BaseAgent {
  /** Canonical integration key (must match AGENT_REGISTRY key). */
  abstract readonly key: string;
  /** Human-readable name for display. */
  abstract readonly name: string;
  /** User-input aliases that resolve to this agent (lowercase). */
  abstract readonly aliases: string[];

  abstract readonly ruleInjectStrategy: RuleInjectStrategy;
  /** Path relative to project root (separate_file only). */
  readonly ruleFile?: string;
  /** User-owned context file (CLAUDE.md/AGENTS.md) — separate_file only. */
  readonly ruleConfigPath?: string;
  /** Import line template; `{rule_file}` placeholder replaced at setup. */
  readonly ruleConfigInject?: string;
  /** Target file (inline_tag only). */
  readonly targetFile?: string;
  /** XML tag name for inline_tag wrapping. */
  readonly tag?: string;
  /** Canonical permission targets. */
  readonly permissionsTargets?: PermissionsTarget[];
  /** When true, ensure .mdc frontmatter has `alwaysApply: true` (Cursor). */
  readonly ensureMdcAlwaysApply?: boolean;

  /**
   * Run setup for this agent against the given manifest. All file paths are
   * validated for safety (no absolute, `..`, symlinks, out-of-root escapes).
   * Idempotent — re-running preserves user modifications.
   *
   * Orchestrates two pluggable strategy registries:
   *   1. Rule injection — looked up by `ruleInjectStrategy` in
   *      RULE_STRATEGY_REGISTRY. The strategy owns all file writes + manifest
   *      recording (non-uniform: separate_file vs inline_tag differ).
   *   2. Permissions — looked up by `t.format` in
   *      PERMISSION_WRITER_REGISTRY. The writer owns format-specific file
   *      mutation; the orchestrator owns uniform manifest recording
   *      (PRODUCED if fresh, RECOVERED if pre-existing).
   */
  setup(manifest: SetupManifest, config: SetupConfig): SetupOutcome {
    const cwd = process.cwd();
    const outcome: SetupOutcome = { rule: 'skipped', config: 'skipped', perms: 'none' };

    // 1. Inject rule via registered strategy
    const strat = RULE_STRATEGY_REGISTRY.get(this.ruleInjectStrategy);
    if (strat) {
      const r = strat.apply({
        cwd,
        ruleContent: config.rule.content,
        ruleFile: this.ruleFile,
        ruleConfigPath: this.ruleConfigPath,
        ruleConfigInject: this.ruleConfigInject,
        ensureMdcAlwaysApply: this.ensureMdcAlwaysApply,
        targetFile: this.targetFile,
        tag: this.tag,
      }, manifest);
      outcome.rule = r.rule;
      outcome.ruleFile = r.ruleFile;
      outcome.config = r.config;
      outcome.configPath = r.configPath;
    }

    // 2. Apply permissions via registered writers
    const targets = this.permissionsTargets ?? [];
    if (targets.length > 0) {
      const permNotes: string[] = [];
      let anyUpdated = false;
      let anySkipped = false;
      for (const t of targets) {
        assertSafeRelativePath(t.file, cwd);
        const permFile = join(cwd, t.file);
        const wasExisting = existsSync(permFile);
        const writer = PERMISSION_WRITER_REGISTRY.get(t.format);
        const r = writer
          ? writer.apply({ permFile, deny: config.permissions.deny })
          : { updated: false, skipped: true };
        if (r.updated) {
          anyUpdated = true;
          if (wasExisting && !manifest.isTracked(t.file)) {
            // Genuinely pre-existing (user-owned, we never tracked it) →
            // mark RECOVERED so uninstall preserves the user's file.
            manifest.recordExisting(t.file, true);
          } else if (wasExisting) {
            // Already tracked (we wrote it in a prior run) → re-read from
            // disk to update the hash, but PRESERVE the existing ownership
            // (don't downgrade PRODUCED to RECOVERED — that would make
            // uninstall silently skip our own files).
            manifest.recordExisting(t.file, manifest.isRecovered(t.file));
          } else {
            // Fresh file → PRODUCED (write to disk + record hash).
            manifest.recordFile(t.file, readFileSync(permFile));
          }
        } else if (r.skipped) {
          anySkipped = true;
          // Only mark as recovered if genuinely pre-existing and NOT yet
          // tracked. If already tracked (we wrote it in a prior run), leave
          // the manifest UNTOUCHED — the original hash stays, so uninstall
          // can detect user modifications (hash mismatch → file preserved).
          if (wasExisting && !manifest.isTracked(t.file)) {
            manifest.recordExisting(t.file, true);
          }
        }
        if (r.note) permNotes.push(`${t.file}: ${r.note}`);
      }
      outcome.perms = anyUpdated ? 'updated' : anySkipped ? 'skipped' : 'updated';
      outcome.permsFile = targets.map((t) => t.file).join(', ');
      if (permNotes.length > 0) outcome.note = permNotes.join('; ');
    }

    return outcome;
  }

  /**
   * List of candidate files this agent manages (for per-agent uninstall).
   * Combines rule_file, rule_config_path, target_file, permissions_targets.
   */
  get managedFiles(): string[] {
    return [
      this.ruleFile,
      this.ruleConfigPath,
      this.targetFile,
      ...(this.permissionsTargets ?? []).map((t) => t.file),
    ].filter(Boolean) as string[];
  }
}

/* ----------------------------------------------------------- config loader */

// ⚠️ MODULE-LEVEL MUTABLE STATE (test discipline required)
// `_cachedConfig` is a singleton cache for the SetupConfig loaded from
// config/agents.json. Tests that swap agents.json (or re-run setup in a
// temp project) MUST call `_resetConfigCacheForTest()` in beforeEach to
// avoid cross-test contamination. base-agent-tests.ts:58 already does this.
// If you add new tests that mutate config, follow the same pattern.
let _cachedConfig: SetupConfig | null = null;

/**
 * Load (and memoize) the shared rule + permissions config from
 * `config/agents.json`.
 *
 * Named `loadSetupConfig` (not `loadConfig`) to avoid collision with the
 * unrelated `loadLibraryConfig` in library.ts — the two read different
 * files (agents.json vs library-browser.config.yml) and return different
 * types. Same-name functions in different modules don't conflict at the
 * JS level, but the cognitive load on readers is high. Prefer explicit
 * names.
 */
export function loadSetupConfig(): SetupConfig {
  if (_cachedConfig) return _cachedConfig;
  const configPath = join(skillRoot(), 'config', 'agents.json');
  const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
  if (!raw.rule || !raw.permissions) {
    throw new Error(`agents.json missing required 'rule' or 'permissions' keys: ${configPath}`);
  }
  _cachedConfig = raw as SetupConfig;
  return _cachedConfig;
}

/** Test-only: reset cached config (so tests can swap agents.json). */
export function _resetConfigCacheForTest(): void {
  _cachedConfig = null;
}
