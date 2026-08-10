/**
 * @file src/core/workflow_registry.ts
 *
 * Layer 4 — WorkflowRegistry.
 *
 * Domain types + a registry facade over ConfigManager. A "workflow" in AET
 * is an ordered step sequence — e.g. `design` has steps
 * [requirements_analysis, requirements_design, development_plan]. There is
 * no separate scenario/stage 编排层; the workflow IS the step sequence.
 *
 * Per 新方案.md §2.1: this is the only module that knows the shape of the
 * workflow config; WorkflowEngine asks it for WorkflowDefinition / HookPreset
 * / resolved OutputEvents instead of touching ConfigManager directly.
 *
 * Hook model: a "hook" is an OutputEvent (declared in
 * `definitions/events.ts`) bound to a step boundary. `StepDefinition.hooks[]`
 * declares which events to emit at the step's `before`/`after` boundaries;
 * `WorkflowConfig.hooks` is a named-payload preset library that those
 * bindings reference. This kills the old `HookDefinition`/`promptTemplate`
 * duplication: the event contract (Layer 2) is the single source of truth,
 * and `promptTemplate` — which no plugin consumer ever read — is gone.
 * Rendering lives in the plugin encoders (`json_to_op.ts` / `json_to_cc.ts`),
 * not in the contract.
 */

import type { OutputEvent, StepEmitableEventId } from '../definitions/events.js';
import { out } from '../definitions/events.js';

import type { ConfigManager } from './config_manager.js';

// ---------------------------------------------------------------------------
// Workflow config shape — mirrors docs/zh/workflow.md §"配置参考".
// ---------------------------------------------------------------------------

export interface WorkflowConfig {
  version: string;
  workflows: Record<string, WorkflowDefinition>;
  /**
   * Single-dispatch command entries — the second half of the config.
   *
   * Unlike a {@link WorkflowDefinition}, a command is NOT a step sequence:
   * it has no lifecycle (no checkpoint / handover / status), the workflow
   * engine never sees it, and `aet workflow *` refuses its id. It is a pure
   * render target — `aet plugin init` generates a `command.md` (CC slash
   * command / OpenCode skill) embedding the core skill(s) + description, and
   * the host injects that file content directly when the user invokes the
   * command. No `aet workflow` CLI involvement (see 新方案.md §单次派发).
   */
  commands: Record<string, CommandDefinition>;
  /** Named payload presets referenced by `StepHook.preset`. */
  hooks: Record<string, HookPreset>;
}

export interface WorkflowDefinition {
  name: string;
  description: string;
  /** Ordered list of stages the workflow executes (the pipeline). */
  stages: StepDefinition[];
  /**
   * Optional frontmatter metadata rendered by `aet plugin init` into the
   * generated command/skill file. Default empty — written to frontmatter
   * only when non-empty. Claude Code semantics (per ctx7 docs):
   *   `low` | `medium` | `high` | `xhigh` | `max` — overrides the session
   *   effort level while the command is active. OpenCode ignores the key.
   */
  effort?: string;
  /**
   * Space- or comma-separated tool allowlist (e.g. `Read Grep` or
   * `Bash(git add *) Bash(git commit *)`). Pre-approves tools so the agent
   * skips per-use confirmation. Rendered verbatim into frontmatter.
   */
  'allowed-tools'?: string;
  /**
   * Slash-command argument hint, declared as a LIST of BARE positional-arg
   * names (e.g. `["issue-number", "priority"]` — no CC `[...]` syntax).
   * Bare names keep CC-syntax noise out of the workflow engine: it can lift
   * the declared argument names straight into a checkpoint (one element per
   * `$0`, `$1`, … positional). `aet plugin init` wraps each name in `[...]`
   * and joins with single spaces into the CC frontmatter string form
   * (`[issue-number] [priority]`), because CC's `argument-hint` field
   * accepts a single string, not a YAML list.
   */
  'argument-hint'?: string[];
}

