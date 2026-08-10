/**
 * @file src/cli/commands/plugin/generator.ts
 *
 * Layer 3 — `aet plugin init` generation engine.
 *
 * Drives the (agent × entry) cartesian product over TWO kinds of config
 * entries:
 *   - **workflows** (`config.workflows`) — multi-stage pipelines, rendered
 *     with the workflow template (stage overview + init/handover guidance).
 *   - **commands** (`config.commands`) — single-dispatch entries, rendered
 *     with the command template (core skill + description only; no lifecycle,
 *     no init guidance — the host injects the file content directly).
 * For each agent adapter, for each entry, render the agent-specific
 * command/skill file and write it (always overwrite — SessionStart re-runs
 * are cheap on small files). After each agent pass, stale entries (files
 * under the agent's destDir whose `aet-` prefixed id dropped out of config —
 * whether workflow OR command) are removed by scanning the directory — no
 * manifest needed.
 *
 * Stateless by construction: every run rewrites every current entry's file
 * and prunes only `aet-*` entries no longer in config. The `aet-`
 * prefix is AET's reserved namespace under destDir, so pruning it is safe
 * (non-`aet` files/dirs — other tools' commands/skills — are untouched).
 *
 * This module is pure file generation. It does NOT touch the workflow
 * lifecycle EventBus/Core — `aet plugin init` only reads config + writes
 * artifacts. Validation of the agent id (unknown agent → error) lives in
 * the CommandSpec layer (commands/plugin/init.ts); the generator receives
 * an already-resolved AgentsConfig.
 */

import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';

import type { AgentEntry, AgentsConfig } from './agents_config.js';
import {
  buildFileContent,
  mergeMetaFrontmatter,
  renderTemplate,
} from './templates.js';
import type { FrontmatterMeta, RenderContext, RenderStep } from './templates.js';
import type { WorkflowConfig } from '../../../core/workflow_registry.js';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface GenerateResult {
  /** Agent id (e.g. `claude-code`, `opencode`). */
  agent: string;
  /** Workflow ids whose file was written this run (always = all current). */
  generated: string[];
  /** Workflow ids whose stale `aet-*` file/dir was pruned from destDir. */
  removed: string[];
  /** Workflow ids skipped by an agent filter (e.g. CC non-`aet-` prefix). */
  skipped: string[];
}

export interface GenerateAllResult {
  results: GenerateResult[];
}

// ---------------------------------------------------------------------------
// destDir resolution
// ---------------------------------------------------------------------------

/**
 * Resolve an agent's `destDir` to an absolute path.
 *
 * - absolute path        → used verbatim (user opt-out)
 * - `~/`-prefixed path    → resolved against the global (home) root
 * - otherwise (relative)  → resolved against the project root (the default,
 *                          per decision B = project-local installation)
 */
