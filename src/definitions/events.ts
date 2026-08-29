/**
 * @file src/definitions/events.ts
 *
 * Layer 2 — Hook 能力定义（契约层）.
 *
 * Pure type/schema module: declares the input/output event protocol that the
 * CLI (Layer 3) speaks with Core (Layer 4) and that Plugins (Layer 2 impl)
 * consume. No runtime logic, no I/O — safe to import from anywhere.
 *
 * Design references:
 *   - 新方案.md §3.1 (input events) and §3.2 (output events)
 *   - "事件粒度粗化": one CLI call = one input event = 0..N output events.
 */

// ---------------------------------------------------------------------------
// Output encoding modes
// ---------------------------------------------------------------------------

export type OutputMode = 'json' | 'prompt';

// ---------------------------------------------------------------------------
// Input events (上行: Agent/Plugin → CLI → Core)
// ---------------------------------------------------------------------------

/**
 * Identifiers of all input events the Core EventBus currently understands.
 *
 * Six events are wired:
 *   - `workflow.init`        — CLI mode: pure init (create checkpoint, no step
 *                              entered). Caller follows up with `workflow.handover`
 *                              to enter step 1.
 *   - `workflow.handover`    — CLI mode: advance one step (or jump to an explicit
 *                              step id). Core reads the active workflow + current
 *                              step from its own checkpoint — the caller passes
 *                              nothing but an optional `step` for explicit jumps.
 *   - `workflow.continue`   — CLI/plugin mode: re-emit the CURRENT step's task
 *                              prompt (state recovery). Reads currentStep from
 *                              the checkpoint (must be non-null — calling continue
 *                              right after `workflow.init` yields `NO_ACTIVE_STEP`;
 *                              run `workflow.handover` first). Emits the current
 *                              step's `before` hooks (re-activating pre-injections)
 *                              and records `step_resumed` in checkpoint history.
 *                              Returns `data.status='step_resumed'`.
 *   - `workflow.commandInit` — Plugin mode: `init` + advance-into-step-1 in one
 *                              dispatch. Used by plugin hosts that hook a user
 *                              command and want the full "start + enter step 1"
 *                              sequence in a single round-trip.
 *   - `workflow.status`      — CLI mode: read-only query of the active workflow
 *                              in the current project root. Returns
 *                              `data.status='active'` with the checkpoint meta
 *                              or `data.status='no_active'` when none. Pure read,
 *                              no side effects.
 *   - `workflow.abort`       — CLI mode: terminate the active workflow in the
 *                              current project root (user-initiated, NOT natural
 *                              completion). Archives the checkpoint with
 *                              `status='aborted'` (distinct from `completed`).
 *                              Returns `data.status='workflow_aborted'`.
 *   - `workflow.list`       — CLI mode: read-only query of all workflows AND
 *                              commands declared in the merged config (baseline
 *                              + global + project). Returns
 *                              `data.status='list'` with `data.workflows[]` /
 *                              `data.commands[]` populated. Pure read, no side
 *                              effects, no checkpoint access.
 *   - `ca.stop`             — CLI/plugin mode: a coding agent stopped producing
 *                              output (CC `Stop` hook / OpenCode `session.idle`).
 *                              Core resolves the active workflow and compares the
 *                              caller-supplied `sessionId` against the session
 *                              bound to the checkpoint (via the `session-id`
 *                              parameter on init/handover). Only when they MATCH
 *                              does Core return a guidance prompt telling the
 *                              agent to keep working (use the question tool if
 *                              asking something, call `aet workflow handover`
 *                              if the stage task is done, otherwise continue to
 *                              the workflow end). Returns an empty prompt (no
 *                              injection) when no active workflow, no bound
 *                              session, or a session mismatch — so an unrelated
 *                              coding-agent session is never fed AET guidance.
 *
 * Stateful Core contract: the CLI is a thin transformer. Core owns the
 * active-workflow + current-step state in `<projectRoot>/.aet/core-checkpoint/`;
 * the caller never re-states it. One active workflow per project root is the
 * supported model (see CheckpointManager.findLatestActiveAny).
 */
