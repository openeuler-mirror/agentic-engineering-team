/**
 * @file src/plugins/claude_code/types.ts
 *
 * Types specific to the Claude Code plugin (cc_plugin): the CC hook I/O
 * shapes and the plugin manifest.
 *
 * Core contract types (CommandResult / CommandData / OutputEvent) are NOT
 * mirrored here — the plugin imports them as `import type` from
 * `src/definitions/events.ts` (the contract layer, per 架构方案 §3.3:
 * plugins → definitions). `import type` is erased at build, so the bundled
 * handler keeps zero runtime dependency on Core, and type drift between the
 * plugin and Core surfaces as a compile error instead of a silent mismatch.
 *
 * These shapes describe the JSON the handler scripts receive and emit, plus
 * the manifest that index.ts exports for tooling/install.
 */

// ---------------------------------------------------------------------------
// CC hook I/O (per ctx7 Claude Code hooks docs)
// ---------------------------------------------------------------------------

/**
 * Input event shape (the JSON CC sends to the handler via stdin).
 *
 * CC uses snake_case for input fields (per ctx7 CC hooks API docs):
 *   hook_event_name, session_id, cwd, prompt, tool_name, tool_input,
 *   tool_response, tool_use_id
 *
 * We name the typed fields to match what CC actually sends (snake_case).
 * TypeScript handles underscores in property names just fine.
 */
export interface CcHookInput {
  /** CC hook event name (snake_case). */
  hook_event_name?: string;
  /** CC session ID (snake_case). */
  session_id?: string;
  /** Current working directory. */
  cwd?: string;
  /** User prompt text (UserPromptSubmit only). */
  prompt?: string;
  /** Tool name (PreToolUse / PostToolUse only). */
  tool_name?: string;
  /** Tool input params (PreToolUse / PostToolUse only). */
  tool_input?: Record<string, unknown>;
  /** Tool response (PostToolUse only). */
  tool_response?: {
    stdout?: string;
    stderr?: string;
    /** Present in Bash output. */
    interrupted?: boolean;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** CC hook event name to set in the additionalContext output. */
export type CcHookEventName =
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

/** CC hook output shape (the part we emit). */
export interface CcHookOutput {
  hookSpecificOutput?: {
    /**
     * The event name WE write back. It starts as a canonical (claude)
     * event and is translated through the host dialect before emit — so on
     * a non-claude host that renames events this holds the HOST's name, not
     * the canonical one (currently no registered dialect renames it, but the
     * machinery supports it). Typed as `string` for that reason; see
     * src/plugins/dialect.ts.
     */
    hookEventName: string;
    additionalContext?: string;
    /** PreToolUse only: allow/deny/ask/defer the tool call. */
    permissionDecision?: 'allow' | 'deny' | 'ask' | 'defer';
    permissionDecisionReason?: string;
    /** PreToolUse only: rewrite the tool input (e.g. append --output json). */
    updatedInput?: { command?: string; [key: string]: unknown };
    /** PostToolUse only: replace the tool result the model sees. */
    updatedToolOutput?: { stdout?: string; [key: string]: unknown };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Plugin manifest
// ---------------------------------------------------------------------------

/** Plugin manifest describing how to install this plugin into ~/.claude/. */
export interface CcPluginManifest {
  /** Plugin ID. */
  id: string;
  /** Display name. */
  name: string;
  /** CC Hooks config (settings.json snippet to merge into ~/.claude/settings.json). */
  settings: Record<string, unknown>;
  /** Slash command files to copy into ~/.claude/commands/. */
  commands: { src: string; dest: string }[];
  /** Handler scripts invoked by the hooks (bundled to JS). */
  handlers: { src: string; dest: string }[];
  /** Capability matrix (per R8) — what's supported vs degraded. */
  capabilities: Record<string, 'supported' | 'degraded' | 'unsupported'>;
}
