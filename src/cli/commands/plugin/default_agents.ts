/**
 * @file src/cli/commands/plugin/default_agents.ts
 *
 * Built-in agent adapter defaults. The floor of the three-layer agents
 * config merge (see agents_config.ts).
 *
 * SINGLE SOURCE OF TRUTH: per-host VARIABLES (label, file-layer profile,
 * destDir, hasPlugin) live in `src/plugins/hosts.json` — the same file that
 * declares each host's hook dialect + build distribution. This module holds
 * only the SHARED template bodies (the `cc-flat` and `skill` profiles) and
 * derives `DEFAULT_AGENTS` from hosts.json. Adding a host = one block in
 * hosts.json; nothing to edit here unless a genuinely new output format is
 * introduced.
 *
 * Profile → format mapping:
 *   - `cc-flat`: markdown-flat slash commands (claude-code / codeagent3 /
 *     opencode), `hasPlugin: true` — the plugin handles init + handover
 *     automatically (opencode's `command.execute.before` intercepts the
 *     generated `/aet-*` commands and runs `aet workflow command-init`).
 *   - `skill`:   markdown-skill `<id>/SKILL.md` (codex),
 *     `hasPlugin: false` — the agent self-triggers / self-inits via bash.
 *
 * All adapters install PER-PROJECT (destDir is project-relative) per the
 * design decision B = "项目默认" (spec-kit per-project model). A user can
 * opt into user-global install by overriding destDir with a `~`-prefixed
 * path in agents.json.
 */

import type { AgentEntry, AgentsConfig } from './agents_config.js';
import hostsData from '../../../plugins/hosts.json';

interface HostDecl {
  label: string;
  /** File-layer facet: which template profile + where + whether the plugin runs init. */
  agent?: { profile: string; destDir: string; hasPlugin: boolean };
}

const HOSTS = (hostsData as { hosts: Record<string, HostDecl> }).hosts;

// ---------------------------------------------------------------------------
// Shared template profiles
// ---------------------------------------------------------------------------

/**
 * CC flat command profile: markdown-flat slash commands, `hasPlugin: true`
 * (the plugin handles init + handover automatically). `claude-code` and
 * `codeagent3` are the same profile differing only in destDir — codeagent3
 * writes to `.cac/` so it stays separate from a co-installed CC distribution.
 */
function ccFlatAgent(label: string, destDir: string, hasPlugin: boolean): AgentEntry {
  return {
    label,
    hasPlugin,
    destDir,
    format: 'markdown-flat',
    filename: '{{id}}.md',
    frontmatter: {
      description: '{{workflow.description}}',
      'disable-model-invocation': 'true',
    },
    body: `/{{id}} $ARGUMENTS

## 介绍

{{workflow.description}}

## 工作流概览

本工作流共 {{workflow.steps_count}} 个阶段：

{{workflow.steps_list}}

阶段切换：每完成一个阶段，通过 bash 执行 \`aet workflow handover\` 进入下一阶段。

{{init_guidance}}
`,
    // Command (single-dispatch) template: self-contained — core skill(s) +
    // description, no workflow lifecycle, no init/handover guidance. The
    // handler passes command ids through (emits null) so CC's native slash
    // command expansion injects THIS file content verbatim.
    commandFrontmatter: {
      description: '{{command.description}}',
      'disable-model-invocation': 'true',
    },
    commandBody: `/{{id}} $ARGUMENTS

{{command.skills_list}}{{command.description}}
`,
  };
}

/**
 * Skill profile: `<dir>/<id>/SKILL.md`, model-invocable + description-
 * triggered (ctx7-style). `hasPlugin: false` — the agent must self-init via
 * bash. Used by codex (codex's `.agents/skills` per spec-kit's
 * CodexIntegration).
 */
function skillAgent(label: string, destDir: string, hasPlugin: boolean): AgentEntry {
  return {
    label,
    hasPlugin,
    destDir,
    format: 'markdown-skill',
    filename: '{{id}}/SKILL.md',
    frontmatter: {
      name: '{{id}}',
      description:
        '{{workflow.description}}\n\nTriggers: "start {{id}} workflow", "run aet workflow {{id}}".',
    },
    body: `# {{workflow.name}}

## 介绍

{{workflow.description}}

## 工作流概览

本工作流共 {{workflow.steps_count}} 个阶段：

{{workflow.steps_list}}

阶段切换：每完成一个阶段，通过 bash 执行 \`aet workflow handover\` 进入下一阶段。

{{init_guidance}}
`,
    // Command template: self-contained, description-triggered (no plugin).
    commandFrontmatter: {
      name: '{{id}}',
      description: '{{command.description}}\n\nTriggers: "/{{id}}", "start {{id}}".',
    },
    commandBody: `# {{command.name}}

{{command.skills_list}}{{command.description}}
`,
  };
}

// ---------------------------------------------------------------------------
// Built-in defaults — derived from the single hosts.json registry
// ---------------------------------------------------------------------------

/** Build a per-agent entry from a host's file-layer facet. */
function entryFromHost(id: string, h: HostDecl): AgentEntry {
  const agent = h.agent;
  if (!agent) throw new Error(`[default_agents] host "${id}" has no agent facet`);
  switch (agent.profile) {
    case 'cc-flat':
      return ccFlatAgent(h.label, agent.destDir, agent.hasPlugin);
    case 'skill':
      return skillAgent(h.label, agent.destDir, agent.hasPlugin);
    default:
      throw new Error(`[default_agents] host "${id}" has unknown agent profile "${agent.profile}"`);
  }
}

/** Defaults: every host in hosts.json that declares a file-layer `agent` facet. */
export const DEFAULT_AGENTS: AgentsConfig = {
  agents: Object.fromEntries(
    Object.entries(HOSTS)
      .filter(([, h]) => h.agent)
      .map(([id, h]) => [id, entryFromHost(id, h)]),
  ),
};
