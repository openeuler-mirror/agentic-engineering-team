/**
 * @file src/plugins/claude_code/hooks/handlers/shared.ts
 *
 * Plumbing shared by every CC hook handler: stdin framing, CLI subprocess
 * spawning, output emission, debug logging, the build-time agent /
 * commands-dir defines, and the Bash command matchers. No hook-event logic
 * lives here — each hook event gets its own module
 * (user_prompt_submit / session_start / pre_tool_use / post_tool_use), and
 * `aet_handler.ts` is a thin dispatcher over them. The whole tree still
 * bundles to a SINGLE `aet_handler.js` (CC hooks point at one path).
 */

import spawn from 'cross-spawn';
import { appendFileSync } from 'node:fs';

import type { CommandResult } from '../../../../definitions/events.js';
import type { CcHookEventName, CcHookInput, CcHookOutput } from '../../types.js';
import { DIALECT_ID, resolveDialect } from '../../../dialect.js';

const dialect = resolveDialect(DIALECT_ID);

// ---------------------------------------------------------------------------
// Debug logging
// ---------------------------------------------------------------------------

const DEBUG_LOG = '/tmp/aet-plugin.log';

/**
 * Append a line to the debug log. No-op unless `AET_DEBUG` is set — hooks
 * fire on every user message / tool call, so unconditionally writing would
 * add synchronous disk I/O to the hot path for no benefit.
 */
export function debugLog(fields: Record<string, unknown>): void {
  if (!process.env.AET_DEBUG) return;
  try {
    appendFileSync(DEBUG_LOG, JSON.stringify({ t: new Date().toISOString(), ...fields }) + '\n', 'utf8');
  } catch {
    // Swallow — logging must never break the handler.
  }
}

// ---------------------------------------------------------------------------
// CLI binary resolution
// ---------------------------------------------------------------------------

/** Resolve the AET CLI binary path at call time. Override via AET_BIN env var. */
export function resolveAetBin(): string {
  return process.env.AET_BIN ?? 'aet';
}

// ---------------------------------------------------------------------------
// Agent id + commands dir (build-time define injection)
// ---------------------------------------------------------------------------

/**
 * Agent id passed to `aet plugin init --agent <id>` in SessionStart boot
 * mode. Substituted at BUILD TIME by esbuild `define` (see build.mjs
 * CC_DISTRIBUTIONS → `agentId` column — `claude-code` for the CC
 * distribution, `codeagent3` for the .cac mirror). Each distribution's
 * SessionStart hook then generates slash commands into its OWN host's
 * commands dir, so the two never collide when co-installed.
 *
 * The `typeof` guard is a dev fallback for non-esbuild execution (e.g.
 * ts-node direct run during development). Production builds always inject
 * a concrete string via define, so the fallback branch is dead-coded out
 * by tree-shaking.
 */
declare const __AET_AGENT_ID__: string | undefined;
export const AET_AGENT_ID: string =
  typeof __AET_AGENT_ID__ !== 'undefined' ? __AET_AGENT_ID__ : 'claude-code';

/**
 * Project-relative commands destDir baked at BUILD TIME (mirrors
 * __AET_AGENT_ID__; sourced from build.mjs CC_DISTRIBUTIONS `commandsDir`
 * column). Used ONLY by SessionStart to pre-create the destDir BEFORE
 * spawning `aet plugin init`.
 *
 * Why: hosts like codeagent3 watch the commands folder for changes and
 * auto-reload, but only attach the watcher to a folder that ALREADY exists.
 * If `aet plugin init` is what first creates the dir, it creates the dir +
 * writes the files in quick succession (sub-ms) inside one subprocess — the
 * watcher never attaches in time and misses the file-write events, so no
 * in-session reload. Pre-creating here gives the watcher the whole
 * subprocess-spawn + node-boot + config-load window (hundreds of ms) to
 * attach before the file writes land.
 *
 * This is the DEFAULT destDir. If a user overrides destDir in agents.json
 * (absolute / `~/` path) this baked value won't match — but the generator's
 * own per-file mkdir still guarantees correctness; we just lose the watcher
 * head-start in that edge case.
 */
declare const __AET_COMMANDS_DIR__: string | undefined;
export const AET_COMMANDS_DIR: string =
  typeof __AET_COMMANDS_DIR__ !== 'undefined' ? __AET_COMMANDS_DIR__ : '.claude/commands';

// ---------------------------------------------------------------------------
// Bash command matchers (shared by PreToolUse / PostToolUse + dispatcher)
// ---------------------------------------------------------------------------
//
// Single source of truth lives in src/plugins/shared_hooks.ts — the OpenCode
// plugin reuses the SAME matchers so both hosts classify `aet` Bash commands
// identically. Re-exported here for backward-compat with the CC handler
// modules (which import from './shared.js'). See the shared_hooks file header
// for the rationale behind each pattern.

