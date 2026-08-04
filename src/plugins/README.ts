/**
 * @file src/plugins/README.ts
 *
 * Layer 2 — Plugins registry. Each coding agent has its own in-process
 * plugin (`opencode/`, `claude_code/`, `fallback/`) per 新方案.md §2.3.
 *
 * Plugins intercept host hooks, inject `--output json` into CLI calls,
 * and translate the JSON output events back into host-specific API calls
 * (e.g. OpenCode's `pluginClient.session.create`).
 *
 * Capability matrix (per 新方案.md §4.2 R8):
 *   - opencode     : full Plugin API, in-process TS module, JSON mode
 *   - claude-code  : CC Hooks config + shell handler, JSON mode
 *   - (no-plugin hosts degrade to bash + Prompt mode — see agent_meta.ts)
 *
 * Build: scripts/build.mjs bundles each in-process plugin entry to
 * `dist/plugins/<host>/aet.js`. Static artifacts (settings.json,
 * commands/*.md) are copied as-is.
 */

export type PluginHost = 'opencode' | 'claude-code' | 'omp';

export interface PluginManifest {
  host: PluginHost;
  /** Path to the plugin entry (TS source), relative to repo root. */
  entry: string;
  /** Path to the bundled output (JS), relative to dist/. */
  dist?: string;
  /** Whether the plugin runs in-process or via bash. */
  kind: 'in-process' | 'bash-prompt';
  /** Capability level per R8 — most, some, or no host API surface. */
  capabilityLevel: 'full' | 'partial' | 'none';
}

/**
 * Plugin manifests. Each entry corresponds to a directory under src/plugins/.
 */
export const PLUGINS: PluginManifest[] = [
  {
    host: 'opencode',
    entry: 'src/plugins/opencode/aet_handler.ts',
    dist: 'dist/plugins/opencode/bin/aet_handler.js',
    kind: 'in-process',
    capabilityLevel: 'full',
  },
  {
    host: 'claude-code',
    entry: 'src/plugins/claude_code/index.ts',
    dist: 'dist/plugins/claude_code/handlers/aet_handler.js',
    kind: 'in-process',
    capabilityLevel: 'partial',
  },
  {
    host: 'omp',
    entry: 'src/plugins/omp/aet_handler.ts',
    dist: 'dist/plugins/omp/bin/aet_handler.js',
    kind: 'in-process',
    capabilityLevel: 'partial',
  },
];

/** Convenience: look up a manifest by host name. */
export function getPluginManifest(host: PluginHost): PluginManifest | undefined {
  return PLUGINS.find((p) => p.host === host);
}

/**
 * User-facing note shown when listing plugins via CLI (future).
 */
export const PLUGINS_NOTE = `AET plugins (Layer 2):

  opencode     in-process plugin — full Plugin API
                 hooks: config (skills/commands), command.execute.before (active),
                        tool.execute.before/after (passive), event,
                        experimental.chat.system.transform
                 build: dist/plugins/opencode/ (self-contained package,
                        package.json main → bin/aet_handler.js)
                 install: plugin: ["<abs-path>/dist/plugins/opencode"] in opencode.json,
                          or cp -r dist/plugins/opencode ~/.config/opencode/plugin/aet

  claude-code  CC Hooks config + shell handler — partial capability
                 hooks: UserPromptSubmit, PreToolUse, PostToolUse, SessionStart
                 build: dist/plugins/claude_code/handlers/aet_handler.js
                 install: merge hooks/settings.json → ~/.claude/settings.json

  omp          in-process TS hook extension (HookAPI pi.on) — partial capability
                 hooks: tool_call (pre, rewrite aet Bash), tool_result (post,
                        replace result with result.prompt)
                 build: dist/plugins/omp/ (self-contained package,
                        package.json omp.extensions → bin/aet_handler.js, plus a
                        generated .claude-plugin/marketplace.json catalog)
                 install: omp marketplace add ./dist/plugins/omp
                          omp install aet@aet
                 ACTIVE MODE: no command.execute.before in omp's HookAPI →
                        carried by generated .omp/commands/aet-*.md bodies
                        (hasPlugin:false) whose \`## 启动工作流\` section
                        guides the agent to run \`aet workflow init\` +
                        \`handover\` via bash; the two tool hooks rewrite
                        those bash calls + inject the result prompt.

See 新方案.md §2.3 (Development View) and §5 (落地路线) for details.`;
