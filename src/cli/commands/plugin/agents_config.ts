/**
 * @file src/cli/commands/plugin/agents_config.ts
 *
 * Layer 3 — `aet plugin init` agent registry.
 *
 * Configuration-driven, extensible agent registry (spec-kit catalog style).
 * Three merge layers (low → high priority):
 *   1. built-in defaults   (src/cli/commands/plugin/default_agents.ts)
 *   2. ~/.aet/config/agents.json     (global — user-wide)
 *   3. <project>/.aet/config/agents.json (project — per-project override)
 *
 * Project entries override global entries per agent id; global overrides
 * built-in. Adding a new coding-agent adapter = adding one entry to
 * agents.json — no code change required. This mirrors spec-kit's
 * integration-catalog model (declarative descriptor is the single source of
 * truth; the install command materializes artifacts from it).
 *
 * NOTE: this is the ONLY `aet plugin init`-specific schema. It does NOT
 * touch the workflow lifecycle EventBus/Core — `aet plugin init` is a pure
 * file-generation utility that reads the merged workflow config and emits
 * per-agent command/skill files.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { DEFAULT_AGENTS } from './default_agents.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Output format strategy. Mirrors spec-kit's base-class selection:
 *   - `markdown-flat`  ≈ MarkdownIntegration (one flat .md file, e.g. CC
 *                        slash commands at .claude/commands/<name>.md and
 *                        OpenCode commands at .opencode/commands/<name>.md).
 *   - `markdown-skill` ≈ SkillsIntegration (subdir + SKILL.md, e.g. Codex
 *                        skills at .agents/skills/<name>/SKILL.md).
 */
export type AgentFormat = 'markdown-flat' | 'markdown-skill';

/**
 * One adapter entry. Field names borrow from spec-kit's
 * `IntegrationBase.config` + `registrar_config` data shape, but expressed as
 * a pure JSON object (no class hierarchy — adding an agent needs no code).
 *
 * Placeholder tokens supported in `filename`, `frontmatter` values, and
 * `body` (see templates.ts → renderTemplate):
 *   `{{id}}`                 → workflow/command id (e.g. `design`)
 *   `{{workflow.name}}`      → workflow display name
 *   `{{workflow.description}}` → workflow description
 *   `{{workflow.steps_count}}` → number of stages
 *   `{{workflow.steps_list}}` → numbered stage list with core skill
 *   `{{init_guidance}}`      → init directive (empty when hasPlugin)
 * Command entries additionally use:
 *   `{{command.name}}`       → command display name
 *   `{{command.description}}` → command description
 *   `{{command.skills_list}}` → "核心 skill: ..." line (empty when no skills)
 * `$ARGUMENTS` is a host-native token (CC slash-command args); the AET
 * renderer leaves it untouched (it only replaces `{{...}}`).
 *
 * In addition to the agent's static `frontmatter`/`commandFrontmatter`, the
 * generator merges per-entry frontmatter metadata declared on the
 * workflow/command config itself — `effort`, `allowed-tools`,
 * `argument-hint` (see FrontmatterMeta in templates.ts). Only non-empty
 * values are written; empty strings (the default in workflow.json) are
 * dropped so unset fields never reach the generated .md frontmatter.
 */
export interface AgentEntry {
  /** Human-readable label (informational). */
  label: string;
  /**
   * Whether this host ships an AET plugin that handles workflow init +
   * handover automatically (e.g. Claude Code's UserPromptSubmit/Pre/PostTool
   * hooks). When `true`, the generated body suppresses init guidance — the
   * plugin intercepts the trigger and runs `aet workflow init` + `handover`
   * itself. When `false` (default), the body MUST guide the agent to
   * self-init via bash. Omit = `false`.
   */
  hasPlugin?: boolean;
  /**
   * Destination directory. Project-relative by default (e.g.
   * `.claude/commands`), resolved against the project root. An absolute
   * path or a `~`-prefixed path is resolved against the global (home) root,
   * letting a user opt into user-global installation.
   */
  destDir: string;
  /** Output format strategy. */
  format: AgentFormat;
  /** Filename relative to destDir; may contain `{{id}}`. */
  filename: string;
  /** YAML frontmatter keys → value strings (may contain placeholders). */
  frontmatter: Record<string, string>;
  /** Document body (may contain placeholders + host tokens like $ARGUMENTS). */
  body: string;
  /**
   * Command template (single-dispatch entries). Optional — when absent, the
   * generator SKIPS commands for this agent (workflow files still render).
   * Commands have no workflow lifecycle, so the body must be self-contained:
   * core skill(s) + description, no init guidance / no handover directive.
   */
  commandFrontmatter?: Record<string, string>;
  commandBody?: string;
}

export interface AgentsConfig {
  agents: Record<string, AgentEntry>;
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Load + merge the three-layer agents config. Built-in defaults are the
 * floor; global then project files overwrite per-agent-id. A missing file
 * is silently skipped (fresh project → built-in defaults suffice).
 */
export function loadAgentsConfig(
  projectRoot: string = process.cwd(),
  globalRoot: string = homedir(),
): AgentsConfig {
  // Start from a deep clone of the built-in defaults so the exported
  // DEFAULT_AGENTS constant is never mutated across calls.
  const merged: AgentsConfig = { agents: { ...DEFAULT_AGENTS.agents } };

  const globalPath = join(globalRoot, '.aet', 'config', 'agents.json');
  const globalCfg = readJsonSafe(globalPath);
  if (globalCfg) mergeAgentsConfig(merged, globalCfg);

  const projectPath = join(projectRoot, '.aet', 'config', 'agents.json');
  const projectCfg = readJsonSafe(projectPath);
  if (projectCfg) mergeAgentsConfig(merged, projectCfg);

  return merged;
}

/**
 * Look up a single agent entry by id. Throws an explicit UsageError-style
 * signal (returns null) when unknown — the caller decides how to surface.
 */
export function getAgentEntry(
  config: AgentsConfig,
  agentId: string,
): AgentEntry | null {
  // Case-insensitive match on agent id (mirrors agent_meta resolveAgentMeta).
  const key = Object.keys(config.agents).find(
    (k) => k.toLowerCase() === agentId.toLowerCase(),
  );
  return key ? config.agents[key] : null;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function readJsonSafe(path: string): Partial<AgentsConfig> | null {
  try {
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, 'utf8');
    return JSON.parse(raw) as Partial<AgentsConfig>;
  } catch {
    // Silently fall back; built-in defaults remain in effect.
    return null;
  }
}

/**
 * Shallow-merge per agent id. An agent entry from `src` fully overwrites the
 * same-id entry in `dst` (no field-level merge) — overriding an agent is an
 * all-or-nothing declaration. New ids from `src` are added.
 */
function mergeAgentsConfig(dst: AgentsConfig, src: Partial<AgentsConfig>): void {
  if (!src.agents) return;
  for (const [id, entry] of Object.entries(src.agents)) {
    if (entry) dst.agents[id] = entry;
  }
}
