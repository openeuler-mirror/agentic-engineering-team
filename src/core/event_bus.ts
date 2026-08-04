/**
 * @file src/core/event_bus.ts
 *
 * Layer 4 — EventBus (调度中枢).
 *
 * The single CLI ↔ Core channel (新方案.md §2.1). Plugins never call into
 * WorkflowEngine directly; they go through the CLI, which calls
 * `EventBus.dispatch(InputEvent)` and returns the resulting `CommandResult`.
 *
 * Design:
 *   - The bus is a registry of `(InputEventId) → Handler`.
 *   - A handler is a pure-ish async function: `InputEvent → CommandResult`.
 *     The engine is stateless; persistent state lives in the caller.
 *   - Unknown / not-yet-registered events yield an `error` event with code
 *     `NOT_IMPLEMENTED` — never throws, never silently swallows. This is the
 *     "降级一致" principle (新方案.md §1.3).
 *
 * This iteration registers seven handlers:
 *   - `workflow.init`        → WorkflowEngine.handleInit
 *   - `workflow.handover`   → WorkflowEngine.handleHandover
 *   - `workflow.continue`   → WorkflowEngine.handleContinue
 *   - `workflow.commandInit`→ WorkflowEngine.handleCommandInit
 *   - `workflow.status`     → WorkflowEngine.handleStatus
 *   - `workflow.abort`      → WorkflowEngine.handleAbort
 *   - `workflow.list`       → WorkflowEngine.handleList
 */

import type { CommandResult, InputEvent, InputEventId } from '../definitions/events.js';
import { err } from '../definitions/events.js';

import { ConfigManager } from './config_manager.js';
import { WorkflowRegistry } from './workflow_registry.js';
import { WorkflowEngine } from './workflow_engine.js';

// ---------------------------------------------------------------------------
// Handler type
// ---------------------------------------------------------------------------

export type InputEventHandler = (event: InputEvent) => CommandResult | Promise<CommandResult>;

// ---------------------------------------------------------------------------
// EventBus
// ---------------------------------------------------------------------------

export class EventBus {
  private readonly handlers = new Map<InputEventId, InputEventHandler>();
  private readonly _workflowEngine: WorkflowEngine;
  private readonly _registry: WorkflowRegistry;
  private readonly _config: ConfigManager;

  /**
   * Construct the bus with sensible default wiring. Constructor-injected
   * dependencies follow the "垂直骨架锁死" rule (Layer 4 owns Layer 4).
   */
  constructor(opts: { projectRoot?: string; globalRoot?: string } = {}) {
    this._config = new ConfigManager(opts.projectRoot, opts.globalRoot);
    this._registry = new WorkflowRegistry(this._config);
    this._workflowEngine = new WorkflowEngine(this._registry, { projectRoot: opts.projectRoot });

    // Wire up the minimum-viable handler set (one entry per engine handler).
    const engineHandlers: Record<InputEventId, InputEventHandler> = {
      'workflow.init': (e) => this._workflowEngine.handleInit(e),
      'workflow.handover': (e) => this._workflowEngine.handleHandover(e),
      'workflow.continue': (e) => this._workflowEngine.handleContinue(e),
      'workflow.commandInit': (e) => this._workflowEngine.handleCommandInit(e),
      'workflow.status': (e) => this._workflowEngine.handleStatus(e),
      'workflow.abort': (e) => this._workflowEngine.handleAbort(e),
      'workflow.list': (e) => this._workflowEngine.handleList(e),
    };
    for (const [id, handler] of Object.entries(engineHandlers) as Array<
      [InputEventId, InputEventHandler]
    >) {
      this.register(id, handler);
    }
  }

  /** Register (or replace) a handler for an input event id. */
  register(id: InputEventId, handler: InputEventHandler): void {
    this.handlers.set(id, handler);
  }

  /** Returns true if a handler is registered for the given id. */
  has(id: InputEventId): boolean {
    return this.handlers.has(id);
  }

  /**
   * Dispatch an input event. Always returns a CommandResult — never throws
   * for unknown events. Handler exceptions are caught and converted to
   * `error` events with code `INTERNAL`.
   */
  async dispatch(event: InputEvent): Promise<CommandResult> {
    const handler = this.handlers.get(event.event);
    if (!handler) {
      return err(
        'NOT_IMPLEMENTED',
        `Input event "${event.event}" is not implemented in this build of AET.`,
      );
    }
    try {
      return await handler(event);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return err('INTERNAL', `Handler for "${event.event}" threw: ${msg}`);
    }
  }

  // -----------------------------------------------------------------------
  // Accessors (used by CLI commands that need to read state directly,
  // e.g. `workflow list`. These are intentionally narrow — most callers
  // should go through `dispatch`.)
  // -----------------------------------------------------------------------

  get registry(): WorkflowRegistry {
    return this._registry;
  }

  get config(): ConfigManager {
    return this._config;
  }
}

// ---------------------------------------------------------------------------
// Convenience factory
// ---------------------------------------------------------------------------

/**
 * Build a fresh EventBus bound to the given project + global roots. Most
 * callers should use this instead of constructing an EventBus by hand.
 */
export function createEventBus(opts: { projectRoot?: string; globalRoot?: string } = {}): EventBus {
  return new EventBus(opts);
}