export { AET_WORKFLOW_RE, AET_PLUGIN_INIT_RE } from '../../../shared_hooks.js';

// ---------------------------------------------------------------------------
// Stdin / subprocess helpers
// ---------------------------------------------------------------------------

export function readStdin(): Promise<CcHookInput | null> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => {
      const trimmed = data.trim();
      if (!trimmed) { resolve(null); return; }
      try {
        resolve(JSON.parse(trimmed) as CcHookInput);
      } catch {
        resolve(null);
      }
    });
    process.stdin.on('error', () => resolve(null));
  });
}

/**
 * Spawn the `aet` CLI with the given args + `--output json`. Returns null
 * on spawn failure or non-JSON output. Caller must include `--output json`
 * in args if needed (we don't auto-append here — PreToolUse rewrites the
 * Bash command itself; active mode passes the flag explicitly).
 */
export function runAet(args: string[], cwd?: string): Promise<CommandResult | null> {
  return new Promise((resolve) => {
    const aetBin = resolveAetBin();
    debugLog({ event: 'runAet', aetBin, args: args.join(' '), cwd: cwd ?? process.cwd() });
    const env = { ...process.env };
    if (cwd) env.AET_PROJECT_ROOT = cwd;
    const child = spawn(aetBin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
      cwd: cwd ?? process.cwd(),
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (c) => { stdout += c.toString(); });
    child.stderr?.on('data', (c) => { stderr += c.toString(); });
    child.on('error', (err) => {
      debugLog({ event: 'runAet', action: 'spawn_error', error: err.message });
      resolve(null);
    });
    child.on('close', (code) => {
      debugLog({ event: 'runAet', action: 'close', exitCode: code, stdoutLen: stdout.length, stderrPreview: stderr.slice(0, 200) });
      if (!stdout.trim()) { resolve(null); return; }
      try {
        resolve(JSON.parse(stdout) as CommandResult);
      } catch {
        debugLog({ event: 'runAet', action: 'parse_failed', stdoutPreview: stdout.slice(0, 200) });
        resolve(null);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Output emission
// ---------------------------------------------------------------------------

export function emit(output: CcHookOutput | null): void {
  const json = JSON.stringify(output ?? {});
  const hso = output?.hookSpecificOutput;
  if (hso && hso.additionalContext !== undefined) {
    // Real injection — log the FULL additionalContext text so the user can
    // see exactly what was injected into Claude's context. NOT truncated.
    debugLog({
      event: 'inject',
      eventName: hso.hookEventName,
      chars: hso.additionalContext.length,
      text: hso.additionalContext,
    });
  } else if (hso && hso.updatedToolOutput?.stdout !== undefined) {
    // PostToolUse stdout replacement — log the FULL replaced stdout text
    // so the user can see exactly what the agent saw in the tool result.
    // NOT truncated.
    debugLog({
      event: 'replace_stdout',
      eventName: hso.hookEventName,
      chars: hso.updatedToolOutput.stdout.length,
      text: hso.updatedToolOutput.stdout,
    });
  } else if (hso && hso.permissionDecision) {
    // PreToolUse allow/deny (typically with rewritten Bash command).
    debugLog({
      event: 'pretool_decision',
      eventName: hso.hookEventName,
      decision: hso.permissionDecision,
      rewrittenCommand: typeof hso.updatedInput?.command === 'string' ? hso.updatedInput.command : undefined,
    });
  } else if (hso && hso.updatedInput?.command !== undefined) {
    // PreToolUse rewrite WITHOUT a permission decision — the command was
    // rewritten (e.g. `--output json` inserted) but the host's NORMAL
    // permission flow applies. This is the chained/piped-command path: we
    // still fix the flag placement but never auto-allow a chain.
    debugLog({
      event: 'pretool_rewrite_no_decision',
      eventName: hso.hookEventName,
      rewrittenCommand: hso.updatedInput.command,
    });
  } else if (hso && hso.reloadSkills === true) {
    // SessionStart: signal CC to re-scan skill/command directories.
    debugLog({ event: 'reload_skills', eventName: hso.hookEventName });
  } else {
    // Empty `{}` — no injection, no decision. Tool call / prompt passes
    // through untouched.
    debugLog({ event: 'emit_noop' });
  }
  process.stdout.write(json + '\n');
}

export function emitError(eventName: CcHookEventName, code: string, message: string): void {
  const output = {
    hookSpecificOutput: {
      // `eventName` is a CANONICAL (claude) name from the handler; translate
      // it into this host's name before emitting.
      hookEventName: dialect.toHostEvent(eventName),
      additionalContext: `[AET ERROR ${code}] ${message}`,
    },
  };
  // Structured error marker — the full injected text is logged by emit()
  // as event='inject' immediately after this line.
  debugLog({ event: 'emitError', code, message });
  emit(output);
}
