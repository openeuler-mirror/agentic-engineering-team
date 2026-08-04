/**
 * @file src/plugins/omp/json_to_omp.ts
 *
 * Translates AET Core output events (CLI JSON output) into omp
 * tool-result content / tool-call input mutations, in-hook.
 *
 * omp's hook model is an in-process TS module (HookAPI `pi.on`). Unlike
 * OpenCode's Plugin API (which exposes `client.session.create` /
 * `client.tui.publish` / `client.app.log` for out-of-hook delivery), omp's
 * HookAPI surface this plugin consumes is limited to the tool_call /
 * tool_result event handlers — there is no out-of-hook client API to drive.
 * So this module only implements the IN-HOOK apply path: it takes a parsed
 * CommandResult and turns it into the content/input mutation the calling hook
 * returns to omp.
 *
 * Per 架构方案 §3.2 the canonical event translations (in-hook):
 *   prompt.inject        → a text content part (appended to the result)
 *   hook.prompt           → a text content part (the blocking step-hook text)
 *   error                → ALWAYS visible (R9); a tagged text content part
 *   omit_prompt          → gate: skip replacement (caller leaves original)
 *   context.clear / hook.func / prompt.inject_system → degrade to a text
 *                          instruction part (omp has no session.create /
 *                          in-process spawn API surfaced to hooks)
 *
 * This is intentionally a slim, self-contained copy of the logic in
 * opencode/json_to_op.ts (the in-hook path) rather than a shared import —
 * to keep each plugin package self-contained for independent installation
 * (omp → ~/.omp/agent/, opencode → ~/.config/opencode/plugin/), matching the
 * cli.ts duplication convention.
 */

import type { CommandResult, MessagePart, OutputEvent } from './types.js';

/**
 * Build the replacement content (array of text parts) for a tool_result hook
 * from a parsed CommandResult. Returns `null` when there is nothing
 * agent-visible to surface (so the caller leaves the original tool result
 * untouched, matching the CC `omit_prompt`-style degrade).
 *
 * The TOP-LEVEL `result.prompt` is the primary agent-visible channel (step-1
 * task text / orientation banner / blocking hook.prompt text — Core puts it
 * there for step_advanced, per b3). It is surfaced as a text part BEFORE the
 * non-blocking `events[]` are applied.
 *
 * @param result parsed CLI JSON result (may be ok or error)
 * @returns content parts to replace the tool result with, or null to leave it
 */
