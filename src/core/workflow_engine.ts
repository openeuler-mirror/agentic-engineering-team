/**
 * @file src/core/workflow_engine.ts
 *
 * Layer 4 — WorkflowEngine.
 *
 * Orchestrates workflow lifecycle: resolve workflow → translate the step
 * transition into OutputEvents (the contract declared in
 * definitions/events.ts).
 *
 * Two layers of state, kept strictly separate:
 *
 *   1. CALLER-FACING CONTRACT (stateless): persistent step-tracking is owned
 *      by the caller (the coding-agent plugin / CLI). The caller tracks the
 *      current step and passes it in on every `workflow.handover`. This
 *      keeps the InputEvent / OutputEvent protocol trivially testable and
 *      reentrant — no on-disk state is read or written through the event
 *      channel.
 *
 *   2. CORE-INTERNAL RECORD (best-effort): a {@link CheckpointManager}
 *      records workflow lifecycle transitions (`workflow_started`,
 *      `step_advanced`, `workflow_completed`) to
 *      `<projectRoot>/.aet/core-checkpoint/`. This record is NOT surfaced
 *      as OutputEvents — per 新方案.md §3.2, lifecycle signals are
 *      core-internal. The plugin / CLI never sees them. Recording failures
 *      are swallowed: they MUST NOT affect the event channel.
 *
 * The CheckpointManager is constructed internally and is invisible to the
 * EventBus boundary — the bus still calls `new WorkflowEngine(registry)`.
 *
 * A workflow IS a step sequence. This iteration wires six input events:
 *   - `workflow.init`        → record workflow_started; return a prompt
 *                              telling the caller to run `workflow.handover`
 *                              next to enter step 1. If an active instance
 *                              already exists, return the intervention text
 *                              as `prompt` (asks the user: continue via
 *                              `workflow.continue`, or discard via
 *                              `workflow.abort` + fresh init). Returns
 *                              `data.status='workflow_started'`
 *                              (or `'intervention_required'`).
 *   - `workflow.handover`    → process the transition boundary's step hooks
 *                              (leaving step's `after` + entering step's
 *                              `before`): `context.clear` /
 *                              `prompt.inject` / `prompt.inject_system` /
 *                              `hook.func` are carried as plugin-only
 *                              `events[]` (NON-BLOCKING); a `hook.prompt`
 *                              hook is EXECUTE-FIRST / BLOCKING — the
 *                              handover returns the hook's text (plus a
 *                              reminder to handover again) as the top-level
 *                              `prompt` (the agent sees it as the CLI's
 *                              direct return value), records a pending
 *                              transition, and does NOT advance
 *                              (`data.status='hook_pending'`). With no
 *                              `hook.prompt` hook, the handover advances:
 *                              `step_advanced` (or `workflow_complete` past
 *                              the last step), carrying the next-step task
 *                              text as `prompt`. `data.nextStep` is null on
 *                              the last step so the plugin can detect "next
 *                              handover will complete".
 *   - `workflow.continue`   → re-emit the CURRENT step's task prompt (state
 *                              recovery). No step transition: currentStep
 *                              is unchanged. Re-fires the current step's
 *                              `before` hooks + records `step_resumed` +
 *                              returns `data.status='step_resumed'`. Errors
 *                              with `NO_ACTIVE_STEP` when currentStepId is
 *                              null (init'd but not handed over — run
 *                              `workflow.handover` first).
 *   - `workflow.commandInit` → plugin-mode: `init` + advance-into-step-1 in
 *                              one dispatch (delegates to `initWorkflow` then
 *                              `handoverWorkflow`).
 *   - `workflow.status`       → read-only query of the single active workflow
 *                              in the current project root. Returns
 *                              `data.status='active'` with checkpoint meta
 *                              (workflowName, currentStep, checkpointId,
 *                              startedAt, updatedAt) or
 *                              `data.status='no_active'` when none. No side
 *                              effects; no `events[]`. Mirrors the
 *                              stateful contract of `workflow.handover`:
 *                              Core resolves the active workflow from the
 *                              on-disk checkpoint — caller passes nothing.
 *   - `workflow.abort`       → terminate the active workflow (user-initiated,
 *                              NOT natural completion). Archives the
 *                              checkpoint with `status='aborted'` (distinct
 *                              from `'completed'`). Returns
 *                              `data.status='workflow_aborted'`. Plugin
 *                              reads the status and releases any session/
 *                              context it held (mirrors `workflow_complete`
 *                              handling).
 *   - `ca.stop`             → a coding agent stopped producing output (CC
 *                              `Stop` hook / OpenCode `session.idle`).
 *                              Resolves the active workflow and compares the
 *                              caller's `sessionId` against the session bound
 *                              to the checkpoint. Guidance is injected ONLY on
 *                              a session match; every no-active / no-bound /
 *                              mismatch case yields an empty prompt so an
 *                              unrelated session is never fed AET guidance.
 */

import type {
  CommandResult,
  InputEvent,
  OutputEvent,
  WorkflowAbortPayload,
  WorkflowContinuePayload,
  WorkflowHandoverPayload,
  WorkflowInitPayload,
  WorkflowListPayload,
  CaStopPayload,
} from '../definitions/events.js';
import { err, ok, out } from '../definitions/events.js';

import type { StepDefinition, WorkflowDefinition, WorkflowRegistry } from './workflow_registry.js';
import { CheckpointManager, type ActiveEntry, type PendingTransition } from './checkpoint_manager.js';

/**
 * Auto-appended to every `prompt.inject` step-hook prompt served as an
 * execute-first handover (see {@link WorkflowEngine.processTransition}). The
 * injected task is an intermediate detour: after completing it, the model must
 * call `aet workflow handover` again to actually advance (or complete) the
 * workflow.
 */
const HOOK_REMINDER = '执行完毕后，请再次调用 `aet workflow handover` 以继续推进。';

/**
 * Directive text injected via `prompt.inject_system` event on every
 * handover / continue boundary of an automation-mode workflow. The agent
 * sees this as a system-reminder (OpenCode: output.system.push; CC: degraded
 * to additionalContext; OMP: degraded to a tagged note). SKILL.md <patch>
 * rules key off the `<aet-run-mode>automation</aet-run-mode>` tag to switch
 * behavior (skip question tool, pick recommended option, document
 * assumption). Identical across old/new arch so SKILL.md is shared.
 */
const AUTOMATION_DIRECTIVE_TEXT = `<aet-run-mode>automation</aet-run-mode>
<aet-run-mode-directive>
本会话处于自动化模式。禁止调用 question 工具向用户提问。
- 凡需用户决策处：选 SKILL.md 中已声明的推荐项；若无明确推荐项，结合上下文（需求描述 / 代码库 / 已有交付物）推断最合理选项，并在交付物末尾「## 自动化决策记录」节追加一行：- 决策点：<交互点名称> | 推断选项：<选项> | 推断依据：<依据摘要>
- 凡标注为可选 review 的阶段（如 [S3] / [A4]）：直接跳过，不进入 review 流程
- 不影响必经的验证类门禁（lint / test / build）：仍需全部通过
</aet-run-mode-directive>`;