/**
 * A single-dispatch command entry — one-shot, no workflow lifecycle.
 *
 * `aet plugin init` renders `command.md` from `skills` + `description`:
 * "核心 skill: `...`" first, then the description. A command without a core
 * skill (e.g. a routing entry like `aet-router`) omits `skills` and carries
 * its routing logic in `description`. There is intentionally no free-text
 * prompt field — the description IS the command body.
 */
export interface CommandDefinition {
  name: string;
  description: string;
  /**
   * The command's concrete execution body — the full instruction text the
   * agent reads and follows. Distinct from {@link description}: `description`
   * is a one-line summary surfaced as frontmatter metadata + list display,
   * while `prompt` carries the actual procedure (e.g. a routing command's
   * step-by-step flow). Optional — when omitted, the renderer falls back to
   * `description`, so a command with only a short description needs no
   * `prompt`. (A long, procedural description is exactly when you SHOULD
   * split it: keep the summary in `description`, move the steps to `prompt`.)
   */
  prompt?: string;
  /** Core process skill id(s). Rendered as the "核心 skill" line. Optional —
   *  omitted for routing-type commands that dispatch among several skills. */
  skills?: string[];
  /**
   * Optional frontmatter metadata rendered by `aet plugin init` into the
   * generated command.md. Same semantics as {@link WorkflowDefinition}'s
   * namesakes — default empty, written only when non-empty. See ctx7 docs.
   */
  effort?: string;
  'allowed-tools'?: string;
  /**
   * Slash-command argument hint as a LIST of BARE positional-arg names (see
   * {@link WorkflowDefinition#argument-hint}). Wrapped in `[...]` and joined
   * into a single space-separated string at frontmatter-render time.
   */
  'argument-hint'?: string[];
}

export interface StepDefinition {
  id: string;
  /** Human-readable display name (e.g. "需求分析"). Optional — baseline
   *  steps omit it; the template config supplies it for nicer rendering. */
  name?: string;
  description: string;
  /**
   * Optional list of skill ids that are the core process skills for this
   * step (e.g. `['aet-req-analysis']`). Surfaced explicitly here so the
   * `aet plugin init` generator can render a workflow overview without
   * parsing prose out of `description`. Empty/omitted = no dedicated core
   * skill (routing / commit / validation steps).
   */
  skills?: string[];
  /**
   * Step-bound event emissions. Each entry binds one {@link StepEmitableEventId}
   * to a step boundary (`'before'` | `'after'`) with an optional named
   * payload preset and/or inline payload override.
   *
   * Blocking semantics: only `hook.prompt` blocks the transition
   * (execute-first + reminder to handover again); all other events
   * (`context.clear` / `prompt.inject` / `prompt.inject_system` /
   * `hook.func`) are non-blocking — carried in `events[]` while the
   * transition proceeds.
   *
   * Migration of the legacy fields:
   *   - `clear:  true`      → `{ at: 'after',  event: 'context.clear' }`
   *   - `skill:  "foo"`     → `{ at: 'before', event: 'hook.prompt', payload: { text: '<foo prompt>' } }`
   *                           (the agent sees the text as the CLI's direct
   *                           return value; NOT a silent system-reminder
   *                           injection — that is `prompt.inject`)
   */
  hooks?: StepHook[];
}

/**
 * One event emission bound to a step boundary. A step may carry any number
 * of these — the engine emits them in declared order at the boundary.
 *
 * Discriminated union: a binding either references a named preset (the
 * preset carries the event id) or inlines the event directly for one-off
 * bindings that have no reusable payload (e.g.
 * `{at:'after', event:'context.clear'}`). A preset is meaningless without
 * its event, so the event lives on the preset rather than on the step
 * binding — eliminating the redundant `{event, preset}` pair.
 */
export type StepHook = StepHookByPreset | StepHookInline;