function resolveDestDir(
  destDir: string,
  projectRoot: string,
  globalRoot: string,
  global: boolean,
): string {
  if (isAbsolute(destDir)) return destDir;
  const rel = destDir.startsWith('~/') ? destDir.slice(2) : destDir;
  // `-g` forces ALL relative destDirs to resolve against the global root,
  // not just `~/`-prefixed ones (the default project-local install).
  const base = global || destDir.startsWith('~/') ? globalRoot : projectRoot;
  return join(base, rel);
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Generate command/skill files for every (agent × entry) pair.
 *
 * Each run is a full rewrite of every current entry's file (overwrite),
 * followed by pruning `aet-*` entries under each agent's destDir that no
 * longer correspond to a workflow or command in config. No manifest, no hash,
 * no cross-run state — safe to re-run on every CC SessionStart.
 *
 * @param agentFilter If set, only this agent id is processed; otherwise all
 *                    agents in `agentsConfig` are processed. The caller must
 *                    have validated the id exists (unknown → no-op here).
 * @param global      If true, relative destDirs resolve against the global
 *                    (home) root instead of the project root — `aet plugin
 *                    init -g` installs commands/skills user-globally.
 */
export async function generateAll(
  agentsConfig: AgentsConfig,
  config: WorkflowConfig,
  projectRoot: string,
  globalRoot: string,
  agentFilter?: string,
  global = false,
): Promise<GenerateAllResult> {
  const results: GenerateResult[] = [];

  const agentIds = agentFilter ? [agentFilter] : Object.keys(agentsConfig.agents);
  for (const agentId of agentIds) {
    const entry = agentsConfig.agents[agentId];
    if (!entry) continue;
    const result = await generateForAgent(
      agentId,
      entry,
      config,
      projectRoot,
      globalRoot,
      global,
    );
    results.push(result);
  }

  return { results };
}

// ---------------------------------------------------------------------------
// Per-agent generation
// ---------------------------------------------------------------------------

/**
 * Generate files for one agent: (1) write every current workflow's file AND
 * every current command's file (always overwrite), (2) prune stale `aet-*`
 * entries from destDir.
 */
async function generateForAgent(
  agentId: string,
  entry: AgentEntry,
  config: WorkflowConfig,
  projectRoot: string,
  globalRoot: string,
  global: boolean,
): Promise<GenerateResult> {
  const destDir = resolveDestDir(entry.destDir, projectRoot, globalRoot, global);
  const generated: string[] = [];
  const skipped: string[] = [];
  // Entry ids that this agent should keep on disk (drives stale cleanup).
  // BOTH workflow and command ids share the `aet-` namespace under destDir,
  // so the keep-set must include both or stale cleanup would prune the other.
  const keepWorkflowIds = new Set<string>();

  // Write one entry's file (shared by the workflow and command loops).
  const writeEntry = async (
    id: string,
    ctx: RenderContext,
    frontmatter: Record<string, string>,
    body: string,
  ): Promise<void> => {
    keepWorkflowIds.add(id);
    const filename = renderTemplate(entry.filename, ctx);
    const filePath = join(destDir, filename);
    const content = buildFileContent(frontmatter, body, ctx);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, content, 'utf8');
    generated.push(id);
  };

  for (const [workflowId, workflow] of Object.entries(config.workflows)) {
    // Every workflow renders for every agent under its config id verbatim —
    // the id may be bare (`design` → `design.md` → `/design`) or, if a config
    // deliberately prefixed it, `aet-*` (`aet-design.md` → `/aet-design`). The
    // CC handler's slash regex is prefix-agnostic, so either triggers via
    // command-init; the shipped configs use bare ids (`design`/`implement`/`bugfix`).
    const meta: FrontmatterMeta = {
      effort: workflow.effort,
      'allowed-tools': workflow['allowed-tools'],
      'argument-hint': workflow['argument-hint'],
    };
    const ctx: RenderContext = {
      id: workflowId,
      kind: 'workflow',
      hasPlugin: entry.hasPlugin ?? false,
      workflow: {
        name: workflow.name,
        description: workflow.description,
        steps: workflow.stages.map((s): RenderStep => ({
          name: s.name ?? s.id,
          skills: s.skills,
        })),
      },
      metaFrontmatter: meta,
    };
    // Merge config-declared frontmatter metadata (effort/allowed-tools/
    // argument-hint) into the agent's base frontmatter before rendering —
    // empty values are dropped so unset fields never reach the .md file.
    const fm = mergeMetaFrontmatter(entry.frontmatter, meta);
    await writeEntry(workflowId, ctx, fm, entry.body);
  }

  for (const [commandId, command] of Object.entries(config.commands)) {
    // Commands render ONLY when the agent defines a command template
    // (commandFrontmatter/commandBody) — an agent entry that predates the
    // commands field gets no command files, without failing generation.
    if (!entry.commandBody) {
      skipped.push(commandId);
      continue;
    }

    const meta: FrontmatterMeta = {
      effort: command.effort,
      'allowed-tools': command['allowed-tools'],
      'argument-hint': command['argument-hint'],
    };
    const ctx: RenderContext = {
      id: commandId,
      kind: 'command',
      hasPlugin: entry.hasPlugin ?? false,
      workflow: {
        name: command.name,
        description: command.description,
        steps: [],
      },
      command: {
        name: command.name,
        description: command.description,
        prompt: command.prompt ?? command.description,
        skills: command.skills ?? [],
      },
      metaFrontmatter: meta,
    };
    const fm = mergeMetaFrontmatter(entry.commandFrontmatter ?? {}, meta);
    await writeEntry(commandId, ctx, fm, entry.commandBody);
  }

  const removed = await removeStaleByDir(entry, destDir, keepWorkflowIds);

  return { agent: agentId, generated, removed, skipped };
}

// ---------------------------------------------------------------------------
// Stateless stale cleanup
// ---------------------------------------------------------------------------

/**
 * Prune stale `aet-*` entries from an agent's destDir by scanning the
 * directory — no manifest required.
 *
 * The `aet-` prefix is AET's reserved namespace. For `markdown-flat`
 * (CC) it matches stale `aet-*.md` command files; for `markdown-skill`
 * (OpenCode) it matches stale `aet-*` skill subdirectories. Entries whose
 * id is still in `keepWorkflowIds` are preserved; the rest are removed.
 *
 * Non-`aet` entries (other tools' commands/skills) are never touched.
 * Workflows whose id lacks the `aet-` prefix are also not pruned by this
 * scan (a rare edge case; their stale files are harmless — Core reports
 * the workflow unknown if triggered).
 */
async function removeStaleByDir(
  entry: AgentEntry,
  destDir: string,
  keepWorkflowIds: Set<string>,
): Promise<string[]> {
  if (!existsSync(destDir)) return [];
  const removed: string[] = [];
  const entries = await readdir(destDir, { withFileTypes: true });
  for (const e of entries) {
    const name = e.name;
    if (!name.startsWith('aet-')) continue;

    // Derive the workflow id the entry corresponds to.
    // markdown-flat: file `aet-<id>.md` → id = stem (basename minus .md)
    // markdown-skill: dir `aet-<id>`     → id = directory name
    let workflowId: string;
    if (entry.format === 'markdown-flat') {
      if (!e.isFile()) continue;
      if (!name.endsWith('.md')) continue;
      workflowId = name.slice(0, -'.md'.length);
    } else {
      if (!e.isDirectory()) continue;
      workflowId = name;
    }

    if (keepWorkflowIds.has(workflowId)) continue;

    await rm(join(destDir, name), { force: true, recursive: true });
    removed.push(workflowId);
  }
  return removed;
}
