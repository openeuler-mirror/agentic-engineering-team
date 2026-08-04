/**
 * @file src/core/config_manager.ts
 *
 * Layer 4 — ConfigManager.
 *
 * Merges three config sources (low → high priority), per 新方案.md §2.4:
 *   1. baseline                              (built-in, defined below)
 *   2. ~/.aet/config/workflow.json           (global config)
 *   3. <project>/.aet/config/workflow.json   (project config)
 *
 * Project config overrides global config. The merge is shallow per top-level
 * key (hooks/workflows); within each key, named entries overwrite.
 *
 * On any read error the manager falls back to the built-in baseline config
 * (defined below) so Core can still bootstrap a fresh project.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { WorkflowDefinition, CommandDefinition, StepDefinition, HookPreset, WorkflowConfig } from './workflow_registry.js';

/**
 * Built-in baseline config — used when neither user nor project configs exist.
 * This guarantees a freshly-cloned AET project can run `aet workflow init feature`
 * without any prior setup. The values mirror the scenario table in
 * `docs/zh/workflow.md` §"内置场景".
 */
export const BASELINE_CONFIG: WorkflowConfig = {
  version: '1.0',
  hooks: {},
  commands: {},
  workflows: {
    'design': {
      name: 'design',
      description: '设计智能体',
      stages: [
        { id: 'requirements_analysis', description: '需求分析，请载入skill aet-req-analysis，如果没有这个skill，必须询问用户' },
        { id: 'requirements_design', description: '需求设计规范 (RDS)' },
        { id: 'development_plan', description: '开发计划 (SDD)' },
      ],
    },
    'implement': {
      name: 'implement',
      description: '实现智能体',
      stages: [
        { id: 'implement', description: '按开发计划执行实现' },
        { id: 'verify', description: '功能验证' },
      ],
    },
    'bugfix': {
      name: 'bugfix',
      description: '修复智能体',
      stages: [
        { id: 'diagnose', description: 'Bug 诊断' },
        { id: 'fix', description: '修复实现' },
      ],
    },
  },
};

/**
 * ConfigManager — owns the merged WorkflowConfig and exposes it via `getConfig()`.
 *
 * It is constructed with a project root and reads from disk on construction.
 * Re-reading is intentionally cheap and explicit (`reload()`); we do not watch
 * the filesystem.
 */
export class ConfigManager {
  private readonly projectRoot: string;
  private readonly globalRoot: string;
  private cached: WorkflowConfig | null = null;

  constructor(projectRoot: string = process.cwd(), globalRoot: string = homedir()) {
    this.projectRoot = projectRoot;
    this.globalRoot = globalRoot;
  }

  /** Returns the merged config (cached). */
  getConfig(): WorkflowConfig {
    if (this.cached) return this.cached;
    this.cached = this.loadAndMerge();
    return this.cached;
  }

  /** Force a re-read from disk. */
  reload(): WorkflowConfig {
    this.cached = this.loadAndMerge();
    return this.cached;
  }

  // -----------------------------------------------------------------------
  // Internals
  // -----------------------------------------------------------------------

