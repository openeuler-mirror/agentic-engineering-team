/**
 * @file src/plugins/claude_code/hooks/handlers/user_prompt_submit.ts
 *
 * ACTIVE MODE — UserPromptSubmit hook. When the user types a slash command
 * (`/design`, `/aet:design`, ...), run the ONE-SHOT
 * `aet workflow command-init --name <id> --output json` (Core runs init +
 * advance-into-step-1 internally) and inject the result's `prompt` as
 * additionalContext. Non-AET prompts pass through untouched.
 */

import type { CommandResult } from '../../../../definitions/events.js';
import type { CcHookInput } from '../../types.js';
import { resultToCcOutput } from '../../json_to_cc.js';
import { parseSlash, parseSlashArgs } from '../../../shared_hooks.js';
import { debugLog, emit, emitError, resolveAetBin, runAet } from './shared.js';

// ---------------------------------------------------------------------------
// Slash-command matching
// ---------------------------------------------------------------------------
//
// The leading-slash regex + id capture live in src/plugins/shared_hooks.ts
// (`SLASH_CMD_RE` / `parseSlash`) — the OpenCode plugin does NOT reuse them
// (`command.execute.before` receives the bare command name without a slash),
// but they are the shared source of truth for the CC prefix-agnostic match.
// See shared_hooks.ts for the full rationale.

// ---------------------------------------------------------------------------
// Pipeline-summary helpers
// ---------------------------------------------------------------------------
//
// Each return point in handleUserPromptSubmit logs ONE `summary` line that
// answers the user's question "what did the plugin do after /aet-X?": which
// slash command matched, which workflow id, command-init's status, the
// outcome, a plain-text `note`, and injectedChars + injectedTextHead (first
// 300 chars). The FULL injected text is logged separately by emit() as
// event='inject' immediately after — together they give a complete,
// greppable audit trail.

interface UpsSummary {
  slash: string;
  workflow?: string;
  commandInitStatus?: string;
  outcome: string;
  note: string;
}

function logUpsSummary(meta: UpsSummary, injectedText: string): void {
  debugLog({
    event: 'summary',
    stage: 'UserPromptSubmit',
    slash: meta.slash,
    workflow: meta.workflow,
    commandInitStatus: meta.commandInitStatus,
    outcome: meta.outcome,
    note: meta.note,
    injectedChars: injectedText.length,
    injectedTextHead: injectedText.slice(0, 300),
  });
}

/** Common path: translate a CommandResult, log summary, then emit (which logs full inject text). */
function finishUps(result: CommandResult, meta: UpsSummary): void {
  const ccOutput = resultToCcOutput(result, 'UserPromptSubmit');
  const text = ccOutput?.hookSpecificOutput?.additionalContext ?? '';
  logUpsSummary(meta, text);
  emit(ccOutput);
}

/** Error path: build synthetic error text, log summary, then emitError (which logs full inject text). */
function finishUpsError(code: string, message: string, meta: UpsSummary): void {
  const text = `[AET ERROR ${code}] ${message}`;
  logUpsSummary(meta, text);
  emitError('UserPromptSubmit', code, message);
}

