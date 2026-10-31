/**
 * @file src/plugins/opencode/json_to_op.ts
 *
 * Translates AET Core output events (CLI JSON output) into V2 OpenCode
 * Plugin API calls. Per 新方案.md §3.2 (V2 port — D-009):
 *
 *   context.clear        → ctx.session.create + (tui.publish DEGRADED — V2 TUI
 *                          is a separate plugin part, not accessible from here)
 *                          → degrade to "new session + console hint" (AC-023)
 *   prompt.inject        → ctx.session.prompt({ sessionID, text }) when a
 *                          session tracker is wired; otherwise log + drop
 *                          (out-of-hook delivery needs a tracker)
 *   prompt.inject_system → requires session.hook("context"); log + degrade
 *   error                → ALWAYS visible (R9); console.error with [AET] prefix
 *
 * Known degradation (D-009, AC-023): context.clear TUI联动 (tui.session.select)
 * is no longer available from the src plugin part — V2 ctx has no TUI surface.
 * We degrade to creating a new session + logging a hint. The deployable plugin
 * part (with TUI access) can override this with the real tui.session.select
 * call.
 *
 * Two application modes:
 *   (a) In-hook: the hook has access to an `output` object (e.g.
 *       { parts, message }) that we mutate. Used by the command_before prompt
 *       hook (collects text parts, then replaces event.prompt.text).
 *   (b) Out-of-hook: no `output` to mutate, so we drive the V2 domain API
 *       directly (ctx.session.create / ctx.session.prompt). Used when events
 *       arrive via a CLI call that wasn't a hook (e.g. background init
 *       triggered by something else).
 */

import { AET_PLUGIN_ID } from './constants.js';
import type { CommandResult, MessagePart, OutputEvent, PluginContext } from './types.js';

// ── In-hook application: mutate output.parts / output.message ─────────────

/** Append text to the `parts` array of an in-hook output object. */
function appendTextPart(parts: MessagePart[], text: string): void {
  if (!text) return;
  parts.push({ type: 'text', text });
}

/** In-hook event application. Mutates `output.parts` and `output.message`. */
export function applyEventsInHook(
  output: { parts: MessagePart[]; message?: { agent?: string; [k: string]: unknown }; system?: string[] },
  events: OutputEvent[],
): void {
  for (const ev of events) {
    const p = ev.payload;
    switch (ev.id) {
      case 'prompt.inject': {
        const text = String(p.text ?? '');
        appendTextPart(output.parts, text);
        break;
      }
      case 'prompt.inject_system': {
        const text = String(p.text ?? '');
        if (output.system) output.system.push(text);
        else appendTextPart(output.parts, text); // degrade to user-level
        break;
      }
      case 'hook.prompt': {
        // BLOCKING step hook. In OpenCode (no "replace tool stdout"
        // concept) the hook text becomes a visible text part the agent
        // reads. Distinct from prompt.inject (which is a silent
        // system-reminder): here the agent perceives it as direct output.
        const text = String(p.text ?? '');
        appendTextPart(output.parts, text);
        break;
      }
      case 'hook.func': {
        // NON-BLOCKING script-execution declaration. OpenCode has no
        // generic in-process spawn API surfaced to hooks; degrade to a
        // visible instruction (the agent / user can run it host-side).
        const cmd = String((p as { command?: unknown }).command ?? '');
        if (!cmd) break;
        const args = Array.isArray((p as { args?: unknown }).args)
          ? ((p as { args: unknown[] }).args).filter((a): a is string => typeof a === 'string').join(' ')
          : '';
        appendTextPart(output.parts, `## AET 指令\n\nhook.func 声明脚本（OpenCode 不会自动执行）：\n\`\`\`\n${[cmd, args].filter(Boolean).join(' ')}\n\`\`\`\n如需执行，请在宿主侧手动运行。\n`);
        break;
      }
      case 'context.clear': {
        // In-hook we can't actually create a new session; we emit a
        // visible instruction to the agent instead. The out-of-hook
        // path does the real session.create.
        appendTextPart(output.parts, `## AET 指令\n\n1. 请创建一个新会话（context 已清空，原因: ${p.reason ?? 'step.clear'}). 在新会话中继续执行下一步骤.\n`);
        break;
      }
      case 'error': {
        // R9: errors are NEVER silenced. In-hook: surface as text part.
        appendTextPart(output.parts, `[AET ERROR ${p.code ?? 'UNKNOWN'}] ${p.message ?? ''}`);
        break;
      }
      default:
        // Unknown event — ignore (forward-compat: future Core may emit
        // events this plugin version doesn't know about).
        break;
    }
  }
}

// ── Out-of-hook application: drive ctx.session directly ──────────────────

/**
 * Apply events via the V2 ctx.session API directly. Used when the plugin
 * has triggered a CLI call outside a host hook context (e.g. background
 * workflow init from a slash command that the host didn't intercept).
 *
 * Per 新方案.md §3.2 the canonical V2 translations are:
 *   context.clear      → ctx.session.create + console hint (tui.publish
 *                         DEGRADED — V2 TUI is a separate plugin part, AC-023)
 *   prompt.inject      → ctx.session.prompt({ sessionID, text }) (needs tracker)
 *   error              → console.error with [AET] prefix (always visible, R9)
 */
