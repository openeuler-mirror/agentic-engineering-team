/**
 * AGENT_REGISTRY — single source of truth for plug-in agent definitions.
 *
 * Architecture (referenced from Spec Kit's `src/specify_cli/integrations/__init__.py`):
 *   - One Map<key, BaseAgent> holds all registered agents
 *   - `registerAgent(a)` enforces non-empty + unique key (matches Spec Kit's
 *     `_register()` ValueError-on-empty / KeyError-on-duplicate semantics)
 *   - `registerBuiltinAgents()` instantiates each built-in subclass once
 *     (alphabetical, mirroring Spec Kit's `_register_builtins()`)
 *   - `getAgent(key)` is the lookup equivalent of Spec Kit's `get_integration(key)`
 *   - `resolveAgent(input)` resolves a user-input string by exact key OR by
 *     alias, returning the canonical key + BaseAgent instance
 *
 * Adding a new agent = exactly 2 edits:
 *   1. Create `agents/<key>.ts` with a subclass of BaseAgent declaring the
 *      readonly metadata (key, name, aliases, paths, formats).
 *   2. In `registerBuiltinAgents()`: add one import + one `registerAgent(new XAgent())`.
 * No edits to lookup tables — aliases are derived from each agent's class.
 */
import { BaseAgent } from './base-agent';

// Built-in agent imports (alphabetical — mirrors Spec Kit's _register_builtins()).
// Adding a new agent: (1) create ./agents/<key>.ts subclass, (2) add import
// here, (3) add registerAgent(new XAgent()) in registerBuiltinAgents().
import ClaudeAgent from './agents/claude';
import CodexAgent from './agents/codex';
import CursorAgent from './agents/cursor-agent';
import GeminiAgent from './agents/gemini';
import OmpAgent from './agents/omp';
import OpenCodeAgent from './agents/opencode';
import PiAgent from './agents/pi';
import TraeAgent from './agents/trae';

export const AGENT_REGISTRY = new Map<string, BaseAgent>();

/**
 * Register an agent instance. Throws if key is empty or duplicate.
 * (Mirrors Spec Kit's _register() ValueError/KeyError semantics.)
 */
export function registerAgent(a: BaseAgent): void {
  if (!a.key) throw new Error(`Agent ${a.constructor.name} has empty key`);
  if (AGENT_REGISTRY.has(a.key)) {
    throw new Error(`Agent key already registered: ${a.key} (duplicate from ${a.constructor.name})`);
  }
  AGENT_REGISTRY.set(a.key, a);
}

/**
 * Lookup by canonical key. Returns undefined if not registered.
 * (Equivalent of Spec Kit's get_integration(key).)
 */
export function getAgent(key: string): BaseAgent | undefined {
  return AGENT_REGISTRY.get(key);
}

/**
 * Resolve a user-input string to a registered agent. Tries exact key first,
 * then iterates agents checking `aliases` (case-insensitive).
 * Returns the BaseAgent instance or undefined.
 *
 * Examples:
 *   resolveAgent('claude code') → ClaudeAgent  (alias)
 *   resolveAgent('claude')      → ClaudeAgent  (alias)
 *   resolveAgent('cursor')      → CursorAgent  (alias)
 *   resolveAgent('cursor-agent') → CursorAgent (canonical key)
 *   resolveAgent('all')         → undefined    (special keyword, handled by caller)
 */
export function resolveAgent(input: string): BaseAgent | undefined {
  const lc = input.toLowerCase();
  if (AGENT_REGISTRY.has(lc)) return AGENT_REGISTRY.get(lc);
  for (const a of AGENT_REGISTRY.values()) {
    if (a.aliases.includes(lc)) return a;
  }
  return undefined;
}

/** All registered agent keys (canonical). */
export function agentKeys(): string[] {
  return Array.from(AGENT_REGISTRY.keys());
}

// ⚠️ MODULE-LEVEL MUTABLE STATE (test discipline required)
// `_builtinsRegistered` is a singleton guard that ensures built-in agents
// are registered at most once per process. Tests that re-register agents
// (or run agents in isolation) MUST call `_resetRegistryForTest()` in
// beforeEach to clear the registry + reset this flag.
// base-agent-tests.ts:57 already does this.
let _builtinsRegistered = false;

/**
 * Register all built-in agents. Idempotent — only runs once per process.
 * Mirrors Spec Kit's `_register_builtins()` pattern.
 *
 * To add a new agent: import the subclass + add a registerAgent() call here
 * (alphabetical order, same convention as Spec Kit).
 */
export function registerBuiltinAgents(): void {
  if (_builtinsRegistered) return;
  _builtinsRegistered = true;

  // -- registration (alphabetical, mirrors Spec Kit's _register_builtins()) -
  registerAgent(new ClaudeAgent());
  registerAgent(new CodexAgent());
  registerAgent(new CursorAgent());
  registerAgent(new GeminiAgent());
  registerAgent(new OmpAgent());
  registerAgent(new OpenCodeAgent());
  registerAgent(new PiAgent());
  registerAgent(new TraeAgent());
}

/**
 * Test-only: clear registry + reset registration flag so tests can
 * re-register fresh agents in isolation.
 */
export function _resetRegistryForTest(): void {
  AGENT_REGISTRY.clear();
  _builtinsRegistered = false;
}