export async function handleUserPromptSubmit(input: CcHookInput): Promise<void> {
  const prompt = String(input.prompt ?? '').trim();
  const workflowId = parseSlash(prompt);
  if (!workflowId) {
    debugLog({ event: 'UserPromptSubmit', action: 'no_match', prompt: prompt.slice(0, 100) });
    // No-op emit so CC still receives a well-formed (empty) hook output.
    emit(null);
    return;
  }

  // `parseSlash` captures the FULL id verbatim after any `aet:` namespace
  // prefix (`/design` → `design`, `/aet:design` → `design`) — an `aet-` id
  // prefix is NOT stripped. Core's command-init validates the id against the
  // merged config; workflow ids get the lifecycle prompt, command ids return
  // UNKNOWN_WORKFLOW and the handler passes through to native CC expansion.

  debugLog({ event: 'UserPromptSubmit', action: 'command_init_start', workflowId, cwd: input.cwd });

  // `/enable` is NOT handled here — it passes through to CC's native slash-
  // command expansion, which surfaces commands/enable.md. That command directs
  // the agent to follow the aet-install skill (self-contained install carrier:
  // SKILL.md + scripts/install.cjs + runtime/ + cli/), so NO plugin path is
  // injected by this hook. workflowId === 'enable' then flows to command-init
  // → UNKNOWN_WORKFLOW → pass-through, and enable.md renders natively.

  // Single-shot: init + advance into step 1 in one CLI call. Core's
  // `workflow.commandInit` handler runs `initWorkflow` then
  // `handoverWorkflow` internally and applies the orientation banner to
  // the prompt. Return branches mirror Core's handleCommandInit:
  //   - init ok=false                       → init error result (no handover)
  //   - init intervention_required           → intervention prompt (no handover)
  //   - init success + handover ok=true      → step_advanced + banner + step-1 task
  //   - init success + handover ok=false    → handover error result (rare)
  //
  // `parseSlashArgs` extracts the trailing text after the slash command —
  // the user's initial-requirement description. When present, forward it as
  // `--argument` so the checkpoint persists it and `workflow.continue` can
  // re-inject the original task on resume.
  const argv = ['workflow', 'command-init', '--name', workflowId, '--output', 'json'];
  const argText = parseSlashArgs(prompt);
  if (argText) {
    argv.push('--argument', argText);
  }
  // Bind the coding-agent session at workflow start so the `ca.stop` event
  // (the Stop / session.idle guard) can verify the stopping session owns this
  // workflow.
  // `input.session_id` is CC's ambient session for this user prompt.
  if (input.session_id) {
    argv.push('--session-id', input.session_id);
  }
  const result = await runAet(argv, input.cwd);

  if (result === null) {
    debugLog({ event: 'UserPromptSubmit', action: 'command_init_spawn_failed', workflowId });
    finishUpsError('PLUGIN_SPAWN_FAILED',
      `aet: failed to spawn '${resolveAetBin()}' or parse output for: workflow command-init --name ${workflowId}`,
      { slash: prompt, workflow: workflowId, outcome: 'injected_spawn_error',
        note: "aet CLI failed to spawn or its stdout was not JSON → injected synthetic error; command-init did not complete" });
    return;
  }

  debugLog({ event: 'UserPromptSubmit', action: 'command_init_result', ok: result.ok, status: result.data?.status, checkpointId: result.data?.checkpointId, currentStep: result.data?.currentStep, nextStep: result.data?.nextStep });

  // Command pass-through: the id is NOT a workflow — it is a single-dispatch
  // `commands` entry (e.g. `aet-doc` / `aet-release`). Commands have NO
  // workflow lifecycle: `aet plugin init` already wrote the core skill(s) +
  // description into `command.md`, and the host injects that file content
  // natively. Core's workflow registry refuses command ids, so the
  // UNKNOWN_WORKFLOW error from command-init IS the workflow-vs-command
  // classifier: on it we emit null and let CC's native slash-command
  // expansion surface the command.md content verbatim. No checkpoint, no
  // handover, no `aet workflow` involvement.
  if (!result.ok && result.error?.code === 'UNKNOWN_WORKFLOW') {
    debugLog({ event: 'UserPromptSubmit', action: 'command_pass_through', workflowId });
    emit(null);
    return;
  }

  // command-init failure (init-side, e.g. UNKNOWN_WORKFLOW aside, or rare
  // handover-side error propagated through handleCommandInit) — surface
  // the error prompt. The agent reads it and decides how to proceed.
  if (!result.ok) {
    debugLog({ event: 'UserPromptSubmit', action: 'command_init_failed', code: result.error?.code, message: result.error?.message?.slice(0, 200) });
    finishUps(result, {
      slash: prompt, workflow: workflowId, commandInitStatus: result.data?.status,
      outcome: 'injected_command_init_error',
      note: "command-init returned ok=false → injected error prompt; Core handles init/handover branching internally, no separate handover call needed",
    });
    return;
  }

  // Intervention case (active instance already exists at init time) —
  // Core returns the intervention prompt without running handover.
  // Surface it; user decides (continue via `aet workflow handover`,
  // discard via `aet workflow abort`, or cancel).
  if (result.data?.status === 'intervention_required') {
    debugLog({ event: 'UserPromptSubmit', action: 'intervention_required', existingCheckpoint: result.data.checkpointId, existingStep: result.data.currentStep });
    finishUps(result, {
      slash: prompt, workflow: workflowId, commandInitStatus: 'intervention_required',
      outcome: 'injected_intervention_prompt',
      note: "command-init returned intervention_required (an active workflow already exists) → Core did NOT run handover → injected intervention prompt",
    });
    return;
  }

  // Success path: data.status === 'step_advanced', prompt carries the
  // orientation banner + step-1 task text (Core's buildCommandInitPrompt
  // wraps the handover prompt with the banner). Inject via dual-channel
  // translator; agent next turn sees the banner + first-step directive.
  if (result.data?.status === 'step_advanced') {
    finishUps(result, {
      slash: prompt, workflow: workflowId, commandInitStatus: 'step_advanced',
      outcome: 'injected_step1_prompt',
      note: "command-init one-shot success → injected orientation banner + step-1 task prompt as additionalContext",
    });
    return;
  }

  // Success path with a deferred step: data.status === 'hook_pending' — a
  // `prompt.inject` step hook on the first step's boundary executed first.
  // The prompt is the hook's text (+ reminder to handover again); the step
  // did NOT advance. Inject as-is; the next `aet workflow handover` will
  // actually enter step 1.
  if (result.data?.status === 'hook_pending') {
    finishUps(result, {
      slash: prompt, workflow: workflowId, commandInitStatus: 'hook_pending',
      outcome: 'injected_step_hook',
      note: "command-init success with a prompt.inject step hook → injected hook prompt (step deferred); next handover enters the step",
    });
    return;
  }

  // Defensive fallback: unexpected status — surface as-is. Shouldn't
  // happen under normal Core semantics (the branches above cover every
  // documented handleCommandInit return path), but keeps the handler robust
  // against future Core additions.
  debugLog({ event: 'UserPromptSubmit', action: 'unexpected_command_init_status', status: result.data?.status });
  finishUps(result, {
    slash: prompt, workflow: workflowId, commandInitStatus: result.data?.status,
    outcome: 'injected_unexpected_status',
    note: "command-init returned an unexpected status → injected prompt as-is",
  });
}