export function resultToOmpContent(result: CommandResult): MessagePart[] | null {
  // omit_prompt: the active-injection pattern wants stdout suppressed; omp
  // can't truly suppress, so degrade by NOT replacing (raw stdout passes).
  if (hasEvent(result, 'omit_prompt')) return null;

  const parts: MessagePart[] = [];

  // 1. Lifecycle banner from data.status (when present and interesting).
  if (result.data?.status) {
    const banner = statusBanner(result.data);
    if (banner) parts.push({ type: 'text', text: banner });
  }

  // 2. Error: ALWAYS visible (R9). On ok=false the Core's err() factory also
  //    populates `result.prompt` with `ERROR: <code> — <msg>`, so this is
  //    belt-and-suspenders — surfaces a tagged form too.
  if (!result.ok && result.error) {
    parts.push({ type: 'text', text: `[AET ERROR ${result.error.code}] ${result.error.message}` });
  }

  // 3. Top-level prompt text (the agent-visible channel).
  if (result.prompt) {
    parts.push({ type: 'text', text: result.prompt });
  }

  // 4. Plugin-only events that b3 still emits in rare cases.
  for (const ev of result.events ?? []) {
    const text = eventToText(ev);
    if (text) parts.push({ type: 'text', text });
  }

  if (parts.length === 0) {
    // Nothing agent-visible to surface — leave the tool result untouched.
    return null;
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function hasEvent(result: CommandResult, id: string): boolean {
  return (result.events ?? []).some((e) => e.id === id);
}

/**
 * Brief lifecycle banner. Gives the agent context like "[AET] workflow
 * complete: Aet-Design" without forcing it to parse the full prompt text.
 * Mirrors the CC translator's statusBanner so all hosts surface the same
 * lifecycle metadata shape.
 */
function statusBanner(data: { status?: string; workflowName?: string; workflow?: string; currentStep?: string | null; nextStep?: string | null; [key: string]: unknown }): string | null {
  const name = (data.workflowName ?? data.workflow ?? '(unknown)') as string;
  switch (data.status) {
    case 'workflow_started':
      return data.nextStep
        ? `[AET] workflow started: ${name} — call \`aet workflow handover\` to enter step 1 (${data.nextStep})`
        : `[AET] workflow started: ${name}`;
    case 'step_advanced':
      return data.nextStep
        ? `[AET] step advanced: ${data.currentStep ?? '?'} — next: ${data.nextStep}`
        : `[AET] step advanced: ${data.currentStep ?? '?'} (last step — next handover completes workflow)`;
    case 'step_resumed':
      return data.nextStep
        ? `[AET] step resumed: ${data.currentStep ?? '?'} (state recovery) — next: ${data.nextStep}`
        : `[AET] step resumed: ${data.currentStep ?? '?'} (last step, state recovery)`;
    case 'hook_pending':
      return data.nextStep
        ? `[AET] step hook injected (hook.prompt) — step unchanged; handover again to advance to ${data.nextStep}`
        : `[AET] step hook injected (hook.prompt) — step unchanged; handover again to complete the workflow`;
    case 'workflow_complete':
      return `[AET] workflow complete: ${name} — all steps done, no further handover needed`;
    case 'intervention_required':
      return `[AET] intervention required — an active workflow already exists (see prompt for resolution options)`;
    default:
      return null;
  }
}

/**
 * Translate a single OutputEvent to a text fragment. Returns empty string if
 * the event should be silently ignored. omp has no session.create / in-process
 * spawn API surfaced via hooks, so context.clear / hook.func degrade to a
 * visible text instruction (the agent/user can act on it host-side).
 */
function eventToText(ev: OutputEvent): string {
  const p = ev.payload as Record<string, unknown>;
  switch (ev.id) {
    case 'context.clear': {
      const reason = typeof p.reason === 'string' ? p.reason : 'step.clear=true';
      return `[AET] Context cleared (reason: ${reason}). Please start a fresh mental context for the next step.`;
    }
    case 'prompt.inject': {
      return typeof p.text === 'string' ? p.text : '';
    }
    case 'prompt.inject_system': {
      // omp has no system-prompt mutation hook surfaced here. Degrade to a
      // tagged context note.
      return typeof p.text === 'string' ? `[AET system note] ${p.text}` : '';
    }
    case 'hook.prompt': {
      // Blocking step-hook text. Normally served as the CLI's direct return
      // (top-level prompt), but surface defensively if it appears in events[].
      return typeof p.text === 'string' ? p.text : '';
    }
    case 'hook.func': {
      // omp has no in-process script-execution API for plugin-declared funcs.
      // Degrade to a text hint so the user can run it manually.
      const cmd = typeof p.command === 'string' ? p.command : '';
      if (!cmd) return '';
      const args = Array.isArray(p.args) ? p.args.filter((a): a is string => typeof a === 'string').join(' ') : '';
      const cwd = typeof p.cwd === 'string' ? ` (cwd: ${p.cwd})` : '';
      return `[AET] hook.func declared (omp cannot execute in-process): run \`${[cmd, args].filter(Boolean).join(' ')}\`${cwd} — please run manually if needed.`;
    }
    case 'interrupt_execution': {
      // omp has no native "halt agent's turn" API surfaced to hooks. Degrade
      // to a clear warning — the agent should treat it as a context-switch.
      return `[AET] interrupt_execution requested — halt current task and await next instruction.`;
    }
    case 'error': {
      const code = typeof p.code === 'string' ? p.code : 'UNKNOWN';
      const message = typeof p.message === 'string' ? p.message : '';
      return `[AET ERROR ${code}] ${message}`;
    }
    case 'omit_prompt': {
      // Handled by hasEvent() gate at the top — should never reach here.
      return '';
    }
    default:
      // Unknown event — silently ignore (forward-compat for future Core).
      return '';
  }
}
