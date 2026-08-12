/**
 * @file src/plugins/omp/cli.ts
 *
 * Spawns the AET CLI binary (Layer 3) and parses its JSON output.
 *
 * omp's hook model (in-process TS module via HookAPI) does NOT spawn a
 * subprocess per hook fire — hooks run synchronously inside the omp
 * process. But the AET plugin still needs to invoke the AET CLI to run
 * workflow lifecycle commands (command-init / handover), so this module
 * wraps `aet` in a JSON-returning spawn, identical to the opencode
 * plugin's cli.ts. The two copies are intentionally separate (not a
 * shared import) to keep each plugin package self-contained for
 * independent installation into its host's plugin directory.
 *
 * The plugin NEVER calls Core directly — it always goes through the CLI
 * (the one-way dependency direction: plugin → cli → core). This keeps the
 * plugin host-agnostic were we to swap plugin runtimes.
 */

import { spawn } from 'node:child_process';
import { AET_OUTPUT_MODE } from './constants.js';
import type { CommandResult } from './types.js';

/**
 * Resolve the AET CLI binary path at call time (not module-load time).
 *
 * Reads `process.env.AET_BIN` fresh on each call so env updates take
 * effect without a plugin reload. Falls back to 'aet' on PATH.
 */
function resolveAetBin(): string {
  return process.env.AET_BIN ?? 'aet';
}

/**
 * Invoke `aet <args>` with `--output json` injected.
 *
 * The plugin does NOT pass `--agent` — the CLI is agent-agnostic; the
 * plugin declares its encoding preference via `--output` instead.
 *
 * Returns the parsed CommandResult (ok | error). Throws on spawn failure
 * (e.g. `aet` binary not on PATH) or non-JSON stdout (CLI invariant
 * violation — surfaces as INTERNAL error event in Core, but we re-throw
 * here so the calling hook can decide what to do).
 *
 * @param args   positional + flags (e.g. ['workflow', 'init', '--name', 'feature'])
 * @param opts   optional overrides (env, cwd)
 */
export function runAet(
  args: string[],
  opts: { env?: NodeJS.ProcessEnv; cwd?: string } = {},
): Promise<CommandResult> {
  const aetBin = resolveAetBin();
  const fullArgs = [
    ...args,
    '--output', AET_OUTPUT_MODE,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(aetBin, fullArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: opts.env ?? process.env,
      cwd: opts.cwd ?? process.cwd(),
    });

    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });

    child.on('error', (err) => {
      reject(new Error(
        `aet: failed to spawn '${aetBin}' — ${err.message}. ` +
        `Is the AET CLI installed and on PATH? (Override via AET_BIN env var.)`,
      ));
    });

    child.on('close', (code) => {
      // CLI exits 0 on success, non-zero on error. In BOTH cases stdout
      // contains a JSON CommandResult (per src/cli/index.ts). We parse it
      // and return. Non-zero exit + no stdout = unrecoverable.
      if (!stdout.trim()) {
        reject(new Error(
          `aet: empty stdout (exit ${code})${stderr ? `\nstderr: ${stderr.trim()}` : ''}`,
        ));
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as CommandResult;
        resolve(parsed);
      } catch (err) {
        reject(new Error(
          `aet: non-JSON stdout (exit ${code}): ${(err as Error).message}\n` +
          `stdout (first 500 chars): ${stdout.slice(0, 500)}`,
        ));
      }
    });
  });
}

/**
 * Convenience: runAet but never rejects — converts rejection into a
 * synthetic CommandResult with an error event (per R9: errors are NEVER
 * silenced in any mode).
 *
 * Use this in hook contexts where throwing would crash the host agent.
 */
export async function runAetSafe(
  args: string[],
  opts: { env?: NodeJS.ProcessEnv; cwd?: string } = {},
): Promise<CommandResult> {
  try {
    return await runAet(args, opts);
  } catch (err) {
    return {
      ok: false,
      error: {
        code: 'PLUGIN_SPAWN_FAILED',
        message: (err as Error).message,
      },
    };
  }
}