export type InputEventId =
  | 'workflow.init'
  | 'workflow.handover'
  | 'workflow.continue'
  | 'workflow.commandInit'
  | 'workflow.status'
  | 'workflow.abort'
  | 'workflow.list'
  | 'ca.stop';

/**
 * Strongly-typed payload for `workflow.init` AND `workflow.commandInit`. The
 * `agent` identity lives on the CLI layer (used to resolve output mode) and
 * is NOT propagated into Core — Core is agent-agnostic.
 */
export interface WorkflowInitPayload {
  /** Scenario name (e.g. "feature") OR a workflow id (e.g. "design") for single-workflow execution. */
  name: string;
  /**
   * Optional initial-requirement text captured at init time (the user's
   * original task description). Persisted into the checkpoint as
   * `workflow.argument` and re-injected into every step / continue prompt
   * so each stage (and a resumed workflow) retains the original goal even
   * after `context.clear` wipes the agent's context. CLI maps `--argument`.
   */
  argument?: string;
  /**
   * Coding-agent session id, used ONLY by `workflow.commandInit` (not bare
   * `workflow.init`). `commandInit` collapses init + advance-into-step-1; the
   * session binds to STEP 1 (entering a stage) via the internal handover —
   * NOT to init. Bare `workflow.init` never binds a session (per-stage model:
   * a workflow spans sessions; binding happens on stage entry via handover /
   * continue). Ignored by `initWorkflow`.
   */
  sessionId?: string;
}

/**
 * Strongly-typed payload for `workflow.handover`. Core is stateful: the
 * active workflow and current step are read from the on-disk checkpoint,
 * so the caller passes only an optional `step` for explicit jumps (forward
 * to skip or backward to redo). With no `step`, Core advances one step
 * in workflow-definition order; if `currentStepId` is null (just-init'd),
 * the first handover enters step 1.
 */
export interface WorkflowHandoverPayload {
  /** Optional explicit step id to jump to. If omitted, advances to the next step. */
  step?: string;
  /**
   * Optional coding-agent session id that is entering the next stage via
   * this handover. Auto-appended by the plugin hooks; persists to the
   * checkpoint as the CURRENT stage's `sessionId` so `ca.stop` (the
   * stop/idle guard) can verify the stopping session owns the current
   * stage. Each stage may bind a different session (or reuse the same).
   * CLI maps `--session-id`.
   */
  sessionId?: string;
}

/**
 * Strongly-typed payload for `workflow.continue`. Core is stateful: the
 * active workflow and current step are read from the on-disk checkpoint, so
 * the caller passes nothing. Continue re-emits the CURRENT step's task
 * prompt (state recovery) — it does NOT advance. The optional `sessionId`
 * re-binds the CURRENT stage to the calling session (a resumed workflow may
 * run in a new coding-agent session after an interrupt).
 */
export interface WorkflowContinuePayload {
  /**
   * Optional coding-agent session id that is resuming the CURRENT stage.
   * Auto-appended by the plugin hooks; persists to the checkpoint as the
   * current stage's `sessionId` so `ca.stop` can verify the stopping session
   * owns the current stage. CLI maps `--session-id`.
   */
  sessionId?: string;
}

/**
 * Strongly-typed payload for `workflow.status`. Read-only query — Core
 * resolves the single active workflow in the current project root (per
 * the "one active workflow per project root" model) and returns its
 * checkpoint meta. No fields needed; the payload exists so the event
 * type is explicit on the wire.
 */
export interface WorkflowStatusPayload {}

/**
 * Strongly-typed payload for `workflow.abort`. Core resolves the active
 * workflow from the checkpoint index (no caller-supplied id — same
 * stateful contract as `workflow.handover`). The optional `reason` is
 * recorded in the checkpoint history for auditability.
 */
