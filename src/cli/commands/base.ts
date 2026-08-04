/**
 * @file src/cli/commands/base.ts
 *
 * Layer 3 — shared CommandSpec contract + result-encoding helpers.
 *
 * The command registry type and the small helpers every command uses to
 * encode its result live here so no single command group (`workflow` /
 * `plugin` / `context`) owns cross-cutting infrastructure. Imported by
 * `cli/index.ts` and by all command files in the three group folders.
 *
 * The three groups consume this as follows:
 *   - `workflow/*`     — lifecycle commands (init / handover / continue /
 *                        status / abort / command-init) via the EventBus
 *   - `plugin/init`    — file-generation utility (no EventBus dispatch)
 *   - `context/run`    — `aet context` dispatcher (no EventBus dispatch;
 *                        the `bus` param is unused there)
 */

import type { EventBus } from '../../core/event_bus.js';
import type { OutputMode } from '../../definitions/events.js';
import type { CommandResult } from '../../definitions/events.js';
import { err } from '../../definitions/events.js';

import { encodeJson } from '../encoder/json_encoder.js';
import { encodePrompt } from '../encoder/prompt_encoder.js';

// ---------------------------------------------------------------------------
// Command spec (consumed by cli/index.ts)
// ---------------------------------------------------------------------------

export interface CommandSpec {
  readonly id: string;
  readonly description: string;
  /**
   * Optional display name used in `aet --help`. When omitted, defaults
   * to `id.replace('.', ' ')` (e.g. `workflow.init` → `workflow init`).
   * Use this when the help convention differs from the routing id —
   * e.g. the `context` dispatcher's id is bare `context` but the help
   * shows `context [plugin...]` to convey the calling convention.
   */
  readonly helpName?: string;
  /**
   * Visibility controls whether the spec appears in `aet --help`.
   *
   * - `'public'` (default): listed in --help, callable by anyone (agent
   *   or human). All agent-facing commands.
   * - `'internal'`: callable but hidden from --help. Plugin-only plumbing
   *   that would confuse agents if surfaced (e.g. `command-init` collapses
   *   init+handover into one dispatch — agents should call them
   *   separately to keep branch semantics clear; plugins may collapse).
   *
   * Mirrors git's plumbing-vs-porcelain split: internal commands are
   * documented in AGENTS.md § "Plugin-only 命令（internal）" for plugin
   * developers; `aet --help` stays focused on the agent surface.
   */
  readonly visibility?: 'public' | 'internal';
  readonly run: (bus: EventBus, argv: string[]) => Promise<CommandOutput>;
}

export interface CommandOutput {
  /** The text written to stdout (already encoded per the requested output mode). */
  stdout: string;
  /** Exit code (0 on success, non-zero on error). */
  exitCode: number;
}

// ---------------------------------------------------------------------------
// Shared helpers (used by every command group)
// ---------------------------------------------------------------------------

/** Build a CommandOutput carrying an encoded error envelope (exit 1). */
export function cliError(message: string, code: string): CommandOutput {
  return {
    stdout: encodeJson(err(code, message)),
    exitCode: 1,
  };
}

/** Encode a CommandResult per the requested output mode. */
export function encodeResult(result: CommandResult, output: OutputMode): CommandOutput {
  if (output === 'prompt') {
    return { stdout: encodePrompt(result), exitCode: result.ok ? 0 : 1 };
  }
  return { stdout: encodeJson(result), exitCode: result.ok ? 0 : 1 };
}
