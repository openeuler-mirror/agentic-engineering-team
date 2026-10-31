/**
 * @file src/plugins/opencode/aet_handler.ts
 *
 * OpenCode plugin entry — `bin/aet_handler.js` in the built package. This
 * is the V2 port of the Claude Code handler to the OpenCode Plugin API
 * (Plugin.define form): ONE `setup(ctx)` registers every hook via the V2
 * domain methods (ctx.skill.transform / ctx.command.transform /
 * ctx.tool.hook / ctx.session.hook / ctx.event.subscribe), mirroring how
 * the CC handler dispatches all events from one file.
 *
 * Bundled by scripts/build.mjs to `dist/plugins/opencode/bin/aet_handler.js`
 * (ESM, zero external deps) and referenced from the package's `package.json`
 * `exports["."]` field so OpenCode V2 loads it as a server part. The
 * `config` registration resolves `skills/` + `commands/` relative to THIS
 * file at runtime, so the plugin package is self-contained wherever it is
 * installed.
 *
 * Registered V2 hooks (claude event → V2 domain method, per 新方案.md §2.3
 * + D-007 / D-004):
 *   1. ctx.skill.transform + ctx.command.transform  — register skills/commands
 *   2. ctx.session.hook("prompt")         (ACTIVE)   — UserPromptSubmit: slash → command-init
 *   3. ctx.tool.hook("execute.before")    (PASSIVE pre)  — PreToolUse: rewrite aet Bash args
 *   4. ctx.tool.hook("execute.after")     (PASSIVE post) — PostToolUse: replace result with prompt
 *   5. ctx.event.subscribe()              (passive)      — session.status observer (ca.stop guard)
 *   6. ctx.session.hook("context")        (legacy stub, co-deployment)
 *
 * SessionStart boot mode stays DISABLED (as in the CC handler) — AET entry
 * COMMANDS (/aet-<id>) are registered via ctx.command.transform, and the
 * session "prompt" hook routes them through `aet workflow command-init`.
 */

import type { Plugin as PluginNS } from '@opencode/plugin';
import { AET_PLUGIN_ID } from './constants.js';
import { registerConfigHook } from './hooks/config.js';
import { registerCommandBeforeHook } from './hooks/command_before.js';
import { registerToolBeforeHook } from './hooks/tool_before.js';
import { registerToolAfterHook } from './hooks/tool_after.js';
import { registerSessionStatusHook } from './hooks/session_status.js';
import { registerSystemTransformHook } from './hooks/system_transform.js';
import type { PluginContext } from './types.js';

/**
 * V2 `Plugin.define` — identity at runtime (`plugin => plugin`).
 *
 * `@opencode/plugin`'s real `Plugin.define` is `(plugin) => plugin` (verified
 * in node_modules/@opencode/plugin/dist/promise/plugin.js). We inline the
 * identity locally and import the TYPE only (`import type` — stripped by
 * esbuild) so the zero-runtime-dependency invariant holds (findExternalDeps
 * in build.mjs would flag a runtime `import { Plugin } from '@opencode/plugin'`
 * because @opencode/plugin transitively imports `effect/*`). The host
 * provides `@opencode/plugin` at runtime; the bundle is self-contained.
 */
const Plugin = {
  define<P extends PluginNS.Plugin>(plugin: P): P {
    return plugin;
  },
};

/**
 * V2 plugin entry — `Plugin.define({ id, setup })`.
 *
 * Per the V2 OpenCode Plugin API: setup(ctx) registers hooks imperatively
 * (each `ctx.<domain>.hook|transform` returns `Promise<Registration>` which
 * must be awaited) and returns an optional cleanup function invoked on
 * plugin unload. Cleanup aborts the session_status subscriber so the host
 * doesn't keep an dangling async iterator.
 */
export default Plugin.define({
  id: AET_PLUGIN_ID,
  async setup(ctx: PluginContext): Promise<void> {
    // Each register* helper awaits its own V2 registration. Order matters
    // only for config (skills/commands must exist before prompts fire).
    const cleanups: Array<() => Promise<void> | void> = [];

    await registerConfigHook(ctx);
    await registerCommandBeforeHook(ctx);
    await registerToolBeforeHook(ctx);
    await registerToolAfterHook(ctx);
    await registerSessionStatusHook(ctx, (fn) => cleanups.push(fn));
    await registerSystemTransformHook(ctx);

    // Announce plugin presence. V2 ctx.app has no log() (D-009) — console
    // with [AET] prefix is the canonical host-visible channel.
    console.log(`[${AET_PLUGIN_ID}] opencode plugin loaded — workflow commands intercepted, aet Bash args rewritten, skills/commands registered`);

    // Return cleanup registration — called by the host on plugin unload.
    // session_status hooks an AbortController; the rest are stateless.
    return () => {
      for (const fn of cleanups) {
        try { fn(); } catch { /* best-effort — never fail unload */ }
      }
    };
  },
});
