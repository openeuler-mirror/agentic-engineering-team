/**
 * @file src/plugins/opencode/types.ts
 *
 * V2 type surface for the AET OpenCode plugin. The plugin consumes the
 * real V2 types from `@opencode/plugin` (type-only import — stripped by
 * esbuild so the zero-runtime-dep invariant holds) and re-exports the
 * subset downstream hooks / tests use.
 *
 * Canonical V2 API (per node_modules/@opencode/plugin 2.2.5,
 * dist/promise/): Plugin.define({ id, setup(ctx) }) where ctx exposes
 * skill / command / tool / session / event / app domains. V2 has NO
 * host-client property (D-009) and NO hooks-object return (V2 setup
 * registers hooks imperatively via `await ctx.<domain>.hook|transform(...)`).
 *
 * Source of truth for AET-specific shapes (src/AGENTS.md Core contract):
 *   - CommandResult: dual-channel envelope (prompt + events + data)
 *   - OutputEvent: discriminated union by `id` (plugins-only channel)
 */

// ── V2 Plugin types (re-exported, type-only — stripped at build) ──────────

import type { Plugin as PluginNS } from '@opencode/plugin';

/** V2 plugin interface: `{ id, setup(ctx) => cleanup | void }`. */
export type Plugin = PluginNS.Plugin;
/** V2 setup context: exposes `skill` / `command` / `tool` / `session` / `event` / `app` domains. */
export type PluginContext = PluginNS.Context;
/** V2 setup cleanup function. */
export type PluginCleanup = PluginNS.Cleanup;

// ── AET CLI result shape (parsed from JSON output) ───────────────────────

/**
 * Output event payload — discriminated union by `id`.
 *
 * Mirrors `src/definitions/events.ts` OutputEvent but loosened to a
 * structural shape so the plugin doesn't need to import from core
 * (keeps the dependency direction one-way: plugins → definitions, NOT
 * plugins → core; per 新方案.md §2.3).
 */
export interface OutputEvent {
  id: string;
  payload: Record<string, unknown>;
}

/**
 * Result of an `aet` CLI invocation (JSON mode).
 *
 * Per src/AGENTS.md Core contract — dual-channel design:
 *   - `prompt`: agent-visible text (plugin passes through / suppresses)
 *   - `events`: PLUGIN-ONLY, agent never sees raw
 *   - `data`: lifecycle metadata (`status` 8-state machine)
 *   - `error`: only when `ok === false`
 */
export interface CommandResult {
  ok: boolean;
  /** Agent-visible text. Primary channel — surfaced by the plugin to the agent. */
  prompt?: string;
  /** Plugin-only events (context.clear / prompt.inject / omit_prompt / error / …). */
  events?: OutputEvent[];
  /** Lifecycle metadata — `status` is one of 8 states (workflow_started / step_advanced / …). */
  data?: {
    status?: string;
    currentStep?: string | null;
    nextStep?: string | null;
    [key: string]: unknown;
  };
  /** Error envelope — only present when `ok === false`. */
  error?: { code: string; message: string };
}

// ── Ambient minimal types kept for backward compat ───────────────────────
//
// V2 ctx has no host-client property (D-009). json_to_op.ts drives
// ctx.session / console directly. OpencodeClient is retained as a minimal
// ambient shape because index.ts re-exports it and some tests still
// reference the structural form while migrating; it carries no runtime
// weight.

/** A part of a chat message (text/tool-call/etc). */
export interface MessagePart {
  type: string;
  text?: string;
  // Allow other opaque fields without forcing `any`.
  [key: string]: unknown;
}

/** OpencodeClient subset — retained for backward compat (V2 ctx has no host-client property). */
export interface OpencodeClient {
  /** session.create / session.prompt — V2 ctx.session mirrors this shape. */
  session: {
    create(input?: { location?: { directory?: string } }): Promise<{ id: string }>;
    prompt(input: { sessionID: string; text: string }): Promise<unknown>;
  };
  /** tui.publish — V2 TUI is a separate plugin part; retained here as optional. */
  tui?: {
    publish(input: { type: string; sessionID?: string; [key: string]: unknown }): Promise<unknown>;
  };
  /** app.log — V2 ctx.app has no log(); use console.log/warn with [AET] prefix. Retained as compat. */
  app?: {
    log(input: {
      body: { service: string; level: 'debug' | 'info' | 'warn' | 'error'; message: string; extra?: Record<string, unknown> };
    }): Promise<unknown>;
  };
}