  private loadAndMerge(): WorkflowConfig {
    const globalPath = join(this.globalRoot, '.aet', 'config', 'workflow.json');
    const projectPath = join(this.projectRoot, '.aet', 'config', 'workflow.json');

    // Start from baseline; layer global/project configs on top.
    const merged: WorkflowConfig = deepClone(BASELINE_CONFIG);

    const globalCfg = readJsonSafe(globalPath);
    if (globalCfg) mergeWorkflowConfig(merged, globalCfg);

    const projectCfg = readJsonSafe(projectPath);
    if (projectCfg) mergeWorkflowConfig(merged, projectCfg);

    return merged;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJsonSafe(path: string): Partial<WorkflowConfig> | null {
  try {
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, 'utf8');
    return JSON.parse(raw) as Partial<WorkflowConfig>;
  } catch {
    // Silently fall back; the baseline config will be used.
    return null;
  }
}

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

/**
 * Shallow-merge per top-level key (version/hooks/workflows/commands). Inside
 * `hooks`, `workflows` and `commands`, entries with the same name from `src`
 * overwrite `dst`. Arrays are replaced wholesale (no element-level merge).
 */
function mergeWorkflowConfig(dst: WorkflowConfig, src: Partial<WorkflowConfig>): void {
  if (typeof src.version === 'string') dst.version = src.version;

  if (src.hooks) {
    for (const [name, def] of Object.entries(src.hooks)) {
      dst.hooks[name] = def as HookPreset;
    }
  }

  if (src.workflows) {
    for (const [name, def] of Object.entries(src.workflows)) {
      dst.workflows[name] = normalizeWorkflowDefinition(def as WorkflowDefinition);
    }
  }

  if (src.commands) {
    for (const [name, def] of Object.entries(src.commands)) {
      dst.commands[name] = normalizeCommandDefinition(def as CommandDefinition);
    }
  }
}

/**
 * Normalize a user-supplied workflow definition to the current shape.
 *
 * Two renames happened after the legacy config was written:
 *   - the step array field `workflow` → `stages`;
 *   - the step identity field `step_id` → `id`.
 * Global/project configs written against the old fields keep merging
 * correctly instead of silently producing an empty pipeline / id-less steps.
 * The legacy keys are treated as deprecated, not removed.
 */
function normalizeWorkflowDefinition(def: WorkflowDefinition): WorkflowDefinition {
  const legacy = def as WorkflowDefinition & { workflow?: unknown };
  const stages = Array.isArray(legacy.stages)
    ? legacy.stages.map(normalizeStepDefinition)
    : Array.isArray(legacy.workflow)
      ? legacy.workflow.map(normalizeStepDefinition)
      : undefined;
  const argHint = normalizeArgumentHint(def['argument-hint']);
  if (stages || argHint) {
    const out: WorkflowDefinition = { ...legacy };
    if (stages) out.stages = stages;
    if (argHint) out['argument-hint'] = argHint;
    return out;
  }
  return def;
}

/**
 * Normalize a user-supplied command definition. Currently only sanitizes
 * `argument-hint` (see {@link normalizeArgumentHint}); other fields pass
 * through. Exists as a peer to {@link normalizeWorkflowDefinition} so both
 * entry kinds share the same metadata-hygiene path.
 */
function normalizeCommandDefinition(def: CommandDefinition): CommandDefinition {
  const argHint = normalizeArgumentHint(def['argument-hint']);
  if (argHint) {
    return { ...def, 'argument-hint': argHint };
  }
  return def;
}

/**
 * Sanitize the `argument-hint` list: drop empty elements and replace
 * INTERNAL whitespace in each name with underscores. Per the CC placeholder
 * convention (ctx7 agent-sdk docs), `argument-hint` elements are bare
 * positional-arg names (e.g. `["issue-number", "priority"]`) rendered
 * `[name] [name]` with single spaces as SEPARATORS between names — a name
 * containing a space would split across the separator at render time and
 * corrupt the positional mapping. Rather than drop the offending name (a
 * lossy over-reaction to a likely typo), the spaces are collapsed to
 * underscores so the name stays a single token: `"bad name"` → `"bad_name"`.
 * This keeps `aet plugin init` and the checkpoint consumer seeing a clean,
 * separator-safe name list without silently losing declared arguments.
 *
 * Legacy tolerance: a global/project config written against the pre-list
 * schema may carry `argument-hint` as a STRING instead of an array. An empty
 * string normalizes away (→ undefined, field omitted); a non-empty string is
 * wrapped as a single-element array so the legacy single-arg form keeps
 * working without forcing a config migration.
 *
 * Returns `undefined` when the input is absent/empty/wholly-empty, so the
 * field is omitted from the merged definition (and thus from frontmatter)
 * rather than persisted as an empty array.
 */
function normalizeArgumentHint(
  hint: string[] | string | undefined,
): string[] | undefined {
  if (hint === undefined) return undefined;
  // Legacy string form: "" → omit; "name" → ["name"].
  if (typeof hint === 'string') {
    const trimmed = hint.trim();
    return trimmed.length > 0 ? [trimmed] : undefined;
  }
  if (!Array.isArray(hint)) return undefined;
  const cleaned = hint
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
    .map((s) => s.replace(/\s+/g, '_'));
  return cleaned.length > 0 ? cleaned : undefined;
}

/** Map a legacy step's `step_id` to the current `id` field. */
function normalizeStepDefinition(s: StepDefinition): StepDefinition {
  const legacy = s as StepDefinition & { step_id?: string };
  if (typeof legacy.step_id === 'string' && !s.id) {
    return { ...legacy, id: legacy.step_id };
  }
  return s;
}