export interface WorkflowAbortPayload {
  /** Optional human-readable reason recorded in the checkpoint history. */
  reason?: string;
}

/**
 * Strongly-typed payload for `workflow.list`. Read-only query — Core reads
 * every workflow AND command declared in the merged config (baseline +
 * global + project) and returns them via `data.workflows[]` /
 * `data.commands[]`. No fields needed; the payload exists so the event
 * type is explicit on the wire. Mirrors {@link WorkflowStatusPayload}'s
 * empty-by-contract shape.
 */
export interface WorkflowListPayload {}

/**
 * Strongly-typed payload for `ca.stop`. A coding agent stopped producing
 * output; the caller reports the session that went idle. Core resolves the
 * active workflow and compares `sessionId` against the session bound to the
 * CURRENT stage. Only a match yields a guidance prompt; every no-match /
 * no-active / no-bound-session / missing-session case yields an empty prompt
 * (no injection). `sessionId` is optional — callers without a session concept
 * (e.g. a bare-bash fallback) may omit it, and Core conservatively injects
 * nothing.
 */
export interface CaStopPayload {
  /** The coding-agent session id that stopped producing output, if known. */
  sessionId?: string;
}

/**
 * Canonical input event envelope. Mirrors 新方案.md §3.1 "输入事件公共协议".
 */
export interface InputEvent {
  /** The event id, e.g. `workflow.init`. */
  event: InputEventId;
  /** Event-specific payload. */
  payload:
    | WorkflowInitPayload
    | WorkflowHandoverPayload
    | WorkflowContinuePayload
    | WorkflowStatusPayload
    | WorkflowAbortPayload
    | WorkflowListPayload
    | CaStopPayload;
}

// ---------------------------------------------------------------------------
// Output events (下行: Core → CLI → Plugin/Agent)
// ---------------------------------------------------------------------------

/**
 * Identifiers of all output events the Core may emit. Plugins translate these
 * into host-specific API calls; the Prompt encoder ignores them entirely (it
 * just outputs `CommandResult.prompt`).
 *
 * Two channels of communication, kept strictly separate:
 *   - `CommandResult.prompt` — the TEXT the agent sees as the CLI's return
 *     value. Populated by Core for every ok-path (empty string allowed, e.g.
 *     `workflow.init` has nothing to say to the agent).
 *   - `CommandResult.events` — PLUGIN-ONLY signals. The agent never sees
 *     these in any form. The plugin reads them and performs host-side
 *     actions (clear session, interrupt execution, silently inject prompts,
 *     etc.) that bare agents structurally can't do.
 *
 * Active-injection pattern (the canonical use of events):
 *   events:[omit_prompt, interrupt_execution, prompt.inject{text:'...'}]
 *   — the plugin suppresses the CLI's prompt (omit_prompt), halts the
 *   agent's current turn (interrupt_execution), then silently injects the
 *   given text into the agent's context (prompt.inject). Net effect: the
 *   agent's current turn is interrupted and a new prompt is pushed without
 *   the agent perceiving a CLI return — the plugin "actively injects".
 *
 * See 新方案.md §3.2.
 */
export type OutputEventId =
  | 'context.clear'
  | 'prompt.inject'
  | 'prompt.inject_system'
  | 'hook.prompt'
  | 'hook.func'
  | 'error'
  | 'omit_prompt'
  | 'interrupt_execution';

