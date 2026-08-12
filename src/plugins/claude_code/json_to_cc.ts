/**
 * @file src/plugins/claude_code/json_to_cc.ts
 *
 * Translates a parsed AET CommandResult (CLI JSON output) into Claude Code
 * hook JSON output (`hookSpecificOutput.additionalContext`).
 *
 * Dual-Channel Design (see AGENTS.md "Output 信封"):
 *   - `result.prompt`     → the agent-visible text. Injected as additionalContext.
 *   - `result.events[]`   → PLUGIN-ONLY signals. Some translate to additionalContext
 *                            (error, prompt.inject), others gate injection
 *                            (omit_prompt suppresses prompt), others degrade
 *                            (interrupt_execution — CC has no native halt).
 *   - `result.data`       → lifecycle metadata. Surfaced as a brief status banner
 *                            prepended to the additionalContext.
 *
 * Per R9, errors are NEVER silenced. Per R8, Claude Code has a reduced
 * capability surface vs OpenCode (no session.create, no system-prompt mutation).
 *
 * CC hook JSON output shape (per ctx7 docs):
 *   {
 *     "hookSpecificOutput": {
 *       "hookEventName": "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | ...,
 *       "additionalContext": "..."
 *     }
 *   }
 *
 * Returns null when there is nothing to inject (so the caller can emit `{}`
 * and keep the hook output minimal — important for PreToolUse, where the
 * matcher fires on every Bash call and a non-AET call should yield {}).
 */

import type { CcHookEventName, CcHookOutput } from './types.js';
import type { CommandData, CommandResult, OutputEvent } from '../../definitions/events.js';
import { resolveDialect, DIALECT_ID } from '../dialect.js';

/** The active host dialect (claude identity in dev/test; host-baked in build). */
const dialect = resolveDialect(DIALECT_ID);

/**
 * Translate a full CommandResult into a CC hook JSON output.
 *
 * Used by UserPromptSubmit (active mode) and any path that injects text
 * into the agent's NEXT turn via `additionalContext`. PostToolUse should
 * NOT use this — it should use {@link resultToCcPostToolOutput} instead,
 * which replaces the tool result's stdout with the prompt text so the
 * agent reads clean text directly in the tool result (no duplication
 * with a second additionalContext injection on the next turn).
 *
 * @param result    parsed CLI JSON result (may be ok or error)
 * @param eventName the CC hook event name currently firing (sets hookEventName
 *                  in the output; behavior is otherwise event-agnostic)
 * @returns the JSON-serializable CC hook output, or null if nothing to inject
 *          (caller emits `{}` to keep hook output minimal)
 */
export function resultToCcOutput(
  result: CommandResult,
  eventName: CcHookEventName = 'UserPromptSubmit',
): CcHookOutput | null {
  // omit_prompt: suppress all prompt injection (active-injection pattern).
  if (hasEvent(result, 'omit_prompt')) {
    return null;
  }

  const fragments: string[] = [];

  // 1. Lifecycle banner from data.status (when present and interesting).
  if (result.data?.status) {
    const banner = statusBanner(result.data);
    if (banner) fragments.push(banner);
  }

  // 2. Error: ALWAYS visible (R9). On ok=false the Core's err() factory
  //    also populates `result.prompt` with `ERROR: <code> — <msg>`, so
  //    this is belt-and-suspenders — surfaces a tagged form too.
  if (!result.ok && result.error) {
    fragments.push(`[AET ERROR ${result.error.code}] ${result.error.message}`);
  }

  // 3. Top-level prompt text (the agent-visible channel).
  if (result.prompt) {
    fragments.push(result.prompt);
  }

  // 4. Plugin-only events that b3 still emits in rare cases (mostly empty
  //    under the new design, but kept for forward-compat).
  for (const ev of result.events) {
    const text = eventToText(ev);
    if (text) fragments.push(text);
  }

  if (fragments.length === 0) return null;
  return {
    hookSpecificOutput: {
      // Translate the canonical (claude) event name into this host's name.
      hookEventName: dialect.toHostEvent(eventName),
      additionalContext: fragments.join('\n\n'),
    },
  };
}

/**
 * Translate a CommandResult into a PostToolUse hook output that REPLACES
 * the tool result's stdout with the agent-visible `prompt` text.
 *
 * Under the dual-channel design (AGENTS.md "Output 信封"):
 *   - `result.prompt` is the COMPLETE agent-visible text. Core's `err()`
 *     factory puts errors into prompt; `buildCommandInitPrompt` wraps the
 *     orientation banner into prompt; `buildStepPrompt` carries the
 *     step task text. So replacing stdout with `result.prompt` gives the
 *     agent the full clean text in one place — the tool result.
 *   - `result.events[]` are plugin-only signals the agent must never see.
 *     They are dropped here (omit_prompt gates replacement; others are
 *     silently ignored since they target plugin behavior, not agent view).
 *
 * This avoids the previous duplication where the agent saw the raw JSON
 * stdout in the tool result AND a second additionalContext injection on
 * the next turn. Now the agent sees clean prompt text once, in the tool
 * result, exactly as if the CLI had printed plain text.
 *
 * @param result parsed CLI JSON result (may be ok or error)
 * @returns the JSON-serializable CC hook output with `updatedToolOutput.stdout`
 *          set to the prompt text, or null when:
 *            - `omit_prompt` is in events[] (active-injection pattern wants
 *              stdout suppressed; CC can't truly suppress — degrade by not
 *              replacing, letting the original JSON stdout pass through), or
 *            - prompt is empty and there's no error to synthesize.
 *          Caller emits `{}` on null so CC leaves the tool result untouched.
 */
