/**
 * @file src/plugins/shared_hooks.ts
 *
 * Pure, host-agnostic hook DECISION helpers shared by the Claude Code
 * handler and the OpenCode plugin. Zero external deps (Node builtins only)
 * — safe to inline into either plugin's single-file bundle, which keeps the
 * build-time zero-dependency invariant (scripts/build.mjs) intact.
 *
 * These helpers only parse / classify / rewrite strings. Host-specific I/O
 * lives in each plugin's own adapter:
 *   - claude_code/hooks/handlers/*  — CC stdin/stdout JSON envelope
 *   - opencode/hooks/*              — in-process OpenCode Plugin API
 */

/**
 * Bash commands that contain `aet workflow <action> ...` — anywhere on the
 * command line, not just at the start. NOT anchored to ^ so prefixed /
 * chained invocations still match:
 *   - `cd /proj && aet workflow init --name x`
 *   - `sudo aet workflow handover`
 *   - `aet workflow handover && echo done`
 * The `aet\s+workflow\s+\S+` token sequence is specific enough that ordinary
 * non-AET commands (e.g. `git status`) never match. All hosts (CC / opencode /
 * omp) reuse this single matcher so classification is consistent.
 */
export const AET_WORKFLOW_RE = /aet\s+workflow\s+\S+/;

/**
 * Bash commands that contain `aet plugin init`. Same unanchored rationale as
 * {@link AET_WORKFLOW_RE} — `aet plugin init` embedded in a larger command
 * still needs the `--agent` flag appended.
 */
export const AET_PLUGIN_INIT_RE = /aet\s+plugin\s+init\b/;

/**
 * Match a leading slash command and capture its id — AET's workflow/command
 * id, with or without the `aet:` namespace prefix (`/design` and `/aet:design`
 * both capture `design`). The `aet-` prefix on an id is NOT stripped — ids are
 * the config's workflow/command keys verbatim (e.g. `design`, `implement`),
 * so `/aet-design` resolves to an unknown id and falls through to pass-through.
 * Anchored to the FIRST LINE ONLY.
 *
 * Claude Code's UserPromptSubmit path uses this. OpenCode's
 * `command.execute.before` receives the bare command name (no leading
 * slash, per the OpenCode Plugin API) and must NOT use this regex.
 */
export const SLASH_CMD_RE = /^\/(?:aet:)?([\w-]+)(?:[^\n]*)?/;

/** Extract the workflow/command id from a leading-slash prompt, or null. */
export function parseSlash(prompt: string): string | null {
  const m = prompt.match(SLASH_CMD_RE);
  return m ? m[1] : null;
}

/**
 * Match a leading slash command and capture (1) the id and (2) the trailing
 * arguments on the same line — the user's initial-requirement text. Used by
 * plugin hooks to append `--argument` to the spawned `aet workflow
 * command-init` call so the requirement is captured into the checkpoint.
 *
 * Shares the id prefix-agnostic capture with {@link SLASH_CMD_RE} but adds a
 * second capture group for the remainder. Anchored to the first line.
 */
const SLASH_ARGS_RE = /^\/(?:aet:)?([\w-]+)(?:[ \t]+([^\n]*))?/;

/**
 * Extract the trailing arguments after a leading-slash command — the user's
 * initial-requirement text (e.g. `/design 做一个登录功能` → `做一个登录功能`).
 * Returns the trimmed remainder, or `null` when the prompt carries no slash
 * command or no trailing args. Multi-word arguments stay as one string (the
 * caller spawns with the text as a single argv token — no shell quoting).
 */
export function parseSlashArgs(prompt: string): string | null {
  const m = prompt.match(SLASH_ARGS_RE);
  if (!m) return null;
  const rest = (m[2] ?? '').trim();
  return rest.length > 0 ? rest : null;
}

/** True iff the command already contains any of `flags` (bare or `=` form). */
export function hasFlag(command: string, flags: readonly string[]): boolean {
  const tokens = command.split(/\s+/).filter(Boolean);
  return tokens.some((t) => flags.some((f) => t === f || t.startsWith(`${f}=`)));
}

/**
 * The AET CLI invocation token sequence — `aet workflow <action>` or
 * `aet plugin init`. `rewriteAddFlag` inserts the flag immediately AFTER this
 * sequence so it lands on the `aet` command, not on a later pipeline stage:
 *   `aet workflow status | jq .` → `aet workflow status --output json | jq .`
 *   (end-of-string append would have put `--output json` on `jq`).
 */
const AET_INVOCATION_RE = /aet\s+(?:workflow\s+\S+|plugin\s+init)/;

/**
 * Append `--<flag> [value]` to the `aet ...` invocation in `command`, right
 * after the invocation token sequence (not at end-of-string — a piped /
 * chained command must get the flag on the `aet` call, not on the stage after
 * `|` / `&&`). Idempotent — if the agent already typed the flag, returns null
 * (no rewrite needed). Preserves the trailing newline if the original had one.
 * Returns null when the command carries no `aet` invocation (unreachable for
 * callers that already matched `AET_WORKFLOW_RE` / `AET_PLUGIN_INIT_RE`).
 */
export function rewriteAddFlag(
  command: string,
  flags: readonly string[],
  value?: string,
): string | null {
  if (hasFlag(command, flags)) return null;
  const m = AET_INVOCATION_RE.exec(command);
  if (!m || m.index === undefined) return null;
  const flagText = `${flags[0]}${value !== undefined ? ` ${value}` : ''}`;
  const at = m.index + m[0].length;
  return command.slice(0, at) + ' ' + flagText + command.slice(at);
}

/**
 * True iff `command` is a single self-contained invocation with no shell
 * operators (`; && || | < > $ backtick newline`, subshell parens, etc.)
 * outside quoted regions.
 *
 * Gates whether a PreToolUse hook may AUTO-ALLOW: only a lone, well-formed
 * `aet <subcommand> ...` call may skip the host's permission prompt. A command
 * that chains / pipes / redirects still gets its `--output json` / `--agent`
 * rewritten (the flag is inserted on the right command), but goes through the
 * host's NORMAL permission flow — auto-allowing a chain would let the whole
 * thing run unprompted, including a malicious tail (`aet workflow status && curl …`).
 */
export function isSingleCommand(command: string): boolean {
  let quote: string | null = null;
  let escaped = false;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (c === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      continue;
    }
    if (c === ';' || c === '&' || c === '|' || c === '<' || c === '>' || c === '$' || c === '`' || c === '(' || c === ')' || c === '\n') {
      return false;
    }
  }
  return true;
}
