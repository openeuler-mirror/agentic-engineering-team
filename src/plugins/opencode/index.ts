/**
 * @file src/plugins/opencode/index.ts
 *
 * OpenCode plugin barrel — re-exports the plugin entry and the helpers
 * consumers/tests import via the package.json `types` surface.
 *
 * The PLUGIN ENTRY lives in `aet_handler.ts` (bundled to
 * `dist/plugins/opencode/bin/aet_handler.js`, referenced by the package's
 * `main` field). This barrel keeps the old import paths working and is the
 * type-checking surface for `./hosts/opencode` / `./plugins/opencode`.
 *
 * Architecture (新方案.md §1.2 / §3.2) — the plugin:
 *   - registers OpenCode Plugin API hooks (config / command.execute.before /
 *     tool.execute.before / tool.execute.after / event / legacy system
 *     transform), porting the Claude Code handler's capabilities;
 *   - injects `--output json` when spawning the CLI (no `--agent` — the CLI
 *     is agent-agnostic; the caller declares its encoding preference);
 *   - JSON output events are translated to OpenCode Plugin API calls
 *     (json_to_op.ts).
 */

export { default, aetPlugin } from './aet_handler.js';
export { AET_PLUGIN_ID, AET_AGENT_ID } from './constants.js';
export { runAet, runAetSafe } from './cli.js';
export { applyEventsInHook, applyEventsViaClient, applyResult } from './json_to_op.js';
export type { Plugin, PluginContext, OpencodeClient, CommandResult, OutputEvent, MessagePart } from './types.js';