/** Named-preset reference — the event id + default payload come from the preset. */
export interface StepHookByPreset {
  /** When in the step lifecycle to emit the event. */
  at: 'before' | 'after';
  /** Name of a payload preset from {@link WorkflowConfig.hooks}. */
  preset: string;
  /** Inline payload override; deep-merged on top of the preset (inline wins). */
  payload?: Record<string, unknown>;
}

/** Inline one-off binding — no named preset, event declared directly. */
export interface StepHookInline {
  /** When in the step lifecycle to emit the event. */
  at: 'before' | 'after';
  /** Which OutputEvent to emit. Constrained to {@link StepEmitableEventId}. */
  event: StepEmitableEventId;
  payload?: Record<string, unknown>;
}

/**
 * Named, reusable event emission template for a step boundary.
 *
 * The preset bundles the event id together with its default payload, so a
 * {@link StepHookByPreset} that references the preset by name needs no
 * separate `event` field — `{at:'after', preset:'clear'}` fully determines
 * a `context.clear` emission. (A preset without an event is meaningless,
 * which is why the event lives here rather than on the step binding.)
 *
 * Fields not supplied here are filled from the bound step at resolve time
 * (see {@link WorkflowRegistry.resolveStepHook}): e.g. a `context.clear`
 * preset without `reason` gets a sensible default derived from the step.
 */
export interface HookPreset {
  description: string;
  /** Which OutputEvent this preset emits. */
  event: StepEmitableEventId;
  /** Event-specific payload fragment. */
  payload?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Registry facade
// ---------------------------------------------------------------------------

export class WorkflowRegistry {
  constructor(private readonly configManager: ConfigManager) {}

  get config(): WorkflowConfig {
    return this.configManager.getConfig();
  }

  /** List all workflow ids with their display name + description. */
  listWorkflows(): Array<{ id: string; name: string; description: string }> {
    const out: Array<{ id: string; name: string; description: string }> = [];
    for (const [id, def] of Object.entries(this.config.workflows)) {
      out.push({ id, name: def.name, description: def.description });
    }
    return out;
  }

  getWorkflow(id: string): WorkflowDefinition | null {
    return this.config.workflows[id] ?? null;
  }

  /** List all command ids with their display name + description. */
  listCommands(): Array<{ id: string; name: string; description: string }> {
    const out: Array<{ id: string; name: string; description: string }> = [];
    for (const [id, def] of Object.entries(this.config.commands)) {
      out.push({ id, name: def.name, description: def.description });
    }
    return out;
  }

  getCommand(id: string): CommandDefinition | null {
    return this.config.commands[id] ?? null;
  }

  getHook(name: string): HookPreset | null {
    return this.config.hooks[name] ?? null;
  }

  /**
   * Resolve a single {@link StepHook} to a concrete {@link OutputEvent} by
   * merging (preset payload ← inline payload ← step-derived defaults).
   *
   * Returns `null` when the binding cannot produce a meaningful event —
   * e.g. a `prompt.inject` with no `text`. The engine treats `null` as
   * "skip this binding" rather than an error.
   */
  resolveStepHook(
    hook: StepHook,
    ctx: StepHookResolveContext,
  ): OutputEvent | null {
    // The event id + base payload come from either a named preset or an
    // inline binding. A preset bundles its event (see HookPreset.event), so
    // a `StepHookByPreset` never redeclares the event on the binding.
    let eventId: StepEmitableEventId;
    let basePayload: Record<string, unknown>;
    if ('preset' in hook) {
      const preset = this.getHook(hook.preset);
      if (!preset) return null; // unknown preset name — skip
      eventId = preset.event;
      basePayload = { ...(preset.payload ?? {}) };
    } else {
      eventId = hook.event;
      basePayload = {};
    }
    // Inline payload overrides the preset/base payload.
    const merged: Record<string, unknown> = {
      ...basePayload,
      ...(hook.payload ?? {}),
    };

    switch (eventId) {
      case 'context.clear':
        return out('context.clear', {
          reason:
            typeof merged.reason === 'string'
              ? merged.reason
              : `step.clear: ${ctx.step.id}`,
        });
      case 'prompt.inject':
        return this.resolveInject(merged);
      case 'prompt.inject_system':
        return this.resolveInjectSystem(merged);
      case 'hook.prompt':
        return this.resolveHookPrompt(merged);
      case 'hook.func':
        return this.resolveHookFunc(merged, ctx);
      default:
        // Exhaustiveness guard: StepEmitableEventId is closed, but refuse
        // any future event rather than emit a malformed payload.
        return null;
    }
  }

