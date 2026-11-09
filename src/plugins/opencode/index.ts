/**
 * @file src/plugins/opencode/index.ts
 *
 * OpenCode plugin barrel — re-exports the plugin entry and the helpers
 * consumers/tests import via the package.json `types` surface.
 *
 * The PLUGIN ENTRY lives in `aet_handler.ts` (bundled to
 * `dist/plugins/opencode/bin/aet_handler.js`, referenced by the package's
 * `exports["."]` field so V2 OpenCode loads it as a server part). This
 * barrel keeps the old import paths working and is the type-checking
 * surface for `./hosts/opencode` / `./plugins/opencode`.
 *
 * Architecture (新方案.md §1.2 / §3.2) — the V2 plugin:
 *   - registers V2 hooks via ctx.skill.transform / ctx.command.transform /
 *     ctx.tool.hook("execute.before"|"execute.after") / ctx.session.hook
 *     ("prompt"|"context") / ctx.event.subscribe(), porting the Claude
 *     Code handler's capabilities;
 *   - injects `--output json` when spawning the CLI (no `--agent` — the CLI
 *     is agent-agnostic; the caller declares its encoding preference);
 *   - JSON output events are translated to V2 domain calls (json_to_op.ts).
 */

export { default } from './aet_handler.js';
export { AET_PLUGIN_ID, AET_AGENT_ID } from './constants.js';
export { runAet, runAetSafe } from './cli.js';
export { applyEventsInHook, applyEventsViaClient, applyResult } from './json_to_op.js';
export type { Plugin, PluginContext, PluginCleanup, OpencodeClient, CommandResult, OutputEvent, MessagePart } from './types.js';
