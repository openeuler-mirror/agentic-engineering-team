/**
 * @file src/plugins/opencode/constants.ts
 *
 * OpenCode plugin (op_plugin) tunable constants per 新方案.md §1.2 / §2.3.
 *
 * The plugin's only runtime touchpoint with the AET Core is the `aet` CLI
 * binary (Layer 3). All host API calls go through OpenCode's Plugin API
 * (ctx.client / output mutation).
 *
 * The CLI binary is resolved at call time (see cli.ts `resolveAetBin`) so
 * env overrides (AET_BIN) take effect per spawn.
 */

/**
 * Output mode used for CLI calls invoked from hooks.
 *
 * The plugin always uses JSON mode (not Prompt) because OpenCode's Plugin
 * API can consume structured events directly (新方案.md §1.2: "JSON 模式：
 * 结构化事件，由插件消费后再作用于 agent"). Prompt mode is reserved for
 * fallback agents without hook support.
 *
 * The plugin injects `--output json` into every CLI spawn — it does NOT
 * inject `--agent` (the CLI is agent-agnostic; the caller declares its
 * encoding preference via `--output` alone).
 */
export const AET_OUTPUT_MODE = 'json' as const;

/** Plugin ID reported to OpenCode. */
export const AET_PLUGIN_ID = 'aet';

/**
 * Agent id passed to `aet plugin init --agent <id>` when the plugin rewrites
 * a Bash `aet plugin init` call (see hooks/tool_before.ts). Mirrors the
 * build-time `__AET_AGENT_ID__` define the Claude Code handler bakes per
 * distribution; OpenCode is a single target so a plain constant suffices.
 */
export const AET_AGENT_ID = 'opencode';
