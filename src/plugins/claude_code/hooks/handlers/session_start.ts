/**
 * @file src/plugins/claude_code/hooks/handlers/session_start.ts
 *
 * SessionStart hook — ensure the GLOBAL commands folder exists.
 *
 * At every session start, create the host's global slash-command directory
 * (`~/.claude/commands` for claude-code, `~/.cac/commands` for codeagent3)
 * if it is missing. Hosts only discover global commands from a folder that
 * already exists, so `aet plugin init -g` (global install) needs this dir
 * present before it writes files into it.
 *
 * Purely a mkdir — nothing else. No CLI spawn, no `aet plugin init`, no
 * reloadSkills signal. Best-effort: a failure to create the dir must never
 * fail the hook, so errors are logged (AET_DEBUG) and swallowed.
 */

import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { CcHookInput } from '../../types.js';
import { AET_COMMANDS_DIR, debugLog } from './shared.js';

export function handleSessionStart(_input: CcHookInput): void {
  // AET_COMMANDS_DIR is baked at build time to this host's commands-relative
  // path (build.mjs CC_DISTRIBUTIONS → `.claude/commands` for claude-code,
  // `.cac/commands` for codeagent3). Resolving it against the home dir yields
  // the global slash-command folder.
  const globalCommandsDir = join(homedir(), AET_COMMANDS_DIR);
  try {
    mkdirSync(globalCommandsDir, { recursive: true });
    debugLog({
      event: 'SessionStart',
      action: 'ensure_global_commands_dir',
      path: globalCommandsDir,
    });
  } catch (err) {
    // Best-effort only — never fail the hook on a mkdir error.
    debugLog({
      event: 'SessionStart',
      action: 'ensure_global_commands_dir_failed',
      error: (err as Error).message,
    });
  }
}