/**
 * Stop-guard budget: the `ca.stop` event blocks the SAME stage + session from
 * stopping at most this many times. Once a stage+session has been prevented
 * from stopping `STOP_GUARD_MAX_BLOCKS` times, further stops are allowed to
 * proceed (the guard returns an empty prompt) — an agent that keeps stopping
 * despite the guidance is past the point of helping and must be let go. The
 * per-(stage, session) counter lives in the checkpoint and resets on stage
 * change / session change.
 */
const STOP_GUARD_MAX_BLOCKS = 3;

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class WorkflowEngine {
  private readonly checkpoints: CheckpointManager;

  constructor(
    private readonly registry: WorkflowRegistry,
    opts: { projectRoot?: string } = {},
  ) {
    // Constructed internally — invisible to the EventBus boundary. The
    // optional `projectRoot` exists for testability (point at a tmp dir);
    // production callers (EventBus) call `new WorkflowEngine(registry)` and
    // this defaults to `process.cwd()`.
    this.checkpoints = new CheckpointManager(opts.projectRoot ?? process.cwd());
  }

  // -----------------------------------------------------------------------
  // Input event handlers
  // -----------------------------------------------------------------------

  /**
   * `workflow.init` — start a new workflow (CLI mode).
   *
   * Side effect (Core-internal, NOT an OutputEvent): records
   * `workflow_started` via {@link CheckpointManager.create} when no
   * active workflow of the same name exists.
   *
   * Behavior:
   *   - No existing active workflow: creates a checkpoint and returns
   *     `ok([])` (no events) with a prompt telling the caller to run
   *     `workflow.handover` next to enter step 1.
   *   - Any active workflow already exists (one-per-project-root): returns
   *     `ok([])` with an intervention prompt asking the user to choose —
   *     continue the existing workflow via `workflow.continue`, or discard
   *     it and start fresh via `workflow.abort` + `workflow.init` +
   *     `workflow.handover`. No `prompt.inject` event: the intervention is
   *     a passive CLI return carried by the top-level `prompt` field.
   *
   * NOTE: This handler does NOT advance into the first step and does
   * NOT emit `context.clear` or the first step's `before` hooks. That
   * responsibility moved to `workflow.handover` — both CLI `workflow.init`
   * callers and plugin `workflow.commandInit` callers go through that same
   * path to enter step 1.
   */
  handleInit(input: InputEvent): CommandResult {
    const payload = input.payload as WorkflowInitPayload;
    return this.initWorkflow(payload);
  }

  /**
   * `workflow.commandInit` — plugin-mode entry: init + enter step 1.
   *
   * Equivalent to `workflow.init` followed by `workflow.handover` with no
   * `step`:
   *   1. Call {@link initWorkflow} to create (or surface the intervention
   *      prompt for) the active workflow.
   *   2. If init produced events (already-active case), surface them and
   *      stop — the user must resolve the active workflow first.
   *   3. If init succeeded with no events, delegate to {@link handoverWorkflow}
   *      to advance into step 1 — emitting that step's `before` hooks and
   *      carrying the step task text as the top-level `prompt`.
   *
   * Unlike the bare `workflow.handover` path, this entry point is
   * plugin-active-mode (user typed `/aet-*` slash command) — the agent
   * sees AET context for the first time. The handover result's prompt
   * is therefore prefixed with an orientation banner explaining the
   * workflow context, the two core tools (`aet workflow status` /
   * `aet workflow handover`), and the directive to hand over once the
   * current step is complete. The step-1 task text from handover is
   * appended verbatim after a `---` separator.
   */
  handleCommandInit(input: InputEvent): CommandResult {
    const payload = input.payload as WorkflowInitPayload;
    const initResult = this.initWorkflow(payload);
    if (!initResult.ok) return initResult;
    // Intervention guard: initWorkflow returns `status='intervention_required'`
    // when an active instance already exists. Its `events[]` is empty by
    // design (intervention is a passive CLI return, not an OutputEvent
    // channel signal — see initWorkflow's `[]` literal at the
    // intervention branch). Checking `events.length > 0` would miss it
    // and let command-init fall through to handoverWorkflow, which would
    // advance an unrelated active workflow's step instead of surfacing
    // the intervention. Guard on `data.status` instead.
    if (initResult.data?.status === 'intervention_required') return initResult;

    // Init succeeded with no events — advance into step 1 via the same
    // handover codepath the CLI uses. The handover reads the active
    // workflow + null currentStepId from the checkpoint we just created.
    // The session (if reported) binds to step 1 — entering a stage, not
    // init. initWorkflow itself does NOT bind a session (per-stage model).
    const handoverResult = this.handoverWorkflow(payload.sessionId ? { sessionId: payload.sessionId } : {});
    if (!handoverResult.ok) return handoverResult;

    // Plugin-active-mode entry: prefix the step-1 task text with an
    // orientation banner. The agent's first turn needs to know it is
    // inside an AET workflow, which core tools it can call, and that
    // it MUST hand over when the step is done. `data.workflowName` is
    // populated by handoverWorkflow for the step_advanced branch.
    const workflowName = handoverResult.data?.workflowName ?? handoverResult.data?.workflow ?? '';
    return ok(
      buildCommandInitPrompt(workflowName, handoverResult.prompt),
      handoverResult.events,
      handoverResult.data,
    );
  }

  /**
   * `workflow.handover` — current step is done; advance to next (or target).
   *
   * Stateful contract: the active workflow and current step are read from
   * the on-disk checkpoint — the caller passes only an optional `step` for
   * explicit jumps. With no `step`, Core advances one step in workflow
   * definition order; if `currentStepId` is null (just-init'd), the first
   * handover enters step 1.
   *
   * Side effect (Core-internal, NOT an OutputEvent): records
   * `step_advanced` (or `workflow_completed` when past the last step) via
   * {@link CheckpointManager}.
   *
   * Emits, in order:
   *   1. the completed step's `after` hooks (e.g. `context.clear`);
   *   2. the next step's `before` hooks (e.g. a `hook.prompt` gate);
   *   3. the next step's task text (carried as the top-level `prompt`
   *      on `step_advanced`);
   *   - OR `context.clear` if the handover advances past the last step
   *     (workflow complete — the plugin should clear context so the next
   *     session starts fresh).
   *
   * Blocking: only `hook.prompt` defers the advance
   * (`data.status='hook_pending'`); all other hook events are non-blocking
   * and carried in `events[]`.
   *
   * Note: no `workflow.route` — step handover stays within the same workflow.
   */
  handleHandover(input: InputEvent): CommandResult {
    const payload = input.payload as WorkflowHandoverPayload;
    return this.handoverWorkflow(payload);
  }

  /**
   * `workflow.continue` — re-emit the CURRENT step's task prompt (state
   * recovery).
   *
   * Stateful contract: Core resolves the active workflow and current step
   * from the on-disk checkpoint — the caller passes nothing. Unlike
   * `workflow.handover`, this does NOT advance: `currentStepId` stays the
   * same. It re-fires the current step's `before` hooks (so pre-injections
   * like skill prompts are re-activated) and records a `step_resumed` audit
   * entry. Returns `data.status='step_resumed'`.
   *
   * Errors:
   *   - No active workflow → `NO_ACTIVE_WORKFLOW`.
   *   - Active workflow but `currentStepId` is null (init'd but not yet
   *     handed over) → `NO_ACTIVE_STEP` (run `workflow.handover` to enter
   *     step 1 before continue makes sense).
   *   - `currentStepId` references a step removed from config →
   *     `UNKNOWN_STEP`.
   */
  handleContinue(input: InputEvent): CommandResult {
    const payload = input.payload as WorkflowContinuePayload;
    return this.continueWorkflow(payload);
  }

  /**
   * `workflow.status` — read-only query of the single active workflow in
   * the current project root.
   *
   * Stateful contract: Core resolves the active workflow from the on-disk
   * checkpoint index (`findLatestActiveAny`) — caller passes nothing.
   * Returns:
   *   - No active workflow → `data.status='no_active'`, prompt describing
   *     how to start one. No events.
   *   - Active workflow → `data.status='active'`, prompt summarizing
   *     (workflow / step / started / updated). `data.workflow` /
   *     `data.workflowName` / `data.currentStep` / `data.checkpointId`
   *     mirror the fields the `step_advanced` envelope returns so the
   *     plugin can render a consistent "current state" badge.
   *
   * Side effect: none. This is a pure read — it does NOT bump
   * `updatedAt` or write to the checkpoint.
   */
  handleStatus(input: InputEvent): CommandResult {
    const resolved = this.resolveActiveWorkflow();
    if (!resolved) {
      return ok(
        buildNoActivePrompt(),
        [],
        {
          status: 'no_active',
          currentStep: null,
          nextStep: null,
          checkpointId: null,
        },
      );
    }

    const { active, workflowDef, workflowName } = resolved;
    // Stale-config guard: active index references a workflow whose
    // definition has since been removed. We still return `status='active'`
    // (the checkpoint IS there) but surface the lookup gap in the prompt
    // rather than crashing — the user can abort or fix config.

    return ok(
      buildStatusPrompt({
        workflowName,
        workflowId: active.workflow,
        checkpointId: active.checkpointId,
        currentStepId: active.currentStepId,
        startedAt: active.startedAt,
        updatedAt: active.updatedAt,
        workflowDefFound: workflowDef !== null,
      }),
      [],
      {
        status: 'active',
        workflow: active.workflow,
        workflowName,
        currentStep: active.currentStepId,
        nextStep: null,
        checkpointId: active.checkpointId,
      },
    );
  }

  /**
   * `workflow.abort` — terminate the active workflow (user-initiated).
   *
   * Stateful contract: Core resolves the active workflow from the on-disk
   * checkpoint index — caller passes only an optional `reason`. Records
   * `workflow_aborted` (with `reason` if given) via {@link
   * CheckpointManager.recordAbort}, which archives the checkpoint with
   * `status='aborted'` (distinct from `completed` for audit).
   *
   * Returns `data.status='workflow_aborted'` and a prompt confirming the
   * abort. No `events[]` — the plugin reads `data.status` to release any
   * session/context it held for this workflow (mirrors `workflow_complete`
   * handling; CC has no native `session.create` so the host hook degrades
   * the cleanup to an additionalContext note per the existing contract).
   */
  handleAbort(input: InputEvent): CommandResult {
    const payload = input.payload as WorkflowAbortPayload;

    const resolved = this.resolveActiveWorkflow();
    if (!resolved) {
      return err('NO_ACTIVE_WORKFLOW', 'No active workflow to abort. Run `aet workflow init --name <id>` to start one, or `aet workflow status` to inspect.');
    }
    const { active, workflowName } = resolved;

    // Record abort (Core-internal): archives the checkpoint with
    // status='aborted' and a `workflow_aborted` history entry.
    this.checkpoints.recordAbort(active.workflow, payload?.reason);

    return ok(
      buildAbortPrompt({
        workflowName,
        workflowId: active.workflow,
        checkpointId: active.checkpointId,
        reason: payload?.reason,
      }),
      [],
      {
        status: 'workflow_aborted',
        workflow: active.workflow,
        workflowName,
        currentStep: null,
        nextStep: null,
        checkpointId: active.checkpointId,
      },
    );
  }

  /**
   * `workflow.list` — read-only query of every workflow AND command declared
   * in the merged config (baseline + global + project).
   *
   * Reads the registry's `listWorkflows()` + `listCommands()` directly. No
   * checkpoint access, no side effects, no `events[]`. Returns
   * `data.status='list'` with `data.workflows[]` and `data.commands[]`
   * populated; the human-readable list is carried as the top-level `prompt`
   * (one bullet per entry, workflows annotated with their stage count).
   *
   * The list intentionally includes `auto` itself (a single-dispatch command
   * entry that routes among the others) — it is the entry the user typed
   * to get here, and seeing it in the list is self-consistent rather than
   * a special-cased omission.
   */
  handleList(input: InputEvent): CommandResult {
    // Payload is empty by contract — the event type selects the handler.
    const _payload = input.payload as WorkflowListPayload;
    void _payload;

    const workflows = this.registry.listWorkflows();
    const commands = this.registry.listCommands();

    return ok(
      buildListPrompt(workflows, commands),
      [],
      {
        status: 'list',
        workflows,
        commands,
        currentStep: null,
        nextStep: null,
        checkpointId: null,
      },
    );
  }

  /**
   * `ca.stop` — a coding agent stopped producing output (CC `Stop` hook /
   * OpenCode `session.idle`).
   *
   * Stateful contract: Core resolves the active workflow from the on-disk
   * checkpoint and compares the caller-supplied `sessionId` against the
   * `sessionId` bound to that checkpoint (reported at init/handover time).
   *
   * Injection guard (the safety property the caller wants): guidance is
   * injected ONLY when BOTH hold —
   *   1. an active workflow exists, AND
   *   2. the stopping session matches the session bound to the workflow.
   * Every no-match case yields an EMPTY prompt (`ok('')`), so the plugin
   * injects nothing and the stop proceeds cleanly:
   *   - no active workflow → nothing to guide;
   *   - checkpoint has no bound session → can't verify → don't inject
   *     (an unrelated coding-agent session must never get AET guidance);
   *   - `payload.sessionId !== checkpoint.sessionId` → the stopping session
   *     is not the one running this workflow → don't inject.
   *
   * On a match, returns the guidance prompt as the top-level `prompt` (the
   * plugin surfaces it and keeps the agent going) with `data.status='active'`
   * describing the workflow / current step / checkpoint / bound session.
   * No side effects — this is a pure read (does NOT bump `updatedAt`).
   */
  handleCaStop(input: InputEvent): CommandResult {
    const payload = input.payload as CaStopPayload;
    const sessionId = payload?.sessionId;

    const active = this.checkpoints.findLatestActiveAny();
    if (!active) return ok('');

    // No bound session → can't verify the stopping session owns this stage
    // → conservatively inject nothing.
    if (!active.sessionId) return ok('');
    // Session mismatch (or the caller reported no session) → the stopping
    // session is unrelated to the current stage → inject nothing.
    if (sessionId !== active.sessionId) return ok('');

    // Stop-guard budget: the SAME stage + session gets at most
    // STOP_GUARD_MAX_BLOCKS blocks. Past that, let the agent stop — an empty
    // prompt means no more guidance. The counter is persisted in the
    // checkpoint (reset on stage change / session change).
    const blocks = active.stopGuardBlocks ?? 0;
    if (blocks >= STOP_GUARD_MAX_BLOCKS) return ok('');
    this.checkpoints.recordStopGuardBlock(active.workflow);

    const workflowDef = this.registry.getWorkflow(active.workflow);
    const workflowName = workflowDef?.name ?? active.workflow;
    const automation = workflowDef?.automation === true;

    return ok(
      automation
        ? buildCaStopPromptAutomation({
            workflowName,
            workflowId: active.workflow,
            currentStepId: active.currentStepId,
            checkpointId: active.checkpointId,
          })
        : buildCaStopPrompt({
            workflowName,
            workflowId: active.workflow,
            currentStepId: active.currentStepId,
            checkpointId: active.checkpointId,
          }),
      [],
      {
        status: 'active',
        workflow: active.workflow,
        workflowName,
        currentStep: active.currentStepId,
        nextStep: null,
        checkpointId: active.checkpointId,
        sessionId: active.sessionId,
        stopGuardBlocks: blocks + 1,
        automation,
      },
    );
  }

  // -----------------------------------------------------------------------
  // Internal: shared init & handover logic
  // -----------------------------------------------------------------------

  /**
   * Internal: shared workflow-initialization logic for `handleInit`
   * (CLI) and `handleCommandInit` (plugin). Validates the payload,
   * checks for ANY existing active workflow (one-per-project-root
   * contract — not just same-named), and either creates a new checkpoint
   * (returning a "run handover next" prompt) or surfaces an intervention
   * prompt (asking the user: continue via `workflow.continue`, or discard
   * via `workflow.abort` + fresh `init` + `handover`). The intervention is
   * a passive CLI return — `events[]` is empty, the prompt carries the
   * text.
   *
   * Does NOT advance into any step — that is the caller's / handover's
   * responsibility. The created checkpoint's `currentStepId` is `null`
   * until the first `recordStepAdvance` call.
   */
  private initWorkflow(payload: WorkflowInitPayload): CommandResult {
    if (!payload?.name) {
      return err('MISSING_PARAM', 'workflow.init requires payload.name');
    }

    const workflowDef = this.registry.getWorkflow(payload.name);
    if (!workflowDef) {
      return err('UNKNOWN_WORKFLOW', `No workflow named "${payload.name}"`);
    }
    if (workflowDef.stages.length === 0) {
      return err('EMPTY_WORKFLOW', `Workflow "${payload.name}" has no steps defined`);
    }

    // If ANY active workflow already exists (one-active-per-project-root
    // contract), surface the intervention prompt — the agent must ask the
    // user whether to continue the existing workflow (via
    // `workflow.continue`) or discard it and start fresh (via
    // `workflow.abort` then `workflow.init` + `workflow.handover`). We do
    // NOT auto-create a second checkpoint — that would orphan the existing
    // one in the active index. Note this checks ANY active workflow, not
    // just one of the same name: the contract is one active per project
    // root, so even a different-named active workflow triggers the
    // intervention.
    const existing = this.checkpoints.findLatestActiveAny();
    if (existing) {
      const existingDef = this.registry.getWorkflow(existing.workflow);
      return ok(
        buildInterruptPrompt({
          workflowId: existing.workflow,
          workflowName: existingDef?.name ?? existing.workflow,
          checkpointId: existing.checkpointId,
          startedAt: existing.startedAt,
          updatedAt: existing.updatedAt,
          currentStepId: existing.currentStepId,
          requestedWorkflowName: workflowDef.name,
        }),
        [], // no events — the intervention is a passive CLI return
        {
          status: 'intervention_required',
          workflow: existing.workflow,
          workflowName: existingDef?.name ?? existing.workflow,
          currentStep: existing.currentStepId,
          checkpointId: existing.checkpointId,
        },
      );
    }

    // No existing active instance — create a new checkpoint. firstStepId
    // is null because init does NOT advance into any step; handover is
    // responsible for the first step entry.
    //
    // Use the workflow ID (`payload.name`, e.g. "design") — not the
    // display name (`workflowDef.name`, e.g. "Aet-Design") — so handover's
    // lookup-by-active-checkpoint matches. The display name surfaces via
    // `workflowName` in `data`.
    //
    // `payload.argument` (the user's initial requirement, optional) is
    // persisted as the checkpoint's `workflow.argument`. It is re-injected
    // ONLY on `workflow.continue` (state-recovery) so a resumed workflow
    // shows the original task — step handover does NOT re-inject it (each
    // step prompt already carries its own task description).
    const checkpointId = this.checkpoints.create(
      {
        name: payload.name,
        description: workflowDef.description,
        argument: payload.argument,
      },
      null,
      // No session binding at init — a workflow spans multiple stages, each
      // of which may run in a different coding-agent session. Session binding
      // happens when ENTERING a stage (handover / continue).
    );

    // init created the checkpoint but did NOT enter any step —
    // currentStepId is null. Tell the caller explicitly: no step task is
    // available yet; run `workflow.handover` to enter step 1 (which
    // carries the first step's task text).
    const firstStepId = workflowDef.stages[0]?.id ?? null;
    return ok(
      buildWorkflowStartedPrompt(workflowDef.name, firstStepId),
      [],
      {
        status: 'workflow_started',
        workflow: payload.name,
        workflowName: workflowDef.name,
        currentStep: null,
        nextStep: firstStepId,
        checkpointId,
        argument: payload.argument,
        automation: workflowDef.automation === true,
      },
    );
  }

  /**
   * Internal: shared workflow-handover logic for `handleHandover` (CLI) and
   * `handleCommandInit` (plugin). Resolves the active workflow and the current
   * step from the on-disk checkpoint (Core is stateful), then processes the
   * step hooks on the transition boundary (see 新方案.md §hook 语义):
   *
   *   - `context.clear` / `prompt.inject` / `prompt.inject_system` /
   *     `hook.func` hooks → carried along as plugin-only events
   *     (NON-BLOCKING).
   *   - `hook.prompt` hooks → EXECUTE-FIRST / BLOCKING: the handover
   *     returns the hook's text as the top-level `prompt` (plus a
   *     reminder to handover again) — the agent sees it as the CLI's
   *     direct return value — records the deferred transition in the
   *     checkpoint (`pendingTransition`), and does NOT advance the step
   *     (`data.status='hook_pending'`). The NEXT handover resumes the
   *     transition — serving the next `hook.prompt` hook, or advancing /
   *     completing once no `hook.prompt` hooks remain.
   */
  private handoverWorkflow(payload: WorkflowHandoverPayload): CommandResult {
    // Resolve the active workflow from the checkpoint index — no caller-supplied
    // workflow name. One active workflow per project root is the supported model.
    const resolved = this.resolveActiveWorkflow();
    if (!resolved) {
      return err('NO_ACTIVE_WORKFLOW', 'No active workflow to hand over. Run `aet workflow init --name <id>` first.');
    }

    const { active, workflowDef } = resolved;
    if (!workflowDef) {
      // Should not happen: the active index references a workflow whose
      // definition has since been removed from config. Surface a clear error
      // rather than crash; the user can re-init or fix the config.
      return err(
        'UNKNOWN_WORKFLOW',
        `Active checkpoint references workflow "${active.workflow}" but no such workflow is defined in config.`,
      );
    }

    // Bind the coding-agent session (if the caller reported one) to the
    // active checkpoint. Auto-appended by the plugin hooks; there is nothing
    // to do when the payload omits it. This is a side-effect-free-record only
    // — it does not change the step transition.
    if (payload.sessionId) {
      this.checkpoints.recordSession(active.workflow, payload.sessionId);
    }

    // Resume a deferred transition: a previous handover served a
    // `prompt.inject` hook and persisted the remaining hook events here.
    // `currentStepId` is unchanged (the deferred advance never happened).
    if (active.pendingTransition) {
      const pt = active.pendingTransition;
      return this.processTransition(active, workflowDef, pt.from, pt.to, pt.events);
    }

    // Resolve the step being handed over FROM. Read currentStepId from
    // the checkpoint — the caller no longer re-states it. null means
    // the workflow was just init'd and we're entering step 1 (no
    // after-hooks to fire).
    const oldStepDef = active.currentStepId
      ? this.findStepDef(workflowDef, active.currentStepId)
      : null;
    // Stale checkpoint guard: currentStepId in the index doesn't match
    // any defined step. Surface a clear error rather than silently
    // proceeding as if from the start.
    if (active.currentStepId && !oldStepDef) {
      return err(
        'UNKNOWN_STEP',
        `Active checkpoint's currentStep "${active.currentStepId}" not found in workflow "${active.workflow}".`,
      );
    }

    // Resolve the to-step. An explicit `step` jumps to that id; otherwise
    // advance one past `currentStep` in workflow-definition order. null
    // (no explicit step AND no next step) means the workflow completes
    // once this transition's hooks are consumed.
    let toStepDef: StepDefinition | null;
    if (payload.step) {
      toStepDef = this.findStepDef(workflowDef, payload.step);
      if (!toStepDef) {
        return err('UNKNOWN_STEP', `Step "${payload.step}" not found in workflow "${active.workflow}"`);
      }
    } else {
      toStepDef = this.nextStepAfter(workflowDef, oldStepDef?.id);
    }

    // Resolve the ordered hook events for the boundary: the leaving step's
    // `after` hooks, then the entering step's `before` hooks.
    const hookEvents = this.resolveTransitionHooks(oldStepDef, toStepDef);

    return this.processTransition(
      active,
      workflowDef,
      oldStepDef?.id ?? null,
      toStepDef?.id ?? null,
      hookEvents,
    );
  }

  /**
   * Process a step-transition's hook events and either defer (a `hook.prompt`
   * hook fires) or perform the transition (advance / complete).
   *
   * `hookEvents` are the RESOLVED OutputEvents of the boundary hooks still to
   * process, in order. Walking them:
   *   - `hook.prompt` → EXECUTE-FIRST / BLOCKING: persist the remaining
   *     events as the checkpoint's `pendingTransition`, and return the
   *     hook text (+ reminder) as the handover's top-level `prompt` (the
   *     agent sees it as the CLI's direct return value). The step does NOT
   *     advance (`data.status='hook_pending'`).
   *   - `context.clear` / `prompt.inject` / `prompt.inject_system` /
   *     `hook.func` → appended to the carried `events` (plugin-only
   *     channel); NON-BLOCKING.
   *
   * Once the list is exhausted with no `hook.prompt`, the transition is
   * performed: advance `from` → `to` (`step_advanced`), or complete the
   * workflow when `to` is null (`workflow_complete`).
   */
  private processTransition(
    active: ActiveEntry,
    workflowDef: WorkflowDefinition,
    fromStepId: string | null,
    toStepId: string | null,
    hookEvents: OutputEvent[],
  ): CommandResult {
    const events: OutputEvent[] = [];
    const automation = workflowDef.automation === true;

    // Automation mode: auto-emit the directive on every transition. The
    // plugin layer surfaces it as a system-reminder / additionalContext so
    // SKILL.md <patch> rules can switch behavior (skip question tool, pick
    // recommended option, document assumption). Emitted regardless of whether
    // the boundary has any user-declared hooks — the directive is unconditional
    // once the workflow is in automation mode.
    if (automation) {
      events.push(out('prompt.inject_system', { text: AUTOMATION_DIRECTIVE_TEXT }));
    }

    for (let i = 0; i < hookEvents.length; i++) {
      const ev = hookEvents[i]!;
      // Automation mode: degrade hook.prompt to non-blocking prompt.inject
      // (preserve text as a context note; do NOT defer the transition). The
      // agent still sees the original hook text — useful as a hint for what
      // the recommended option would have been — but the step advances
      // immediately instead of blocking on user confirmation.
      if (ev.id === 'hook.prompt' && automation) {
        events.push(out('prompt.inject', {
          text: typeof ev.payload.text === 'string' ? ev.payload.text : '',
          type: 'task',
        }));
        continue;
      }
      if (ev.id === 'hook.prompt') {
        // Execute-first / BLOCKING: defer the advance, serve the hook's
        // text as the handover's top-level `prompt` (the agent sees it as
        // the CLI's direct return value — a tool result, NOT a silent
        // system-reminder injection). The step does NOT advance.
        const pending: PendingTransition = {
          from: fromStepId,
          to: toStepId,
          events: hookEvents.slice(i + 1),
        };
        this.checkpoints.recordPendingTransition(active.workflow, pending);
        const text = typeof ev.payload.text === 'string' ? ev.payload.text : '';
        return ok(
          `${text}\n\n${HOOK_REMINDER}`,
          events,
          {
            status: 'hook_pending',
            workflow: active.workflow,
            workflowName: workflowDef.name,
            currentStep: fromStepId,
            nextStep: toStepId,
            checkpointId: active.checkpointId,
            automation,
          },
        );
      }
      // Non-blocking events — carry along as plugin-only `events[]` and
      // proceed with the transition. This covers:
      //   - `context.clear`        — plugin clears the session
      //   - `prompt.inject`        — plugin silently injects a system-reminder
      //   - `prompt.inject_system` — plugin mutates system prompt
      //   - `hook.func`            — plugin runs the declared script
      // None of these defer the advance.
      if (
        ev.id === 'context.clear' ||
        ev.id === 'prompt.inject' ||
        ev.id === 'prompt.inject_system' ||
        ev.id === 'hook.func'
      ) {
        events.push(ev);
        continue;
      }
      // Unknown / unhandled event id — skip for the agent channel.
    }

    // No `prompt.inject` deferred — perform the transition.
    if (toStepId === null) {
      // Workflow complete: all steps done, hooks consumed. Archive the
      // checkpoint; `recordComplete` also clears any pendingTransition.
      this.checkpoints.recordComplete(active.workflow);
      return ok(
        buildWorkflowCompletePrompt(workflowDef.name),
        events,
        {
          status: 'workflow_complete',
          workflow: active.workflow,
          workflowName: workflowDef.name,
          currentStep: null,
          nextStep: null,
          checkpointId: active.checkpointId,
          automation,
        },
      );
    }

    // Record step_advanced (Core-internal). `from` is null when entering the
    // first step — the recorder accepts that. `recordStepAdvance` clears the
    // pendingTransition it may have carried.
    this.checkpoints.recordStepAdvance(active.workflow, fromStepId, toStepId);

    // Compute the next-next step (the step AFTER the one being entered now)
    // so the plugin can display "next: <id>" or detect "this is the last
    // step" (in which case the next handover will complete the workflow).
    const toStepDef = this.findStepDef(workflowDef, toStepId);
    const nextNextStepId = this.nextStepAfter(workflowDef, toStepId)?.id ?? null;

    const handoverPrompt = buildStepPrompt(
      { workflowName: workflowDef.name, step: toStepDef },
      'AET step handover',
      'Next step',
      '(No more steps defined; proceed freely.)',
    );

    return ok(
      handoverPrompt,
      events,
      {
        status: 'step_advanced',
        workflow: active.workflow,
        workflowName: workflowDef.name,
        currentStep: toStepId,
        nextStep: nextNextStepId,
        checkpointId: active.checkpointId,
        automation,
      },
    );
  }

  /**
   * Resolve the ordered hook events for a step transition: the leaving step's
   * `after` hooks, then the entering step's `before` hooks. Hooks whose event
   * the registry cannot resolve (e.g. an event handover can't process) are
   * dropped — the config must only reference handover-processable
   * OutputEventIds.
   */
  private resolveTransitionHooks(
    fromStepDef: StepDefinition | null,
    toStepDef: StepDefinition | null,
  ): OutputEvent[] {
    const events: OutputEvent[] = [];
    this.emitStepHooks(fromStepDef, 'after', events);
    this.emitStepHooks(toStepDef, 'before', events);
    return events;
  }

  /**
   * Internal: workflow-continue logic for `handleContinue`. Resolves the
   * active workflow and the CURRENT step from the on-disk checkpoint
   * (Core is stateful), re-fires the current step's `before` hooks,
   * records `step_resumed`, and returns the current step's task text
   * (prefixed with a "state recovery" header) as the top-level `prompt`
   * field.
   *
   * Mirrors {@link handoverWorkflow}'s structure but WITHOUT the
   * step-transition: no `after` hooks (the current step did not leave),
   * no `recordStepAdvance`, no next-step resolution. `currentStep` in
   * the returned `data` is the SAME step the workflow is already on.
   */
  private continueWorkflow(payload: WorkflowContinuePayload): CommandResult {
    const resolved = this.resolveActiveWorkflow();
    if (!resolved) {
      return err('NO_ACTIVE_WORKFLOW', 'No active workflow to continue. Run `aet workflow init --name <id>` first.');
    }

    const { active, workflowDef } = resolved;
    if (!workflowDef) {
      return err(
        'UNKNOWN_WORKFLOW',
        `Active checkpoint references workflow "${active.workflow}" but no such workflow is defined in config.`,
      );
    }

    // currentStepId must be non-null — continue re-emits the CURRENT
    // step, but a just-init'd workflow (currentStepId === null) has not
    // entered any step yet. Direct the caller to handover first.
    if (!active.currentStepId) {
      return err(
        'NO_ACTIVE_STEP',
        `Active workflow "${active.workflow}" has not entered any step yet (currentStepId is null). Run \`aet workflow handover\` first to enter step 1, then continue can re-emit it.`,
      );
    }

    const stepDef = this.findStepDef(workflowDef, active.currentStepId);
    if (!stepDef) {
      return err(
        'UNKNOWN_STEP',
        `Active checkpoint's currentStep "${active.currentStepId}" not found in workflow "${active.workflow}".`,
      );
    }

    // Bind the coding-agent session (if reported) to the CURRENT stage.
    // A resumed workflow may run in a new session after an interrupt; this
    // re-binds the stage so `ca.stop` verifies against the right session.
    if (payload.sessionId) {
      this.checkpoints.recordSession(active.workflow, payload.sessionId);
    }

    // Record step_resumed (Core-internal). No currentStepId change.
    this.checkpoints.recordContinue(active.workflow, stepDef.id);

    // Re-fire the current step's before hooks (re-activating
    // pre-injections like skill prompts). No after hooks — the current
    // step did not leave.
    const automation = workflowDef.automation === true;
    const events: OutputEvent[] = [];

    // Automation mode: continue also emits directive (resume after interrupt
    // still in automation mode — the directive must be visible to the agent
    // re-entering the workflow).
    if (automation) {
      events.push(out('prompt.inject_system', { text: AUTOMATION_DIRECTIVE_TEXT }));
    }

    // Pass `automation` to emitStepHooks so any `hook.prompt` in the
    // before-boundary is degraded to non-blocking `prompt.inject` (mirrors
    // processTransition's automation handling).
    this.emitStepHooks(stepDef, 'before', events, automation);

    // Compute the next step (the step the NEXT handover would advance
    // to) so the plugin can display "next: <id>" or detect "this is the
    // last step" — mirrors handoverWorkflow's nextNextStepId computation.
    const nextStepId = this.nextStepAfter(workflowDef, stepDef.id)?.id ?? null;

    // Re-inject the original requirement (captured at init) alongside the
    // resumed step prompt — the core "state recovery" contract: the agent
    // must re-see the original goal, not just the current-step text.
    const argument = this.checkpoints.getCheckpointMeta(active.checkpointId)?.argument;

    const continuePrompt = buildStepPrompt(
      { workflowName: workflowDef.name, step: stepDef, argument },
      'AET step resume (state recovery)',
      'Current step',
      '(No current step to resume.)',
    );

    return ok(
      continuePrompt,
      events,
      {
        status: 'step_resumed',
        workflow: active.workflow,
        workflowName: workflowDef.name,
        currentStep: stepDef.id,
        nextStep: nextStepId,
        checkpointId: active.checkpointId,
        argument,
        automation,
      },
    );
  }

  // -----------------------------------------------------------------------
  // Internal: active-workflow / step resolution helpers
  // -----------------------------------------------------------------------

  /**
   * Resolve the active workflow from the on-disk checkpoint index together
   * with its registry definition. Returns undefined when no workflow is
   * active. `workflowDef` is null when the active index references a
   * workflow removed from config — callers decide whether to hard-error
   * or surface a stale-config guard.
   */
  private resolveActiveWorkflow():
    | { active: ActiveEntry; workflowDef: WorkflowDefinition | null; workflowName: string }
    | undefined {
    const active = this.checkpoints.findLatestActiveAny();
    if (!active) return undefined;
    const workflowDef = this.registry.getWorkflow(active.workflow);
    return { active, workflowDef, workflowName: workflowDef?.name ?? active.workflow };
  }

  /**
   * The step immediately after `stepId` in definition order, or null when
   * `stepId` is the last step. A null/absent `stepId` (just-init'd
   * workflow) resolves to the first step.
   */
  private nextStepAfter(
    def: WorkflowDefinition,
    stepId: string | null | undefined,
  ): StepDefinition | null {
    if (!stepId) return def.stages[0] ?? null;
    const idx = def.stages.findIndex((s) => s.id === stepId);
    return idx >= 0 && idx + 1 < def.stages.length ? def.stages[idx + 1] ?? null : null;
  }

  /** Find a step's definition (with hooks config) by id. */
  private findStepDef(
    workflowDef: WorkflowDefinition,
    stepId: string,
  ): StepDefinition | null {
    return workflowDef.stages.find((s) => s.id === stepId) ?? null;
  }

  /**
   * Resolve all of a step's hooks for the given boundary (`before`/`after`)
   * and append the resulting OutputEvents to `events`. Steps with no `hooks`
   * or no matching-boundary hooks contribute nothing.
   *
   * When `automation` is true, `hook.prompt` events are degraded to
   * non-blocking `prompt.inject` events (text preserved as a context note;
   * the transition is NOT deferred). Mirrors `processTransition`'s automation
   * handling for the `before` hooks re-fired by `continueWorkflow`.
   */
  private emitStepHooks(
    step: StepDefinition | null,
    at: 'before' | 'after',
    events: OutputEvent[],
    automation: boolean = false,
  ): void {
    if (!step?.hooks) return;
    for (const h of step.hooks) {
      if (h.at !== at) continue;
      const ev = this.registry.resolveStepHook(h, {
        step: { id: step.id, description: step.description },
      });
      if (!ev) continue;
      // Automation mode: degrade hook.prompt to non-blocking prompt.inject
      // (preserve text as a context note; do NOT defer the transition).
      if (ev.id === 'hook.prompt' && automation) {
        events.push(out('prompt.inject', {
          text: typeof ev.payload.text === 'string' ? ev.payload.text : '',
          type: 'task',
        }));
        continue;
      }
      events.push(ev);
    }
  }
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

interface StepPromptContext {
  workflowName: string;
  step: StepDefinition | null;
  /**
   * Optional initial-requirement text captured at init time. Injected ONLY
   * by `workflow.continue` (state recovery) — so a resumed workflow shows
   * the original task and the agent knows what it is. Step handover does
   * NOT set this (each step prompt carries its own task description).
   */
  argument?: string;
}

/**
 * Build the step prompt text the agent sees on a step transition
 * (`workflow.handover` → "Next step") or a state-recovery re-emit
 * (`workflow.continue` → "Current step"). The two differ only in header /
 * label wording — the shape is identical. Only `workflow.continue` passes
 * `c.argument`; when present, an `## 初始需求` section is appended so the
 * resumed workflow surfaces the original task.
 */
function buildStepPrompt(
  c: StepPromptContext,
  header: string,
  label: string,
  emptyText: string,
): string {
  const h = `## ${header}\n\nWorkflow: \`${c.workflowName}\``;
  let body: string;
  if (!c.step) {
    body = `${h}\n\n${emptyText}`;
  } else {
    body = `${h}\n\n${label}:\n- id: \`${c.step.id}\`\n- description: ${c.step.description}`;
  }
  if (c.argument) {
    body += `\n\n## 初始需求\n\n${c.argument}`;
  }
  return body;
}

/**
 * Build the prompt text the agent sees right after `workflow.init`
 * succeeds. init creates the checkpoint but does NOT enter any step
 * (currentStepId is null), so there is no step task to act on yet. The
 * prompt tells the caller explicitly to run `workflow.handover` next to
 * enter step 1 (which carries the first step's task text). Carried as
 * the top-level `prompt` field on the CommandResult.
 */
function buildWorkflowStartedPrompt(workflowName: string, firstStepId: string | null): string {
  const lines = [
    '## AET workflow started',
    '',
    `Workflow: \`${workflowName}\``,
    '',
    'A checkpoint has been created but NO step has been entered yet —',
    'currentStepId is null. No step task is available to act on.',
    '',
    'To begin actual work, advance into the first step:',
    '  aet workflow handover',
  ];
  if (firstStepId) {
    lines.push('', `(First step will be: \`${firstStepId}\`)`);
  }
  return lines.join('\n');
}

/**
 * Build the prompt text the agent sees when the workflow is complete
 * (i.e. `workflow.handover` is called while on the LAST step). Carried
 * as the top-level `prompt` field on the CommandResult; the plugin reads
 * `data.status === 'workflow_complete'` to release any session it held.
 */
function buildWorkflowCompletePrompt(workflowName: string): string {
  return [
    '## AET 工作流完成',
    '',
    `Workflow: \`${workflowName}\``,
    '',
    '所有步骤已完成，工作流结束。',
    '',
    '无需再调用 `aet workflow handover`。',
  ].join('\n');
}

interface CaStopPromptContext {
  workflowName: string;
  workflowId: string;
  currentStepId: string | null;
  checkpointId: string;
}

/**
 * Build the guidance prompt the agent sees when it stops producing output
 * while an AET workflow is active AND the stopping session is the one bound
 * to that workflow (`ca.stop` session-match branch).
 *
 * The prompt tells the agent how to proceed rather than letting it stop:
 *   - if it is asking a question → use the question tool, do NOT stop;
 *   - if the current stage task is done → call `aet workflow handover`;
 *   - otherwise → continue working until the workflow ends.
 *
 * Deliberately cites the workflow / current step / checkpoint so the agent
 * can confirm it is the right workflow before acting. Carried as the
 * top-level `prompt` field; the plugin surfaces it and keeps the agent going.
 */
function buildCaStopPrompt(c: CaStopPromptContext): string {
  return [
    '## AET 工作流进行中 — 请勿停止',
    '',
    `你正在执行 AET 工作流 \`${c.workflowName}\`（\`${c.workflowId}\`），`,
    `当前阶段：\`${c.currentStepId ?? '(尚未进入任何 step)'}\`，checkpoint：\`${c.checkpointId}\`。`,
    '',
    '检测到你已停止输出，请根据当前情况继续：',
    '',
    '- **如果你正在提问**：请使用提问（question）工具，而不要停止。',
    '- **如果当前阶段任务已完成**：调用 `aet workflow handover` 推进到下一阶段。',
    '- **否则**：请继续工作，直到工作流结束。',
    '',
    '请勿在此工作流结束前停止。',
  ].join('\n');
}

/**
 * Build the guidance prompt for automation-mode workflows when the agent
 * stops producing output. Differs from {@link buildCaStopPrompt} in that:
 *   - It does NOT suggest "use the question tool" (automation mode forbids
 *     question tool usage — see {@link AUTOMATION_DIRECTIVE_TEXT}).
 *   - It directs the agent to either handover (if step task done) or continue
 *     working, based on context inference rather than user prompting.
 * Carried as the top-level `prompt` field; surfaced by the plugin.
 */
function buildCaStopPromptAutomation(c: CaStopPromptContext): string {
  return [
    '## AET 自动化工作流进行中 — 请勿停止',
    '',
    `你正在执行 AET 工作流 \`${c.workflowName}\`（自动化模式），`,
    `当前阶段：\`${c.currentStepId ?? '(尚未进入任何 step)'}\`，checkpoint：\`${c.checkpointId}\`。`,
    '',
    '检测到你已停止输出，请勿停止：',
    '',
    '- **如果当前阶段任务已完成**：调用 `aet workflow handover` 推进到下一阶段。',
    '- **否则**：继续工作直到完成当前阶段任务后再 handover。',
    '',
    '自动化模式下禁止调用 question 工具，请基于上下文自行决策。',
  ].join('\n');
}

interface InterruptPromptContext {
  workflowId: string;
  workflowName: string;
  checkpointId: string;
  startedAt: string;
  updatedAt: string;
  currentStepId: string | null;
  /** Display name of the workflow the caller requested to init (used in the "discard + start new" option). */
  requestedWorkflowName: string;
}

function buildInterruptPrompt(c: InterruptPromptContext): string {
  const lines = [
    '## Workflow already active',
    '',
    'An active workflow is already running in this project root:',
    '',
    `- Workflow: \`${c.workflowName}\` (\`${c.workflowId}\`)`,
    `- Checkpoint: \`${c.checkpointId}\``,
    `- Started at: ${c.startedAt}`,
    `- Last updated: ${c.updatedAt}`,
    `- Current step: ${c.currentStepId ?? '(not yet entered)'}`,
    '',
    'One active workflow per project root is supported. Ask the user how to proceed:',
    '',
    '1. **Continue the existing workflow** — call `aet workflow continue` to',
    "   re-emit the current step's task prompt (state recovery) and resume work.",
    `2. **Discard it and start a new task (\`${c.requestedWorkflowName}\`)** — first`,
    '   `aet workflow abort` to archive the active checkpoint, then',
    '   `aet workflow init --name <id>` + `aet workflow handover` to start the',
    '   new workflow and enter its first step.',
    '3. **Cancel** — do nothing.',
  ];
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Prompt builders — status / abort
// ---------------------------------------------------------------------------

interface StatusPromptContext {
  workflowName: string;
  workflowId: string;
  checkpointId: string;
  currentStepId: string | null;
  startedAt: string;
  updatedAt: string;
  /** false when the active index references a workflow removed from config. */
  workflowDefFound: boolean;
}

function buildNoActivePrompt(): string {
  return [
    '## No active workflow',
    '',
    'No workflow is currently in progress in this project root.',
    '',
    'Start one with:',
    '  aet workflow init --name <id>   # e.g. design / implement / bugfix',
    '',
    'Then advance it with:',
    '  aet workflow handover',
  ].join('\n');
}

function buildStatusPrompt(c: StatusPromptContext): string {
  const lines = [
    '## Active workflow',
    '',
    `- workflow: \`${c.workflowId}\``,
    `- display name: ${c.workflowName}`,
    `- checkpoint: \`${c.checkpointId}\``,
    `- current step: ${c.currentStepId ?? '(not yet entered)'}`,
    `- started at: ${c.startedAt}`,
    `- last updated: ${c.updatedAt}`,
  ];
  if (!c.workflowDefFound) {
    lines.push(
      '',
      `> ⚠️ Workflow definition for \`${c.workflowId}\` not found in current config.`,
      '> The checkpoint exists but its workflow is no longer registered.',
      '> Run `aet workflow abort` to discard it, or restore the config.',
    );
  }
  return lines.join('\n');
}

interface AbortPromptContext {
  workflowName: string;
  workflowId: string;
  checkpointId: string;
  reason?: string;
}

function buildAbortPrompt(c: AbortPromptContext): string {
  const lines = [
    '## Workflow aborted',
    '',
    `- workflow: \`${c.workflowId}\``,
    `- display name: ${c.workflowName}`,
    `- checkpoint: \`${c.checkpointId}\``,
    `- archived with status: \`aborted\``,
  ];
  if (c.reason) {
    lines.push('', `- reason: ${c.reason}`);
  }
  lines.push(
    '',
    'The active workflow has been terminated and its checkpoint moved to the',
    'archive. The project root no longer holds an active workflow.',
    '',
    'To start a fresh workflow:',
    '  aet workflow init --name <id>',
  );
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// list prompt builder
// ---------------------------------------------------------------------------

/** A config entry as surfaced to the list prompt — id + display name + description. */
interface ListEntry {
  id: string;
  name: string;
  description: string;
}

/**
 * Build the prompt text the agent sees for `workflow.list`. Renders two
 * sections — available multi-stage workflows, then available single-dispatch
 * commands — each as a bulleted list. Workflows are annotated with their
 * stage count so the agent (and user) can gauge pipeline length at a glance.
 *
 * Only the FIRST line of each entry's description is shown (config
 * descriptions can be multi-line; the full text is available via
 * `data.workflows[]` / `data.commands[]` in JSON mode).
 */
function buildListPrompt(
  workflows: ListEntry[],
  commands: ListEntry[],
): string {
  const wfLines = workflows.length
    ? workflows.map((w) => `- \`${w.id}\` — ${firstLine(w.description)}`)
    : ['(none)'];
  const cmdLines = commands.length
    ? commands.map((c) => `- \`${c.id}\` — ${firstLine(c.description)}`)
    : ['(none)'];
  return [
    '## Available workflows',
    '',
    ...wfLines,
    '',
    '## Available commands',
    '',
    ...cmdLines,
  ].join('\n');
}

/** First line of a (possibly multi-line) description, trimmed. */
function firstLine(s: string): string {
  const idx = s.indexOf('\n');
  return (idx >= 0 ? s.slice(0, idx) : s).trim();
}

// ---------------------------------------------------------------------------
// command-init prompt builder
// ---------------------------------------------------------------------------

/**
 * Build the prompt for `workflow.commandInit` — the plugin-active-mode
 * entry point (user typed `/aet-*` slash command).
 *
 * Unlike bare `workflow.handover`, the agent's first turn needs an
 * orientation banner: it must know it is inside an AET workflow, which
 * core tools it can call (`aet workflow status` / `aet workflow handover`),
 * and that it MUST hand over once the current step is complete. The
 * step-1 task text from {@link buildStepPrompt} is appended verbatim
 * after a `---` separator.
 *
 * Layout:
 *   ## AET 工作流已启动
 *   <orientation paragraph>
 *   <core-tools list>
 *   <handover directive>
 *   <first-step directive>
 *   ---
 *   <handoverPrompt verbatim>
 */
function buildCommandInitPrompt(workflowName: string, handoverPrompt: string): string {
  const banner = [
    '## AET 工作流已启动',
    '',
    `你现在已进入 AET 工作流（\`${workflowName}\`）。可用核心工具：`,
    '',
    '- `aet workflow status` — 查询当前 active workflow 状态（只读，无副作用）',
    '- `aet workflow handover` — 完成当前阶段任务后推进到下一阶段',
    '',
    '执行完当前阶段任务后，请调用 `aet workflow handover` 推进。',
    '',
    '现在请根据下面执行第一个阶段：',
    '',
    '---',
    '',
  ].join('\n');
  return `${banner}${handoverPrompt}`;
}