export function resultToCcPostToolOutput(result: CommandResult): CcHookOutput | null {
  // omit_prompt: don't replace stdout (degrade — let original pass through).
  if (hasEvent(result, 'omit_prompt')) {
    return null;
  }

  // The prompt field is the complete agent-visible text. Use it directly.
  let stdout = result.prompt;

  // Fallback for the edge case where prompt is empty but ok=false with error.
  // Core's err() factory normally populates prompt, but be defensive.
  if (!stdout) {
    if (!result.ok && result.error) {
      stdout = `[AET ERROR ${result.error.code}] ${result.error.message}`;
    } else {
      // Nothing agent-visible to surface — leave the tool result untouched.
      return null;
    }
  }

  // CC requires the replacement to match the Bash tool's output shape —
  // BashOutput has `stdout` + `stderr` + `interrupted` as NON-optional
  // fields. Omitting stderr/interrupted makes CC reject the replacement
  // (shape mismatch) and pass the raw JSON stdout through to the agent
  // unchanged. Provide the minimal complete shape: prompt text in stdout,
  // empty stderr, not interrupted. The tool-result field name comes from
  // the host dialect (`updatedToolOutput` for claude-family; a host that
  // diverges would list its rename in hosts.json, though none do today).
  return {
    hookSpecificOutput: {
      hookEventName: dialect.toHostEvent('PostToolUse'),
      [dialect.postToolUseOutput]: { stdout, stderr: '', interrupted: false },
    },
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function hasEvent(result: CommandResult, id: string): boolean {
  return result.events.some((e) => e.id === id);
}

/**
 * Brief lifecycle banner prepended to additionalContext. Gives the agent
 * context like "[AET] workflow complete: Aet-Design" without forcing it
 * to parse the full prompt text.
 */
function statusBanner(data: CommandData): string | null {
  const name = data.workflowName ?? data.workflow ?? '(unknown)';
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
 * Translate a single OutputEvent to a text fragment for additionalContext.
 * Returns empty string if the event should be silently ignored.
 *
 * Under b3 design most events are rarely emitted (workflow-complete uses
 * data.status instead of context.clear; step-advance uses top-level prompt
 * instead of prompt.inject). The cases below handle the residual emissions
 * + forward-compat for active-injection codepaths that may use them.
 */
function eventToText(ev: OutputEvent): string {
  const p = ev.payload as Record<string, unknown>;
  switch (ev.id) {
    case 'context.clear': {
      // R8: not directly supported (CC has no session.create). Degrade to
      // a text hint — context.clear carries semantic meaning the agent
      // must know. Under b3 this is rarely emitted (workflow-complete
      // path uses data.status='workflow_complete' instead).
      const reason = typeof p.reason === 'string' ? p.reason : 'step.clear=true';
      return `[AET] Context cleared (reason: ${reason}). Please start a fresh mental context for the next step.`;
    }
    case 'prompt.inject': {
      // b3: rarely emitted (step task text now in top-level prompt field).
      // If it appears (active-injection pattern), surface the text.
      return typeof p.text === 'string' ? p.text : '';
    }
    case 'prompt.inject_system': {
      // R8: no system-prompt mutation in CC. Degrade to a tagged context note.
      return typeof p.text === 'string' ? `[AET system note] ${p.text}` : '';
    }
    case 'hook.prompt': {
      // Normally unreachable here: a `hook.prompt` step hook is BLOCKING —
      // its text becomes the handover's top-level `prompt` (served as the
      // CLI's direct return value, which PostToolUse writes into
      // `updatedToolOutput.stdout`). It therefore never reaches the
      // `events[]`-driven additionalContext path. Defensive fallback:
      // surface the text if it ever appears in events[].
      return typeof p.text === 'string' ? p.text : '';
    }
    case 'hook.func': {
      // R8: CC has no in-process script-execution API for plugin-declared
      // funcs. Degrade to a text hint so the agent (user) can run it
      // manually. The engine already interpolated `${step.id}` etc.; any
      // remaining `${...}` placeholders are env-specific and left intact.
      const cmd = typeof p.command === 'string' ? p.command : '';
      if (!cmd) return '';
      const args = Array.isArray(p.args) ? p.args.filter((a): a is string => typeof a === 'string').join(' ') : '';
      const cwd = typeof p.cwd === 'string' ? ` (cwd: ${p.cwd})` : '';
      return `[AET] hook.func declared (CC cannot execute in-process): run \`${[cmd, args].filter(Boolean).join(' ')}\`${cwd} — please run manually if needed.`;
    }
    case 'interrupt_execution': {
      // CC has no native "halt agent's turn" API. Degrade to a clear
      // warning in additionalContext — the agent will see it on the next
      // model request and should treat it as a context-switch signal.
      return `[AET] interrupt_execution requested — halt current task and await next instruction.`;
    }
    case 'error': {
      // Unreachable in practice — errors are surfaced via result.prompt
      // (Core's err() factory) + the explicit error branch in resultToCcOutput.
      // Kept for belt-and-suspenders.
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