  private resolveInject(
    merged: Record<string, unknown>,
  ): OutputEvent | null {
    const text = typeof merged.text === 'string' ? merged.text : '';
    if (!text) return null;
    // Narrow unknown → the literal union the payload requires.
    const type: 'task' | 'handover' =
      merged.type === 'handover' ? 'handover' : 'task';
    return out('prompt.inject', {
      text,
      type,
    });
  }

  private resolveInjectSystem(
    merged: Record<string, unknown>,
  ): OutputEvent | null {
    const text = typeof merged.text === 'string' ? merged.text : '';
    if (!text) return null;
    return out('prompt.inject_system', { text });
  }

  /**
   * Resolve a `hook.prompt` binding — the BLOCKING step event whose text
   * becomes the handover's top-level `prompt` (the agent sees it as the
   * CLI's direct return value). `text` is required; a binding without it
   * contributes nothing (returns null → engine skips).
   */
  private resolveHookPrompt(
    merged: Record<string, unknown>,
  ): OutputEvent | null {
    const text = typeof merged.text === 'string' ? merged.text : '';
    if (!text) return null;
    return out('hook.prompt', { text });
  }

  /**
   * Resolve a `hook.func` binding — the NON-BLOCKING script-execution
   * declaration. `command` is required (return null without it). `args`
   * are interpolated for `${step.id}` / `${step.description}` here; any
   * other `${...}` placeholders are left intact for the plugin layer to
   * resolve against env-specific values. `cwd` / `env` pass through.
   */
  private resolveHookFunc(
    merged: Record<string, unknown>,
    ctx: StepHookResolveContext,
  ): OutputEvent | null {
    const command = typeof merged.command === 'string' ? merged.command : '';
    if (!command) return null;
    const args = Array.isArray(merged.args)
      ? merged.args
          .filter((a): a is string => typeof a === 'string')
          .map((a) => interpolate(a, ctx))
      : undefined;
    const cwd = typeof merged.cwd === 'string' ? merged.cwd : undefined;
    const env: Record<string, string> | undefined =
      merged.env && typeof merged.env === 'object' && !Array.isArray(merged.env)
        ? Object.fromEntries(
            Object.entries(merged.env as Record<string, unknown>).filter(
              (pair): pair is [string, string] => typeof pair[1] === 'string',
            ),
          )
        : undefined;
    return out('hook.func', {
      command: interpolate(command, ctx),
      args,
      cwd,
      env,
    });
  }
}

/**
 * Interpolate `${step.id}` / `${step.description}` placeholders in a
 * template string against the step the hook is bound to. Any other
 * `${...}` placeholder is left untouched for the plugin layer to resolve
 * (env-specific values like `${FEATURE_NAME}`).
 *
 * Deliberately tiny: only the step context Core already has is available.
 * No shell expansion, no nested templates.
 */
function interpolate(
  template: string,
  ctx: StepHookResolveContext,
): string {
  return template
    .replaceAll('${step.id}', ctx.step.id)
    .replaceAll('${step.description}', ctx.step.description);
}

/**
 * Context for resolving a StepHook into an OutputEvent.
 *
 * Carries only the step the hook is bound to. Core's resolver is pure
 * config→event: it does NOT sense session runtime handles — those belong
 * to the plugin layer (which the plugin knows from its host hooks, not from
 * core's events).
 */
export interface StepHookResolveContext {
  /** The step the hook is bound to (supplies default description etc.). */
  step: { id: string; description: string };
}
