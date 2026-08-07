/**
 * @file src/plugins/claude_code/index.ts
 *
 * Claude Code plugin (cc_plugin) entry — Layer 2 implementation per
 * 新方案.md §2.3.
 *
 * Unlike the OpenCode plugin (which is an in-process TS module that
 * registers hooks directly), the Claude Code plugin is shipped as:
 *   - A static `hooks/settings.json` snippet (merged into ~/.claude/settings.json)
 *   - A standalone JS handler script (invoked by CC as a shell command)
 *   - Slash command definitions (~/.claude/commands/*.md)
 *
 * So this index.ts file does NOT export a runtime entry — it exports a
 * `CcPluginManifest` describing how to install the plugin, plus the
 * JSON-to-CC translator for reuse/testing.
 *
 * Dual-channel design (AGENTS.md "Output 信封"):
 *   - `CommandResult.prompt`    → agent-visible text. Injected as additionalContext.
 *   - `CommandResult.events[]`  → plugin-only signals (omit_prompt, interrupt_execution,
 *                                  prompt.inject, prompt.inject_system, context.clear, error).
 *   - `CommandResult.data`      → lifecycle metadata (status, workflow, currentStep, nextStep, checkpointId).
 *
 * Capability matrix (per R8, with the b3 dual-channel design applied):
 *   - prompt.inject:        supported (additionalContext)
 *   - prompt.inject_system: degraded (no system-prompt mutation; surfaces as `[AET system note] ...`)
 *   - context.clear:        degraded (no session.create in CC; b3 design rarely emits this — workflow-complete
 *                            uses data.status='workflow_complete' instead)
 *   - omit_prompt:          degraded (CC has no "suppress CLI return" — we can hide stdout via
 *                            updatedToolOutput, but can't truly silence; emit `{}` and let raw stdout pass)
 *   - interrupt_execution:  degraded (CC has no native halt-turn API; degrade to additionalContext warning)
 *   - error:                supported (always visible, R9)
 */

import type { CcPluginManifest } from './types.js';

/** The canonical plugin manifest. Used by install scripts and tooling. */
export const CC_PLUGIN_MANIFEST: CcPluginManifest = {
  id: 'aet-cc',
  name: 'AET Claude Code Plugin',
  settings: {
    // This shape matches what users merge into ~/.claude/settings.json.
    // The actual JSON file lives at hooks/settings.json.
    hooks: {
      UserPromptSubmit: [
        {
          matcher: '',
          hooks: [
            {
              type: 'command',
              command: 'node "$CLAUDE_PROJECT_DIR/node_modules/@aet/workflow-core/dist/plugins/claude_code/handlers/aet_handler.js"',
            },
          ],
        },
      ],
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [
            {
              type: 'command',
              command: 'node "$CLAUDE_PROJECT_DIR/node_modules/@aet/workflow-core/dist/plugins/claude_code/handlers/aet_handler.js"',
            },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: 'Bash',
          hooks: [
            {
              type: 'command',
              command: 'node "$CLAUDE_PROJECT_DIR/node_modules/@aet/workflow-core/dist/plugins/claude_code/handlers/aet_handler.js"',
            },
          ],
        },
      ],
      Stop: [
        {
          matcher: '',
          hooks: [
            {
              type: 'command',
              command: 'node "$CLAUDE_PROJECT_DIR/node_modules/@aet/workflow-core/dist/plugins/claude_code/handlers/aet_handler.js"',
            },
          ],
        },
      ],
    },
  },
  commands: [],
  handlers: [
    {
      src: 'src/plugins/claude_code/hooks/handlers/aet_handler.ts',
      dest: 'dist/plugins/claude_code/handlers/aet_handler.js',
    },
  ],
  capabilities: {
    'prompt.inject': 'supported',
    'prompt.inject_system': 'degraded',
    'context.clear': 'degraded',
    'omit_prompt': 'degraded',
    'interrupt_execution': 'degraded',
    'error': 'supported',
  },
};

export { resultToCcOutput, resultToCcPostToolOutput } from './json_to_cc.js';
export type { CcHookInput, CcHookOutput, CcHookEventName, CcPluginManifest } from './types.js';
// Core contract types re-exported from definitions (not mirrored locally) —
// see types.ts header.
export type { CommandData, CommandResult, OutputEvent } from '../../definitions/events.js';
