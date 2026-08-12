/**
 * @file src/plugins/agent_meta.ts
 *
 * Plugin-layer shared agent metadata (新方案.md §2.3 / §3.1: "agent 参数规范").
 *
 * Declares the canonical agent identifiers the CLI accepts.
 *
 * This module lives at Layer 2 (plugins) because every concept here is a
 * host-adapter concern:
 *   - BuiltinAgentId enumerates concrete coding agents (opencode, …)
 *   - AgentMeta.pluginKind / defaultOutput drive CLI encoding choices
 *
 * Core (Layer 4) is agent-agnostic: it never imports this module. The
 * definitions layer (events.ts) keeps the agent identity off the
 * InputEvent payload entirely (agent is a CLI-layer concern used only
 * for output-mode resolution), so the event contract stays open to any
 * future agent without recompiling Core.
 */

// ---------------------------------------------------------------------------
// Agent identifiers
// ---------------------------------------------------------------------------

/**
 * Built-in agent identifiers. Plugins are matched case-insensitively by id;
 * unknown agents fall back to the `fallback` prompt-only plugin.
 */
export type BuiltinAgentId = 'opencode' | 'claude-code' | 'omp' | 'cursor' | 'fallback';

// ---------------------------------------------------------------------------
// Agent metadata
// ---------------------------------------------------------------------------

/**
 * Static metadata for built-in agents. The fallback entry covers any
 * agent string not listed above.
 */
export interface AgentMeta {
  id: string;
  /** Human-readable label. */
  label: string;
  /** Whether the agent ships an in-process plugin or relies on bash + prompt. */
  pluginKind: 'in-process' | 'bash-prompt';
  /** Default output mode when the caller does not specify `--output`. */
  defaultOutput: 'json' | 'prompt';
}

export const BUILTIN_AGENTS: Record<BuiltinAgentId, AgentMeta> = {
  opencode: { id: 'opencode', label: 'OpenCode', pluginKind: 'in-process', defaultOutput: 'json' },
  'claude-code': { id: 'claude-code', label: 'Claude Code', pluginKind: 'in-process', defaultOutput: 'json' },
  omp: { id: 'omp', label: 'OMP (Oh My Pi)', pluginKind: 'in-process', defaultOutput: 'json' },
  cursor: { id: 'cursor', label: 'Cursor', pluginKind: 'bash-prompt', defaultOutput: 'prompt' },
  fallback: { id: 'fallback', label: 'Generic Agent (prompt-only)', pluginKind: 'bash-prompt', defaultOutput: 'prompt' },
};

/**
 * Resolve any agent string to a canonical AgentMeta. Unknown ids return the
 * `fallback` meta — this is the deliberate degradation path per 新方案.md §1.3
 * ("降级一致").
 */
export function resolveAgentMeta(agent: string): AgentMeta {
  const key = (agent || '').toLowerCase() as BuiltinAgentId;
  return BUILTIN_AGENTS[key] ?? BUILTIN_AGENTS.fallback;
}
