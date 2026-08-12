/**
 * @file src/plugins/omp/types.ts
 *
 * Minimal ambient types for the omp (Oh My Pi) extension surface that the
 * AET plugin consumes. These are intentionally minimal — they describe only
 * what we use, not the full omp HookAPI/ExtensionAPI surface.
 *
 * omp's hook model is an in-process TypeScript module: a factory
 * `(pi: HookAPI) => void` that subscribes to lifecycle events via
 * `pi.on(event, handler)`. This is architecturally a sibling of OpenCode's
 * in-process Plugin API (NOT Claude Code's stdin/stdout JSON scripts), so the
 * omp plugin gets its own directory under src/plugins/omp/ — it is NOT a
 * dialect adapter of the CC handler (per 架构方案 §spec-kit model: hosts
 * with a different runtime hook bus get their own plugin, not a dialect).
 *
 * Source of truth for the shapes below (per ctx7 `/websites/omp_sh`, the
 * upstream omp.sh/docs/hooks, 2026-08):
 *   - pre-tool hook  : `pi.on("tool_call", (event) => {...})` — event has
 *                      `{ toolName, input, isError? }`; returning
 *                      `{ block: true, reason }` blocks; returning
 *                      `{ input: {...} }` rewrites the tool input.
 *   - post-tool hook : `pi.on("tool_result", (event) => {...})` — event has
 *                      `{ toolName, content, isError }` where content is an
 *                      array of `{ type: "text", text }` parts; returning
 *                      `{ content }` replaces the result the model sees.
 *   - hook dirs      : `~/.omp/agent/hooks/{pre,post}/*.ts` (global) +
 *                      `.omp/hooks/{pre,post}/*.ts` (project).
 *   - plugin manifest: `package.json` with `"omp": { "extensions": ["./path.ts"] }`
 *                      pointing at the factory module (NOT a `main` field).
 *
 * For the canonical types, install `@oh-my-pi/pi-coding-agent` as a devDep
 * and the real types will override these ambient declarations. Without that
 * devDep, these declarations let the plugin typecheck and bundle cleanly
 * (the zero-runtime-dep invariant is preserved — same approach as the
 * opencode plugin's types.ts).
 */

// ── Plugin lifecycle ──────────────────────────────────────────────────────

/**
 * A part of a tool result / message content. omp uses the standard
 * `{ type: "text", text }` content-part shape (verified via ctx7 session-format
 * docs: toolResult messages carry `content: [{type:"text",text}]`). The
 * plugin only emits text parts; other shapes are opaque to us.
 */
export interface MessagePart {
  type: string;
  text?: string;
  // Allow other opaque fields without forcing `any`.
  [key: string]: unknown;
}

/**
 * Event delivered to a `pi.on("tool_call", ...)` handler (pre-tool).
 *
 * `input` is the tool's argument object; for the `bash` tool it carries
 * `{ command }`. Returning `{ input: {...} }` from the handler rewrites the
 * tool input omp will execute; returning `{ block: true, reason }` blocks it.
 */
export interface ToolCallEvent {
  /** omp tool name (lowercase, e.g. `bash`, `read`). */
  toolName: string;
  /** Tool input arguments (e.g. `{ command }` for bash). */
  input: { command?: string; [key: string]: unknown };
  /** True when the tool call is an error path (rare for pre-tool). */
  isError?: boolean;
  [key: string]: unknown;
}

/**
 * Event delivered to a `pi.on("tool_result", ...)` handler (post-tool).
 *
 * `content` is the array of result parts the model will see. Returning
 * `{ content }` replaces it; returning `{}` leaves it untouched.
 */
export interface ToolResultEvent {
  /** omp tool name (lowercase, e.g. `bash`, `read`). */
  toolName: string;
  /** Result content parts (omp uses the standard text-part shape). */
  content: MessagePart[];
  /** True when the tool execution errored. */
  isError: boolean;
  [key: string]: unknown;
}

/**
 * Return value shape for a `tool_call` / `tool_result` handler.
 *   - `block: true` + `reason`  → block the tool call (tool_call only).
 *   - `input: {...}`            → rewrite the tool input (tool_call only).
 *   - `content: [...]`          → replace the result content (tool_result only).
 * Returning `undefined` (no return) leaves the event untouched.
 */
export interface HookReturn {
  block?: boolean;
  reason?: string;
  input?: { command?: string; [key: string]: unknown };
  content?: MessagePart[];
  [key: string]: unknown;
}

/**
 * omp HookAPI — the surface a hook factory module receives. We only use
 * `on(event, handler)` to subscribe; omp's full API also exposes `zod`,
 * `registerCommand`, `registerTool` etc. (ExtensionAPI), which this plugin
 * does not use (ACTIVE MODE is carried by markdown command bodies + the
 * tool hooks, since omp has no `command.execute.before` equivalent).
 */
export interface HookAPI {
  /**
   * Subscribe to a lifecycle event. Supported events (per ctx7 omp hooks
   * docs): `tool_call` (pre-tool), `tool_result` (post-tool), plus
   * message/compact/session lifecycle events this plugin does not use.
   */
  on(
    event: 'tool_call' | 'tool_result' | string,
    handler: (event: ToolCallEvent | ToolResultEvent) => HookReturn | void | Promise<HookReturn | void>,
  ): void;
  /** Opaque accessor for the rest of the omp API (zod, registerCommand, …). */
  [key: string]: unknown;
}

// ── AET CLI result shape (parsed from JSON output) ───────────────────────

/**
 * Output event payload — discriminated union by `id`.
 *
 * Mirrors `src/definitions/events.ts` OutputEvent but loosened to a
 * structural shape so the plugin doesn't need to import from core
 * (keeps the dependency direction one-way: plugins → definitions, NOT
 * plugins → core; per 架构方案 §2.3). Identical to the opencode plugin's
 * shape for the same reason.
 */
export interface OutputEvent {
  id: string;
  payload: Record<string, unknown>;
}

/** Result of an `aet` CLI invocation (JSON mode). */
export interface CommandResult {
  ok: boolean;
  prompt?: string;
  events?: OutputEvent[];
  data?: { status?: string; [key: string]: unknown };
  error?: { code: string; message: string };
}
