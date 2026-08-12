/**
 * @file src/plugins/opencode/hooks/system_transform.ts
 *
 * Passive hook: `experimental.chat.system.transform` (新方案.md §3.2 row
 * "prompt.inject_system", and legacy `experimental.chat.system.transform`
 * from ctx7 docs).
 *
 * Per ctx7 CONTEXT.md: "The legacy `experimental.chat.system.transform`
 * feature enables arbitrary mutation of the assembled baseline system
 * prompt. However, V2 plugins currently do not expose an equivalent
 * hook, necessitating a decision on whether to port this functionality,
 * replace its dynamic uses with plugin-defined Context Sources, or narrow
 * its semantics."
 *
 * In the minimum iteration, this hook is a STUB. When the host fires the
 * legacy `experimental.chat.system.transform` hook (V1 plugins), we:
 *   1. Read `.aet/project-analysis/` (if present) — this is the legacy
 *      "project analysis" persistence directory.
 *   2. Push the project-analysis content into output.system.
 *
 * On V2 OpenCode (where the hook doesn't exist), the plugin simply doesn't
 * register this hook — no error.
 *
 * Future: when Core exposes a `project.analysis.inject` input event,
 * this hook will fetch from Core via `aet project analysis` (future CLI)
 * and apply the returned prompt.inject_system event.
 */

import { AET_PLUGIN_ID } from '../constants.js';
import type { PluginContext } from '../types.js';

/** Hook signature for the legacy system transform hook. */
interface SystemTransformOutput {
  system: string[];
  [key: string]: unknown;
}

/**
 * Build the `experimental.chat.system.transform` hook handler. Returns the
 * handler so the plugin entry can return its hooks object (the OpenCode
 * Plugin API contract). On V2 OpenCode (where the hook doesn't exist), the
 * plugin simply doesn't return it — no error.
 */
export function registerSystemTransformHook(ctx: PluginContext): (input: unknown, output: unknown) => Promise<void> {
  return async (_rawInput: unknown, rawOutput: unknown): Promise<void> => {
    const output = rawOutput as SystemTransformOutput;
    if (!output?.system) {
      await ctx.client.app.log({
        body: {
          service: AET_PLUGIN_ID,
          level: 'warn',
          message: 'experimental.chat.system.transform: malformed output; skipping',
        },
      });
      return;
    }

    // Future: call `aet project analysis` (not yet implemented in Core).
    // For now, this hook is a no-op stub — it just records that the hook
    // fired so plugin authors can see the wiring.
    await ctx.client.app.log({
      body: {
        service: AET_PLUGIN_ID,
        level: 'debug',
        message: 'experimental.chat.system.transform fired; no-op (project-analysis injection deferred)',
      },
    });
  };
}
