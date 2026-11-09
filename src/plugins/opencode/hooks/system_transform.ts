/**
 * @file src/plugins/opencode/hooks/system_transform.ts
 *
 * V2 Passive hook: `ctx.session.hook("context", ...)` stub
 * (新方案.md §3.2 row "prompt.inject_system").
 *
 * Per ctx7 CONTEXT.md: the legacy V1 system-transform hook (arbitrary
 * mutation of the assembled baseline system prompt) is replaced in V2 by
 * `ctx.session.hook("context", event => { event.system.push(...) })`,
 * where `event.system` is a mutable `Array<SystemPart>`.
 *
 * Co-deployment: in the deployable target (dist/plugins/opencode/), a
 * separate plugin part handles `project-analysis` / `automation` system
 * injection by reading `.aet/project-analysis/` and pushing the content as
 * a SystemPart. The src scaffolding here is a STUB — it only logs that the
 * hook fired, so plugin authors can see the wiring. The deployable part
 * overrides this with the real injection logic.
 *
 * Future: when Core exposes a `project.analysis.inject` input event, this
 * hook will fetch from Core via `aet project analysis` (future CLI) and
 * apply the returned prompt.inject_system event by pushing a SystemPart
 * onto `event.system`.
 */

import { AET_PLUGIN_ID } from '../constants.js';
import type { PluginContext } from '../types.js';

/**
 * V2 `ctx.session.hook("context", ...)` registration — stub.
 *
 * Co-deployment note (above): the deployable plugin part handles the real
 * project-analysis / automation system injection. This src scaffolding only
 * logs that the hook fired. Returns `Promise<void>` — V2 setup registers
 * imperatively.
 */
export async function registerSystemTransformHook(ctx: PluginContext): Promise<void> {
  await ctx.session.hook('context', async (event) => {
    if (!event?.system) {
      console.warn(`[${AET_PLUGIN_ID}] session.hook("context"): malformed event (no system array); skipping`);
      return;
    }

    // Future: call `aet project analysis` (not yet implemented in Core) and
    // push the returned prompt.inject_system text as a SystemPart:
    //   event.system.push({ type: 'text', text: projectAnalysisText })
    // For now, this hook is a no-op stub — it just records that the hook
    // fired so plugin authors can see the wiring. The deployable plugin
    // part overrides this with the real injection logic (co-deployment).
    console.debug(`[${AET_PLUGIN_ID}] session.hook("context") fired; no-op (project-analysis injection deferred to deployable part)`);
  });
}
