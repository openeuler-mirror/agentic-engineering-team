/**
 * @file src/core/index.ts
 *
 * Layer 4 — Core public surface. Imports of `src/core` should go through
 * this file to avoid reaching into internal modules directly.
 */

export { EventBus, createEventBus } from './event_bus.js';
export type { InputEventHandler } from './event_bus.js';

export { WorkflowEngine } from './workflow_engine.js';
export { ConfigManager, BASELINE_CONFIG } from './config_manager.js';
export type { WorkflowConfig } from './workflow_registry.js';

export { WorkflowRegistry } from './workflow_registry.js';
export type {
  WorkflowDefinition,
  HookPreset,
  StepDefinition,
  StepHook,
  StepHookResolveContext,
} from './workflow_registry.js';
