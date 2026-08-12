/**
 * @file src/plugins/omp/constants.ts
 *
 * omp plugin tunable constants. Mirrors the opencode plugin's constants.ts
 * — omp is an in-process TS-module host (HookAPI `pi.on`), so it uses the
 * same JSON-output-mode convention as the other in-process hosts.
 *
 * The plugin's only runtime touchpoint with the AET Core is the `aet` CLI
 * binary (Layer 3). All host API calls go through omp's HookAPI
 * (tool_call input rewrite / tool_result content replacement).
 *
 * The CLI binary is resolved at call time (see cli.ts `resolveAetBin`) so
 * env overrides (AET_BIN) take effect per spawn.
 */

/**
 * Output mode used for CLI calls invoked from hooks.
 *
 * The plugin always uses JSON mode (not Prompt) because omp's in-process
 * hook API can consume structured events directly and rewrite tool
 * input/result in place (same rationale as the opencode plugin). Prompt
 * mode is reserved for fallback agents without hook support.
 *
 * The plugin injects `--output json` into every CLI spawn — it does NOT
 * inject `--agent` (the CLI is agent-agnostic; the caller declares its
 * encoding preference via `--output` alone).
 */
export const AET_OUTPUT_MODE = 'json' as const;

/**
 * Agent id passed to `aet plugin init --agent <id>` when the plugin rewrites
 * a Bash `aet plugin init` call (see hooks/tool_call.ts). Mirrors the
 * build-time `__AET_AGENT_ID__` define the Claude Code handler bakes per
 * distribution; omp is a single target so a plain constant suffices.
 *
 * This MUST match the `omp` host id in `src/plugins/hosts.json` so the
 * generated slash-command files land in `.omp/commands/` (the omp project
 * commands dir).
 */
export const AET_AGENT_ID = 'omp';

/** Plugin/extension id reported to omp. */
export const AET_PLUGIN_ID = 'aet';
