/**
 * @file src/plugins/claude_code/hooks/handlers/session_start.ts
 *
 * ACTIVE MODE (boot) — SessionStart hook. Auto-run `aet plugin init` at
 * session start so freshly-configured workflows get slash commands generated
 * before the user can type them. Idempotent — re-running regenerates the
 * same files and prunes stale `aet-*` entries, so re-running every session
 * is safe. On success the handler emits `hookSpecificOutput.reloadSkills:
 * true` so CC re-scans its skill/command directories and picks up the
 * freshly generated `aet-*` files in THIS session (CC normally does
 * discovery before SessionStart hooks complete, so without this signal the
 * new commands would only be available next session); on failure a single
 * `[AET ERROR ...]` line is injected so the user notices.
 *
 * NOTE: currently DISABLED — the dispatcher in aet_handler.ts does not wire
 * this up (BOOT MODE is off; the SessionStart hook still fires via
 * hooks/settings.json but the handler no-ops). Enable by importing
 * `handleSessionStart` and calling it in the dispatcher's SessionStart case.
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import type { CcHookInput } from '../../types.js';
import { DIALECT_ID, resolveDialect } from '../../../dialect.js';
import { AET_AGENT_ID, AET_COMMANDS_DIR, debugLog, emit, emitError, resolveAetBin, runAet } from './shared.js';

const dialect = resolveDialect(DIALECT_ID);

export async function handleSessionStart(input: CcHookInput): Promise<void> {
  // Pre-create the commands destDir BEFORE spawning `aet plugin init`.
  // Hosts like codeagent3 watch the commands folder for changes and
  // auto-reload, but only attach the watcher to a folder that already
  // exists. If `aet plugin init` is what first creates the dir, it
  // creates the dir + writes the files in quick succession (sub-ms) inside
  // one subprocess — the watcher never attaches in time and misses the
  // file writes, so no in-session reload. Pre-creating here gives the
  // watcher the whole subprocess-spawn + node-boot + config-load window
  // (hundreds of ms) to attach before the file writes land.
  const projectRoot = input.cwd ?? process.cwd();
  const commandsDirAbs = join(projectRoot, AET_COMMANDS_DIR);
  try {
    mkdirSync(commandsDirAbs, { recursive: true });
    debugLog({ event: 'SessionStart', action: 'precreate_commands_dir', path: commandsDirAbs });
  } catch (err) {
    // Best-effort only — the generator inside `aet plugin init` does its
    // own per-file mkdir, so correctness doesn't depend on this. This
    // pre-create is purely a watcher head-start; never fail the hook here.
    debugLog({ event: 'SessionStart', action: 'precreate_commands_dir_failed', error: (err as Error).message });
  }

  const result = await runAet(
    ['plugin', 'init', '--agent', AET_AGENT_ID, '--output', 'json'],
    input.cwd,
  );

  if (result === null) {
    debugLog({ event: 'SessionStart', action: 'plugin_init_spawn_failed' });
    emitError('SessionStart', 'PLUGIN_INIT_FAILED',
      `aet: failed to spawn '${resolveAetBin()}' or parse output for: plugin init --agent ${AET_AGENT_ID}`);
    return;
  }

  if (!result.ok) {
    debugLog({ event: 'SessionStart', action: 'plugin_init_failed', code: result.error?.code, message: result.error?.message?.slice(0, 200) });
    emitError('SessionStart', 'PLUGIN_INIT_FAILED',
      result.error?.message ?? 'plugin init failed');
    return;
  }

  debugLog({ event: 'SessionStart', action: 'plugin_init_ok', prompt: result.prompt?.slice(0, 200) });
  // Signal CC to re-scan skill/command directories so freshly generated
  // `aet-*` files are usable in this session (not the next).
  emit({ hookSpecificOutput: { hookEventName: dialect.toHostEvent('SessionStart'), reloadSkills: true } });
}
