/**
 * @file src/plugins/omp/aet_handler.ts
 *
 * omp (Oh My Pi) plugin entry — the factory module pointed at by the built
 * package's `package.json` `omp.extensions` array. This is the port of the
 * Claude Code handler (claude_code/hooks/handlers/aet_handler.ts) and the
 * OpenCode handler (opencode/aet_handler.ts) to the omp HookAPI: ONE module
 * subscribes to every hook omp delivers that we care about.
 *
 * Bundled by scripts/build.mjs to `dist/plugins/omp/bin/aet_handler.js`
 * (ESM, zero external deps) and referenced from the package's
 * `package.json` `omp.extensions` field so omp loads it as a hook extension.
 *
 * Registered hooks (canonical event → omp HookAPI event, per ctx7 omp docs):
 *   1. `tool_call`   (PASSIVE pre)  — PreToolUse: rewrite aet Bash args
 *                                     (--output json / --agent omp)
 *   2. `tool_result` (PASSIVE post) — PostToolUse: replace result content
 *                                     with result.prompt
 *
 * ACTIVE MODE (slash-command interception → workflow init): omp's HookAPI
 * does NOT expose a `command.execute.before` equivalent (per ctx7 docs the
 * hookable events are tool_call / tool_result / message rewrite / compact /
 * session lifecycle). So ACTIVE is carried by the generated `.omp/commands/
 * aet-*.md` markdown command bodies — rendered with `hasPlugin:false` so
 * each carries a `## 启动工作流` section guiding the agent to run
 * `aet workflow init --name <id>` + `aet workflow handover` via bash. The two
 * tool hooks above rewrite those bash calls (append --output json) and
 * inject the result.prompt into the tool result. This is the natural
 * degradation for a host without a command-pre hook, and keeps the AET
 * capability surface intact (init + step-1 task delivery) within omp's
 * actual hook surface.
 *
 * SessionStart boot mode is NOT registered (omp has no SessionStart hook;
 * `aet plugin init` is invoked by the user / a markdown command, and slash
 * command files are generated project-side into `.omp/commands/` by
 * `aet plugin init --agent omp`).
 *
 * The `config`-style skills/commands registration is NOT needed: omp's
 * extension manifest (`package.json omp.extensions`) + the `skills/` and
 * `commands/` directory convention auto-discover shipped content, so the
 * plugin package is self-contained wherever it is installed.
 */

import { handleToolCall } from './hooks/tool_call.js';
import { handleToolResult } from './hooks/tool_result.js';
import type { HookAPI } from './types.js';

/**
 * omp hook extension factory. omp loads this module's default export and
 * invokes it with the HookAPI, which we subscribe to. Per the omp
 * extension-authoring contract, the factory does NOT return a hooks object
 * (unlike OpenCode's Plugin API) — it registers handlers by side effect via
 * `pi.on`.
 */
const aetExtension = (pi: HookAPI): void => {
  pi.on('tool_call', (event) => handleToolCall(event as Parameters<typeof handleToolCall>[0]));
  pi.on('tool_result', (event) => handleToolResult(event as Parameters<typeof handleToolResult>[0]));
};

export default aetExtension;
export { aetExtension };
