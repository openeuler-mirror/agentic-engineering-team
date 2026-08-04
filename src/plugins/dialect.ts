import hostsData from './hosts.json';

/**
 * @file src/plugins/dialect.ts
 *
 * Host hook dialect — the connector layer that lets ONE handler engine
 * speak to a family of "Claude Code-like" coding-agent runtimes without
 * duplicating per-host handler code.
 *
 * Design principle (per 架构方案 §spec-kit model): handler logic is written
 * ONCE, always in terms of CLAUDE's canonical event names. Each host
 * contributes a small, declarative `HostDialect` that only states how its
 * hook NAMESPACE differs from Claude. The active dialect is baked at build
 * time (esbuild `define` `__AET_DIALECT_ID__`), defaulting to `claude`
 * (identity) under tests / ts-node.
 *
 * Verified differences (ctx7, 2026-08): OpenAI Codex hook names match
 * Claude 1:1; the `codeagent` runtime's hook names and post-tool output
 * field were previously renamed (e.g. PreToolUse → BeforeToolUse,
 * updatedToolOutput → updatedMCPToolOutput) but are now ALIGNED with Claude
 * 1:1, so its dialect is a zero-override `extends: 'claude'`. The rename
 * machinery here remains for any host that later diverges; it is identity
 * for the currently-registered dialects.
 *
 * This layer is deliberately NARROW: it only remaps the runtime hook
 * envelope. File-generation differences (destDir / format per agent) are
 * handled separately by `src/cli/commands/plugin/` (the spec-kit AgentEntry
 * model). Hosts without a runtime hook bus (Trae, Qwen, OpenCode file-only)
 * have NO dialect — the file layer alone serves them.
 */

// ---------------------------------------------------------------------------
// Canonical event vocabulary
// ---------------------------------------------------------------------------
//
// The left-hand side is always a CLAUDE event name. `CcHookEventName` in
// claude_code/types.ts mirrors the runtime-provided names for the CC
// plugin specifically; this is the host-agnostic canonical set the handler
// dispatches on internally.

/** Events the handler engine knows, named after Claude Code's events. */
export type CanonicalEventName =
  | 'UserPromptSubmit'
  | 'SessionStart'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PermissionRequest'
  | 'Notification'
  | 'Stop'
  | 'SubagentStop'
  | 'PreCompact'
  | 'Setup'
  | 'SessionEnd';

/** Permission decisions a PreToolUse-style hook may express. */
export type PermissionDecision = 'allow' | 'deny' | 'ask' | 'defer';

// ---------------------------------------------------------------------------
// Dialect declaration
// ---------------------------------------------------------------------------

/** Declarative per-host hook namespace difference from Claude Code. */
export interface HostDialect {
  /** Dialect id (file the active-dialect define / registry key). */
  readonly id: string;
  /**
   * Inherit another dialect's overrides first. `'claude'` is the base
   * (identity). Unset = extends claude implicitly.
   */
  readonly extends?: string;
  /** Canonical → host event renames. Omitted = same as claude. */
  readonly hookEventNames?: Partial<Record<CanonicalEventName, string>>;
  /**
   * Field names inside the host's `hookSpecificOutput` envelope, mirroring
   * the real payload shape (`hookSpecificOutput.hookEventName` and
   * `hookSpecificOutput.updatedToolOutput` are siblings). The KEY is the
   * canonical (claude) field name; the VALUE is the host's rename. Only
   * renames are listed; omitted = claude default. (codeagent previously
   * renamed `updatedToolOutput` → `updatedMCPToolOutput` but is now aligned
   * with claude, so no entry is needed for it today.)
   */
  readonly hookSpecificOutput?: {
    /**
     * PostToolUse-style hook's tool-result replacement field. Claude uses
     * `updatedToolOutput`; a host that diverges lists its rename here. The
     * key is the canonical name (`updatedToolOutput`) so it lives under the
     * same key in hosts.json — resolved via {@link ResolvedDialect.postToolUseOutput}.
     */
    [canonical: string]: string;
  };
  /** Which permission decisions the host supports (capability surface). */
  readonly permissions?: readonly PermissionDecision[];
  /** Canonical → host matcher string for events whose matcher differs. */
  readonly matchers?: Partial<Record<CanonicalEventName, string>>;
}

// ---------------------------------------------------------------------------
// Dialect registry (single source of truth: src/plugins/hosts.json)
// ---------------------------------------------------------------------------