/**
 * Subset of {@link OutputEventId} that may be bound to a step boundary as a
 * step hook (see `StepHook` in `core/workflow_registry.ts`).
 *
 * These are the events whose emission is *configurable per step*: the user
 * decides, via a step's `hooks[]`, whether/when to emit them. `error` is
 * core-internal (only emitted on failure) and is not step-bindable.
 * `omit_prompt` and `interrupt_execution` are also not step-bindable — they
 * are emitted only by Core's active-injection codepaths.
 *
 * Blocking semantics (the only behavioral distinction Core makes among
 * step-bindable events):
 *   - `hook.prompt`   — EXECUTE-FIRST / BLOCKING. The hook's text is served
 *                       as the handover's top-level `prompt` (the agent sees
 *                       it as the CLI's direct return value — a tool result,
 *                       NOT a silent system-reminder injection), the step
 *                       does NOT advance (`data.status='hook_pending'`), and
 *                       a pending transition is recorded. The NEXT handover
 *                       resumes the transition. This is the only blocking
 *                       step event; use it for "ask the user to confirm
 *                       before advancing" gates.
 *   - everything else — NON-BLOCKING. Carried along as plugin-only
 *                       `events[]` and the transition proceeds immediately.
 *   - `hook.func`     — NON-BLOCKING script-execution declaration. Engine
 *                       declares the command + args (with `${step.id}` etc.
 *                       placeholders interpolated); the plugin layer lands
 *                       the actual spawn (CC degrades to a text hint,
 *                       OpenCode may run it host-side). Carried in
 *                       `events[]`, never blocks the transition.
 *   - `prompt.inject` — NON-BLOCKING. Plugin-layer SILENT injection: the
 *                       text becomes a system-reminder the agent does NOT
 *                       perceive as a CLI return. Distinct from `hook.prompt`
 *                       (which IS the CLI return). Under the active-injection
 *                       pattern (`omit_prompt` + `interrupt_execution` +
 *                       `prompt.inject`) this still drives a silent context
 *                       switch, but as a step hook alone it does not block.
 *
 * Equivalence with the old `HookDefinition` config concept:
 *   - `context.clear`        ← was the `clear: true` step flag
 *   - `hook.prompt`         ← was the legacy "confirm / inject prompt that
 *                              the agent sees as the CLI return" behavior
 *                              (previously mis-routed through
 *                              `prompt.inject`, which is now non-blocking)
 *   - `prompt.inject`       ← silent system-reminder injection (plugin-only)
 *
 * Session ownership: NONE of these payloads carry a `sessionID`. Sessions are
 * a coding-agent-runtime concept owned by the plugin layer (which knows its
 * ambient session from host hooks). Core resolves hooks to semantic-only
 * payloads (text/reason/command); the plugin targets the session.
 */
export type StepEmitableEventId =
  | 'context.clear'
  | 'prompt.inject'
  | 'prompt.inject_system'
  | 'hook.prompt'
  | 'hook.func';

// ---------------------------------------------------------------------------
// Concrete output payload shapes
// ---------------------------------------------------------------------------

export interface ContextClearPayload {
  reason: string;
}

export interface PromptInjectPayload {
  text: string;
  /** `task` for the current step prompt; `handover` for stage handover context. */
  type: 'task' | 'handover';
}

export interface PromptInjectSystemPayload {
  text: string;
}

/**
 * Payload for the BLOCKING `hook.prompt` step event. The hook's text is
 * served as the handover's top-level `prompt` — i.e. the agent sees it as
 * the CLI's DIRECT return value (a tool result the agent reads), NOT a
 * silent system-reminder injection. The step does NOT advance; the next
 * handover resumes the transition. Distinct from `prompt.inject` (which
 * is silent + non-blocking).
 */
export interface HookPromptPayload {
  /** Text the agent sees as the CLI's direct return value. */
  text: string;
}

/**
 * Payload for the NON-BLOCKING `hook.func` step event. Engine declares a
 * script to run (command + args, with `${step.id}` / `${step.description}`
 * placeholders interpolated by Core); the plugin layer lands the actual
 * spawn (CC degrades to a text hint, OpenCode may run it host-side). The
 * event is carried in `events[]` and NEVER blocks the transition.
 */
