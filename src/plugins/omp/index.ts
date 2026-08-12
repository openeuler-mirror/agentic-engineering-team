/**
 * @file src/plugins/omp/index.ts
 *
 * omp plugin barrel — re-exports the extension entry and the helpers
 * consumers/tests import via the package.json `types` surface.
 *
 * The PLUGIN ENTRY lives in `aet_handler.ts` (bundled to
 * `dist/plugins/omp/bin/aet_handler.js`, referenced by the package's
 * `omp.extensions` field). This barrel keeps the import paths working and is
 * the type-checking surface for `./hosts/omp` / `./plugins/omp`.
 *
 * Architecture (新方案.md §1.2 / §3.2) — the plugin:
 *   - subscribes to omp HookAPI events (`tool_call` / `tool_result`),
 *     porting the Claude Code handler's PASSIVE capabilities (the pre/post
 *     tool rewrite + result-replace);
 *   - ACTIVE MODE (slash-command → workflow init) is carried by the
 *     generated `.omp/commands/aet-*.md` markdown command bodies (rendered
 *     with hasPlugin:false), whose `## 启动工作流` section guides the agent
 *     to run `aet workflow init` + `handover` via bash (omp has no
 *     command-pre hook); the two tool hooks rewrite + inject the results;
 *   - injects `--output json` when spawning the CLI (no `--agent` — the CLI
 *     is agent-agnostic; the caller declares its encoding preference);
 *   - JSON output events are translated to omp content/input mutations
 *     (json_to_omp.ts).
 */

export { default, aetExtension } from './aet_handler.js';
export { AET_AGENT_ID, AET_OUTPUT_MODE, AET_PLUGIN_ID } from './constants.js';
export { runAet, runAetSafe } from './cli.js';
export { resultToOmpContent } from './json_to_omp.js';
export { handleToolCall } from './hooks/tool_call.js';
export { handleToolResult } from './hooks/tool_result.js';
export type { HookAPI, HookReturn, ToolCallEvent, ToolResultEvent, MessagePart, OutputEvent, CommandResult } from './types.js';