export async function applyEventsViaClient(
  ctx: PluginContext,
  events: OutputEvent[],
): Promise<void> {
  for (const ev of events) {
    const p = ev.payload;
    try {
      switch (ev.id) {
        case 'context.clear': {
          // V2 ctx.session.create; tui.publish is NOT available (V2 TUI is a
          // separate plugin part). Degrade to "new session + console hint"
          // (AC-023). The deployable plugin part (with TUI access) can
          // override this with the real tui.session.select call.
          const created = await ctx.session.create({});
          console.log(
            `[${AET_PLUGIN_ID}] context.clear → new session created (id=${created?.id ?? '?'}). ` +
              `tui.session.select DEGRADED (V2 TUI is a separate plugin part — AC-023). ` +
              `Reason: ${p.reason ?? 'context.clear'}`,
          );
          break;
        }
        case 'prompt.inject': {
          const text = String(p.text ?? '');
          // Session ownership lives at the plugin layer: the plugin knows
          // its ambient session from host hooks, NOT from core's event
          // payload (core never carries sessionID). Out-of-hook delivery
          // needs a plugin session-tracker which is not yet wired here;
          // log + drop until it is.
          console.warn(
            `[${AET_PLUGIN_ID}] prompt.inject out-of-hook delivery needs a plugin session tracker; text not delivered`,
            { text },
          );
          break;
        }
        case 'prompt.inject_system': {
          // No direct system-prompt injection API outside of
          // ctx.session.hook("context"). Log + degrade.
          console.log(
            `[${AET_PLUGIN_ID}] prompt.inject_system received; requires ctx.session.hook("context")`,
            { text: String(p.text ?? '') },
          );
          break;
        }
        case 'hook.prompt': {
          // BLOCKING step hook — text served as CLI's direct return. Out
          // of hook we have no output to mutate; log it for visibility
          // (a session tracker, when wired, could deliver it via
          // ctx.session.prompt).
          console.log(
            `[${AET_PLUGIN_ID}] hook.prompt received out-of-hook; text not delivered to agent`,
            { text: String(p.text ?? '') },
          );
          break;
        }
        case 'hook.func': {
          // NON-BLOCKING script-execution declaration. OpenCode has no
          // generic in-process spawn surfaced via the plugin API; log +
          // degrade. Future: run host-side.
          const cmd = String((p as { command?: unknown }).command ?? '');
          console.log(`[${AET_PLUGIN_ID}] hook.func received; OpenCode cannot execute in-process`, {
            command: cmd,
            args: (p as { args?: unknown }).args,
            cwd: (p as { cwd?: unknown }).cwd,
          });
          break;
        }
        case 'error': {
          // R9: errors are NEVER silenced. Log at error level.
          console.error(`[${AET_PLUGIN_ID}] [AET ERROR ${p.code ?? 'UNKNOWN'}] ${p.message ?? ''}`);
          break;
        }
        default:
          // Unknown event — log + skip.
          console.debug(`[${AET_PLUGIN_ID}] unknown event ${ev.id}; ignored`, { payload: p });
          break;
      }
    } catch (err) {
      // Per R9, errors from applying events must surface — never silent.
      console.error(`[${AET_PLUGIN_ID}] failed to apply ${ev.id}: ${(err as Error).message}`);
    }
  }
}

/**
 * Convenience: take a CommandResult (from runAet) and apply it via the chosen
 * strategy. Used by hook handlers after a CLI call.
 *
 * Aligns with the Claude Code translator (json_to_cc.resultToCcOutput): the
 * TOP-LEVEL `result.prompt` is the primary agent-visible channel (step-1 task
 * text / orientation banner / blocking hook.prompt text — Core puts it there
 * for step_advanced, per b3). It is surfaced as a text part BEFORE the
 * non-blocking `events[]` are applied. Without this, a fresh `command-init`
 * (whose events[] is typically empty) would drop the whole step-1 task.
 */
export async function applyResult(
  ctx: PluginContext,
  result: CommandResult,
  mode: 'in-hook' | 'via-client',
  output?: { parts: MessagePart[]; message?: { agent?: string; [k: string]: unknown }; system?: string[] },
): Promise<void> {
  if (!result.ok) {
    // CLI failed — surface error. R9: never silent.
    const errEv: OutputEvent = {
      id: 'error',
      payload: {
        code: result.error?.code ?? 'CLI_FAILED',
        message: result.error?.message ?? 'CLI returned ok=false without error',
      },
    };
    if (mode === 'in-hook' && output) {
      applyEventsInHook(output, [errEv]);
    } else {
      await applyEventsViaClient(ctx, [errEv]);
    }
    return;
  }

  const prompt = result.prompt ?? '';
  const events = result.events ?? [];
  if (!prompt && events.length === 0) return;

  if (mode === 'in-hook' && output) {
    // Primary channel: the agent-visible prompt text.
    if (prompt) output.parts.push({ type: 'text', text: prompt });
    // Secondary: non-blocking plugin-only signals (context.clear, hook.func, …).
    if (events.length > 0) applyEventsInHook(output, events);
  } else {
    // Out-of-hook: prompt delivery needs a session tracker (not wired);
    // apply the event signals only (unchanged behavior).
    if (events.length > 0) await applyEventsViaClient(ctx, events);
  }
}