export interface HookFuncPayload {
  /** Executable or script path to run (e.g. "node" / "scripts/lint.ts"). */
  command: string;
  /**
   * Positional args. `${step.id}` / `${step.description}` are interpolated
   * by Core; any other `${...}` placeholders are left for the plugin
   * layer to resolve (env-specific values).
   */
  args?: string[];
  /** Working directory for the spawn. Optional; plugin defaults to cwd. */
  cwd?: string;
  /** Extra env vars for the spawn. Optional. */
  env?: Record<string, string>;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

/**
 * Empty payload — `omit_prompt` is a flag-only signal. When this event is
 * present in `events[]`, the plugin MUST suppress `CommandResult.prompt`
 * (show the agent an empty CLI return) so the agent doesn't perceive the
 * CLI call as having produced visible output.
 *
 * Stacked with `interrupt_execution` + `prompt.inject` this enables the
 * "active injection" pattern: suppress the CLI return + halt the agent's
 * current turn + silently push a new prompt — the agent experiences a
 * context-switch rather than a tool-call return.
 */
export interface OmitPromptPayload {}

/**
 * Empty payload — `interrupt_execution` is a flag-only signal. When
 * present in `events[]`, the plugin MUST halt the agent's currently-running
 * turn before processing subsequent events (e.g. `prompt.inject`).
 *
 * Without this, the agent would finish its current execution based on the
 * CLI return value, THEN the injected prompt would land — the injection
 * would arrive one turn too late for many use cases (workflow step
 * transitions mid-execution, urgent interrupt messages, etc.).
 */
export interface InterruptExecutionPayload {}

// ---------------------------------------------------------------------------
// OutputEvent — discriminated union over `id`.
// ---------------------------------------------------------------------------

export type OutputEvent =
  | { id: 'context.clear'; payload: ContextClearPayload }
  | { id: 'prompt.inject'; payload: PromptInjectPayload }
  | { id: 'prompt.inject_system'; payload: PromptInjectSystemPayload }
  | { id: 'hook.prompt'; payload: HookPromptPayload }
  | { id: 'hook.func'; payload: HookFuncPayload }
  | { id: 'error'; payload: ErrorPayload }
  | { id: 'omit_prompt'; payload: OmitPromptPayload }
  | { id: 'interrupt_execution'; payload: InterruptExecutionPayload };

/**
 * Structured metadata about the workflow lifecycle, returned alongside
 * `events[]`. The plugin reads this to drive host-side actions that
 * don't map to an OutputEvent (e.g. clear the agent's session, show a
 * "step 3/5" progress badge, log checkpoint id for resume).
 *
 * `events[]` (the action channel) and `data` (the metadata channel)
 * are intentionally separate top-level fields on {@link CommandResult}:
 *   - `events` is the imperative list of things the plugin/agent must do.
 *   - `data` is descriptive context the plugin MAY use.
 *
 * Prompt-mode (bare agent) ignores `data` entirely — the prompt encoder
 * only renders `events`. JSON-mode (plugin) reads both.
 */
export interface CommandData {
  /**
   * Lifecycle status of the active workflow after this command.
   *
   *   - `workflow_started`     — `workflow.init` succeeded; checkpoint
   *                              created, currentStep=null, awaiting
   *                              first handover to enter step 1.
 *   - `step_advanced`        — `workflow.handover` advanced to the step
 *                              indicated by `currentStep`. `nextStep`
 *                              is null when this is the LAST step
 *                              (the next handover will complete the
 *                              workflow).
 *   - `step_resumed`         — `workflow.continue` re-emitted the CURRENT
 *                              step's task prompt (state recovery). No step
 *                              transition occurred; `currentStep` is the
 *                              step being resumed. `nextStep` is the step
 *                              the next handover would advance to (null
 *                              when `currentStep` is the last step).
 *   - `hook_pending`         — `workflow.handover` served a `hook.prompt`
 *                              step hook (execute-first / blocking): the
 *                              returned `prompt` is the hook's text (with
 *                              a reminder to handover again) and the agent
 *                              sees it as the CLI's direct return value,
 *                              the step was NOT advanced (`currentStep`
 *                              unchanged), and a pending transition was
 *                              recorded in the checkpoint. The NEXT
 *                              `workflow.handover` resumes the transition
 *                              and advances to `nextStep` (or completes
 *                              when `nextStep` is null). Only `hook.prompt`
 *                              blocks; `prompt.inject` / `hook.func` /
 *                              `context.clear` are non-blocking and carried
 *                              in `events[]`.
   *   - `workflow_complete`    — `workflow.handover` was called while on
   *                              the last step; checkpoint archived,
   *                              workflow finished. The plugin should
   *                              release any session/context it held
   *                              for this workflow.
   *   - `intervention_required`— `workflow.init` was called but an
   *                              active instance already exists; the
   *                              accompanying `prompt.inject` event
   *                              asks the user to resolve it.
   *   - `no_active`            — `workflow.status` was called and no
   *                              active workflow exists in the current
   *                              project root. Read-only query result;
   *                              no side effects.
   *   - `active`               — `workflow.status` was called and an
   *                              active workflow exists. Read-only query
   *                              result; the accompanying `data` fields
   *                              (workflow, workflowName, currentStep,
   *                              checkpointId) describe it. No side
   *                              effects.
   *   - `workflow_aborted`    — `workflow.abort` terminated the active
   *                              workflow (user-initiated, NOT natural
   *                              completion). Checkpoint archived with
   *                              `status='aborted'` (distinct from
   *                              `completed` for audit). The plugin
   *                              should release any session/context it
   *                              held for this workflow.
   *   - `list`                — `workflow.list` was called. Read-only query
   *                              result; `data.workflows[]` and
   *                              `data.commands[]` carry the merged config's
   *                              full entry list. No side effects, no
   *                              checkpoint access.
   */
  status:
    | 'workflow_started'
    | 'step_advanced'
    | 'step_resumed'
    | 'hook_pending'
    | 'workflow_complete'
    | 'intervention_required'
    | 'no_active'
    | 'active'
    | 'workflow_aborted'
    | 'list';
  /** Workflow id (e.g. "design"). Stable across config edits. */
  workflow?: string;
  /** Workflow display name (e.g. "Aet-Design"). From config. */
  workflowName?: string;
  /**
   * Step id the workflow is now on (after this command). null when
   * `workflow_started` (not entered any step) or `workflow_complete`
   * (no current step anymore).
   */
  currentStep?: string | null;
  /**
   * Next step id the workflow will advance to on the next handover.
   * null when `workflow_started` (init hasn't entered any step yet —
   * the FIRST handover will enter step 1, whose id IS available via
   * `currentStep` after that call), null when this is the LAST step
   * (next handover completes the workflow), null when `workflow_complete`.
   *
   * Useful for the plugin to display "next: <id>" or detect "this is
   * the last step" while still on `step_advanced`.
   */
  nextStep?: string | null;
  /** Checkpoint id for traceability / resume. null when not yet created. */
  checkpointId?: string | null;
  /**
   * The initial-requirement text captured at `workflow.init` time (the
   * user's original task description), when one was supplied. Populated on
   * `step_advanced` / `step_resumed` so plugins can render a "current task"
   * badge or surface it in a resume UI. Undefined when the workflow was
   * started without an argument (or the checkpoint predates this field).
   */
  argument?: string | null;
  /**
   * The coding-agent session id bound to the active workflow, when one was
   * reported at init/handover time. Populated on `ca.stop` (session-match
   * branch) so the plugin can confirm which session owns the workflow.
   * Undefined for every other status.
   */
  sessionId?: string | null;
  /**
   * How many times the `ca.stop` stop-guard has already BLOCKED the stopping
   * session on the CURRENT stage (0 = never blocked). Populated on `ca.stop`
   * (session-match branch) so the plugin / operator can see the remaining
   * budget. Core refuses to block once this reaches
   * {@link STOP_GUARD_MAX_BLOCKS} — the agent is allowed to stop. Resets to 0
   * on a stage change (handover) or a new session binding.
   */
  stopGuardBlocks?: number;
  /**
   * Full list of multi-stage workflows declared in the merged config, as
   * returned by `workflow.list` (`data.status === 'list'`). Each entry
   * carries its id, display name, and description. Undefined for every
   * other status — only `list` populates it.
   */
  workflows?: Array<{ id: string; name: string; description: string }>;
  /**
   * Full list of single-dispatch commands declared in the merged config,
   * as returned by `workflow.list` (`data.status === 'list'`). Each entry
   * carries its id, display name, and description. Undefined for every
   * other status — only `list` populates it.
   */
  commands?: Array<{ id: string; name: string; description: string }>;
  /**
   * Automation mode flag for the active workflow (mirrors
   * WorkflowDefinition.automation). Populated on every `step_advanced` /
   * `step_resumed` / `hook_pending` / `workflow_complete` result so
   * plugins can react consistently (e.g. suppress stop-guard question
   * guidance, render an "automation" badge). Undefined / false on
   * `workflow_started` (the workflow's automation flag is read on the
   * first handover, not at init). False is the default interactive mode.
   */
  automation?: boolean;
}

/**
 * Canonical output envelope returned by every CLI call. Mirrors 新方案.md §3.2.
 *
 * DUAL-CHANNEL DESIGN:
 *   - `prompt`  — the TEXT the agent sees as the CLI's return value. In
 *                 `--output prompt` mode the encoder writes this field
 *                 verbatim to stdout; in `--output json` mode the plugin
 *                 extracts it from the JSON and surfaces it to the agent
 *                 (possibly after applying `events[]` signals such as
 *                 `omit_prompt`).
 *   - `events`  — PLUGIN-ONLY signals. The agent never sees these in any
 *                 form. The plugin reads them and performs host-side
 *                 actions (clear session, interrupt execution, silently
 *                 inject prompts) that bare agents structurally can't do.
 *
 * One input event yields: 0..N output events + 0..1 prompt + 0..1 data.
 */
export interface CommandResult {
  /** `true` when the input event was processed without fatal errors. */
  ok: boolean;
  /**
   * The text the agent sees as the CLI's return value. Populated by Core
   * for every ok-path (empty string allowed — e.g. `workflow.init` has
   * nothing to say). On errors, populated with `ERROR: <code> — <message>`.
   *
   * In `--output prompt` mode: written verbatim to stdout.
   * In `--output json` mode: serialized inside the JSON envelope; the
   * plugin extracts and surfaces it (or suppresses it if `events[]`
   * contains `omit_prompt`).
   */
  prompt: string;
  /** Ordered list of PLUGIN-ONLY signals (never rendered to bare agents). */
  events: OutputEvent[];
  /** Structured lifecycle metadata for the plugin. Omitted on errors. */
  data?: CommandData;
  /** Present only when `ok === false`. */
  error?: { code: string; message: string };
}

// ---------------------------------------------------------------------------
// Helper factories — keep event construction consistent across handlers.
// ---------------------------------------------------------------------------

/** Type-safe constructor: pairs `id` with its strongly-typed payload. */
export function out<K extends OutputEvent['id']>(
  id: K,
  payload: Extract<OutputEvent, { id: K }>['payload'],
): OutputEvent {
  return { id, payload } as OutputEvent;
}

export function err(code: string, message: string): CommandResult {
  return {
    ok: false,
    prompt: `ERROR: ${code} — ${message}`,
    events: [{ id: 'error', payload: { code, message } }],
    error: { code, message },
  };
}

/**
 * Construct a success CommandResult.
 *
 * @param prompt The text the agent sees as the CLI's return value. Required
 *               (use empty string when the operation has nothing to say to
 *               the agent, e.g. `workflow.init`).
 * @param events Plugin-only signals (default: empty). Never rendered to
 *               bare agents.
 * @param data   Structured lifecycle metadata (default: omitted).
 */
export function ok(
  prompt: string,
  events: OutputEvent[] = [],
  data?: CommandData,
): CommandResult {
  return { ok: true, prompt, events, data };
}
