/**
 * @file src/plugins/opencode/types.ts
 *
 * Minimal ambient types for the OpenCode Plugin API surface that the AET
 * plugin (op_plugin) consumes. These are intentionally minimal — they
 * describe only what we use, not the full OpenCode API.
 *
 * For the canonical types, install `@opencode-ai/plugin` as a devDep and
 * the real types will override these ambient declarations. Without that
 * devDep, these declarations let the plugin typecheck and bundle cleanly
 * (the zero-runtime-dep invariant is preserved).
 *
 * Source of truth for the shapes below (per ctx7 docs):
 *   - chat.message hook:
 *     (input: { sessionID, agent?, model?, messageID?, variant? },
 *      output: { message: UserMessage; parts: Part[] }) => Promise<void>
 *   - command.execute.before hook:
 *     (input: { command, sessionID, arguments },
 *      output: { parts: Part[] }) => Promise<void>
 *   - event hook:
 *     (event: { type: string; [k: string]: unknown }) => Promise<void>
 *   - experimental.chat.system.transform hook (legacy):
 *     (input: {}, output: { system: string[] }) => Promise<void>
 */

// ── Plugin lifecycle ──────────────────────────────────────────────────────

/** A part of a chat message (text/tool-call/etc). The plugin only pushes
 *  text parts; other shapes are opaque to us. */
export interface MessagePart {
  type: string;
  text?: string;
  // Allow other opaque fields without forcing `any`.
  [key: string]: unknown;
}

/** User message as exposed by the chat.message hook. */
export interface UserMessage {
  id?: string;
  sessionID: string;
  role: 'user';
  agent?: string;
  model?: { providerID: string; modelID: string };
  time?: { created: number };
  [key: string]: unknown;
}

/** OpencodeClient subset — the host API surface the plugin uses. */
export interface OpencodeClient {
  /** session.create is invoked on context.clear events. */
  session: {
    create(input?: { location?: { directory?: string } }): Promise<{ id: string }>;
    prompt(input: { sessionID: string; prompt: { parts: MessagePart[] } }): Promise<unknown>;
  };
  /** tui.publish is invoked on tui.session.select events. */
  tui?: {
    publish(input: { type: string; sessionID?: string; [key: string]: unknown }): Promise<unknown>;
  };
  /** app.log for structured logging (replaces console.log per ctx7 docs). */
  app: {
    log(input: {
      body: { service: string; level: 'debug' | 'info' | 'warn' | 'error'; message: string; extra?: Record<string, unknown> };
    }): Promise<unknown>;
  };
}

/** Plugin context passed to the plugin entry. */
export interface PluginContext {
  client: OpencodeClient;
  /** Hook registration surface — keys are hook IDs. */
  // The actual hook map has many keys; we expose only the ones we register.
  [key: string]: unknown;
}

/** The Plugin entry signature. */
export type Plugin = (ctx: PluginContext) => Promise<PluginHooks | void>;

/** Map of hook ID → hook handler. The plugin returns this from its entry. */
export interface PluginHooks {
  [hookId: string]: (input: unknown, output: unknown) => Promise<void>;
}

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

/** Result of an `aet` CLI invocation (JSON mode). */
export interface CommandResult {
  ok: boolean;
  events?: OutputEvent[];
  error?: { code: string; message: string };
}

/** Convenience: hook input shape for command.execute.before. */
export interface CommandBeforeInput {
  command: string;
  sessionID: string;
  arguments?: string | string[];
}

/** Convenience: hook output shape for command.execute.before. */
export interface CommandBeforeOutput {
  parts: MessagePart[];
}

/** Convenience: hook input shape for chat.message. */
export interface ChatMessageInput {
  sessionID: string;
  agent?: string;
  messageID?: string;
}

/** Convenience: hook output shape for chat.message. */
export interface ChatMessageOutput {
  message: UserMessage;
  parts: MessagePart[];
}