/**
 * Registry of known dialects, keyed by id. claude is the base/identity.
 *
 * The data lives in `src/plugins/hosts.json` (`dialects` section) — the
 * same file that declares each host's `distribution` and `agent` facets, so
 * a plugin's hook mapping is defined exactly where its build/install fields
 * are. `extends` inheritance + the accessors are resolved here in code.
 */
export const DIALECTS: Record<string, HostDialect> = hostsData.dialects as Record<string, HostDialect>;

// ---------------------------------------------------------------------------
// Active dialect resolution (build-time baked id)
// ---------------------------------------------------------------------------

/**
 * The dialect id baked into this bundle. Substituted at BUILD TIME by
 * esbuild `define` (see build.mjs CC_DISTRIBUTIONS → `dialectId` column —
 * `claude` for the claude-code and codeagent3 distributions). The
 * `typeof` guard is a dev fallback for non-esbuild execution (ts-node /
 * vitest direct run).
 */
declare const __AET_DIALECT_ID__: string | undefined;
export const DIALECT_ID: string =
  typeof __AET_DIALECT_ID__ !== 'undefined' ? __AET_DIALECT_ID__ : 'claude';

// ---------------------------------------------------------------------------
// Resolved dialect (flattened, precomputed accessors)
// ---------------------------------------------------------------------------

/** Flattened dialect ready for hot-path queries. */
export interface ResolvedDialect {
  readonly id: string;
  /** Canonical claude event → host event name (identity for claude). */
  readonly toHostEvent: (e: CanonicalEventName) => string;
  /** Host event name → canonical claude event (reverse lookup). */
  readonly fromHostEvent: (host: string) => string;
  /**
   * Field under which a PostToolUse-style hook replaces the tool output —
   * the name inside `hookSpecificOutput` (sibling to `hookEventName`).
   */
  readonly postToolUseOutput: string;
  /** Which permission decisions this host supports. */
  readonly permissions: readonly PermissionDecision[];
}

/** Merge a dialect's overrides down to a single flat map (resolves `extends`). */
function flatten(id: string, seen = new Set<string>()): HostDialect {
  if (seen.has(id)) throw new Error(`[dialect] circular extends: ${[...seen, id].join(' -> ')}`);
  const cur = DIALECTS[id] ?? { id };
  seen.add(id);
  if (cur.extends && cur.extends !== id) {
    const base = flatten(cur.extends, seen);
    return {
      id: cur.id,
      hookEventNames: { ...base.hookEventNames, ...cur.hookEventNames },
      hookSpecificOutput: { ...base.hookSpecificOutput, ...cur.hookSpecificOutput },
      permissions: cur.permissions ?? base.permissions,
      matchers: { ...base.matchers, ...cur.matchers },
    };
  }
  return cur;
}

/** Normalize a raw dialect into a host-safe flat shape (not identity-wrap). */
export function normalizeDialect(d: HostDialect): HostDialect {
  const flat = d.extends ? flatten(d.extends) : {};
  return {
    id: d.id,
    hookEventNames: { ...flat.hookEventNames, ...d.hookEventNames },
    hookSpecificOutput: { ...flat.hookSpecificOutput, ...d.hookSpecificOutput },
    permissions: d.permissions ?? flat.permissions,
    matchers: { ...flat.matchers, ...d.matchers },
  };
}

const DEFAULT_PERMISSIONS: readonly PermissionDecision[] = ['allow', 'deny', 'ask', 'defer'];

/** Resolve a dialect id (or raw dialect) into flat, ready-to-use accessors. */
export function resolveDialect(idOrDialect: string | HostDialect): ResolvedDialect {
  const raw = typeof idOrDialect === 'string' ? flatten(idOrDialect) : normalizeDialect(idOrDialect);
  const eventToHost: Partial<Record<CanonicalEventName, string>> = raw.hookEventNames ?? {};
  const hostToEvent: Record<string, string> = {};
  for (const canonical of Object.keys(eventToHost) as CanonicalEventName[]) {
    hostToEvent[eventToHost[canonical]!] = canonical;
  }
  return {
    id: raw.id,
    toHostEvent: (canonical) => eventToHost[canonical] ?? canonical,
    fromHostEvent: (host) => hostToEvent[host] ?? host,
    postToolUseOutput: raw.hookSpecificOutput?.updatedToolOutput ?? 'updatedToolOutput',
    permissions: raw.permissions ?? DEFAULT_PERMISSIONS,
  };
}