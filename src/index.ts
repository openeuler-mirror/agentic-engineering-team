/**
 * @file src/index.ts
 *
 * Top-level public surface of the AET core framework.
 *
 * Consumers (CLI, plugins, tests) should import from this entry rather than
 * reaching into specific sub-directories — keeps the dependency graph
 * stable when internal layout changes.
 */

// Layer 2: definitions (event contracts — agent-agnostic).
export * from './definitions/events.js';
// Layer 2: plugins (agent metadata + adapter contracts).
export * from './plugins/agent_meta.js';

// Layer 4: Core (EventBus + WorkflowEngine + ConfigManager + WorkflowRegistry).
export * from './core/index.js';

// Layer 3: CLI (runCli + args + encoders + commands).
export { runCli } from './cli/index.js';
export type { CliRunOptions } from './cli/index.js';
export { parseArgs, requireFlag, optionalFlag, UsageError } from './cli/args.js';
export type { ParsedArgs } from './cli/args.js';
export { encodeJson } from './cli/encoder/json_encoder.js';
export { encodePrompt } from './cli/encoder/prompt_encoder.js';
export { workflowInitSpec } from './cli/commands/workflow/init.js';
export { workflowHandoverSpec } from './cli/commands/workflow/handover.js';
export type { CommandSpec, CommandOutput } from './cli/commands/base.js';
