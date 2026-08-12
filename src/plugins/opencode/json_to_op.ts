/**
 * @file src/plugins/opencode/json_to_op.ts
 *
 * Translates AET Core output events (CLI JSON output) into OpenCode
 * Plugin API calls. Per 新方案.md §3.2:
 *
 *   context.clear        → client.session.create + tui.publish(tui.session.select)
 *   prompt.inject        → client.session.prompt({parts:[{type:'text',text}]})
 *                          OR appendText(output, ...) in hook context
 *   prompt.inject_system → output.system.push(...) (legacy)
 *   error                → ALWAYS visible (R9); log + re-throw if no hook ctx
 *
 * Two application modes:
 *   (a) In-hook: the hook has access to an `output` object (e.g.
 *       { parts, message }) that we mutate. Used by command.execute.before
 *       hooks.
 *   (b) Out-of-hook: no `output` to mutate, so we drive the host API
 *       directly (client.session.create / client.session.prompt /
 *       client.tui.publish). Used when events arrive via a CLI call that
 *       wasn't a hook (e.g. background init triggered by something else).
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

// ── Out-of-hook application: drive client.session/tui directly ───────────

/**
 * Apply events via the OpencodeClient API directly. Used when the plugin
 * has triggered a CLI call outside a host hook context (e.g. background
 * workflow init from a slash command that the host didn't intercept).
 *
 * Per 新方案.md §3.2 the canonical translations are:
 *   context.clear      → client.session.create + client.tui.publish
 *   prompt.inject      → client.session.prompt({ parts: [{type:'text',text}] })
 *   error              → log via client.app.log (always visible)
 */
export async function applyEventsViaClient(
  ctx: PluginContext,
  events: OutputEvent[],
): Promise<void> {
  const client = ctx.client;
  for (const ev of events) {
    const p = ev.payload;
    try {
      switch (ev.id) {
        case 'context.clear': {
          const created = await client.session.create({});
          if (client.tui && created?.id) {
            await client.tui.publish({
              type: 'tui.session.select',
              sessionID: created.id,
              reason: String(p.reason ?? 'context.clear'),
            });
          }
          break;
        }
        case 'prompt.inject': {
          const text = String(p.text ?? '');
          // Session ownership lives at the plugin layer: the plugin knows
          // its ambient session from host hooks, NOT from core's event
          // payload (core never carries sessionID). Out-of-hook delivery
          // needs a plugin session-tracker which is not yet wired here;
          // log + drop until it is.
          await client.app.log({
            body: {
              service: AET_PLUGIN_ID,
              level: 'warn',
              message: `prompt.inject out-of-hook delivery needs a plugin session tracker; text not delivered`,
              extra: { text },
            },
          });
          break;
        }
        case 'prompt.inject_system': {
          // No direct system-prompt injection API outside of
          // experimental.chat.system.transform hook. Log + degrade.
          await client.app.log({
            body: {
              service: AET_PLUGIN_ID,
              level: 'info',
              message: `prompt.inject_system received; requires system_transform hook`,
              extra: { text: String(p.text ?? '') },
            },
          });
          break;
        }
        case 'hook.prompt': {
          // BLOCKING step hook — text served as CLI's direct return. Out
          // of hook we have no output to mutate; log it for visibility
          // (a session tracker, when wired, could deliver it via
          // client.session.prompt).
          await client.app.log({
            body: {
              service: AET_PLUGIN_ID,
              level: 'info',
              message: `hook.prompt received out-of-hook; text not delivered to agent`,
              extra: { text: String(p.text ?? '') },
            },
          });
          break;
        }
        case 'hook.func': {
          // NON-BLOCKING script-execution declaration. OpenCode has no
          // generic in-process spawn surfaced via the plugin API; log +
          // degrade. Future: run host-side.
          const cmd = String((p as { command?: unknown }).command ?? '');
          await client.app.log({
            body: {
              service: AET_PLUGIN_ID,
              level: 'info',
              message: `hook.func received; OpenCode cannot execute in-process`,
              extra: {
                command: cmd,
                args: (p as { args?: unknown }).args,
                cwd: (p as { cwd?: unknown }).cwd,
              },
            },
          });
          break;
        }
        case 'error': {
          // R9: errors are NEVER silenced. Log at error level.
          await client.app.log({
            body: {
              service: AET_PLUGIN_ID,
              level: 'error',
              message: `[AET ERROR ${p.code ?? 'UNKNOWN'}] ${p.message ?? ''}`,
            },
          });
          break;
        }
        default:
          // Unknown event — log + skip.
          await client.app.log({
            body: {
              service: AET_PLUGIN_ID,
              level: 'debug',
              message: `unknown event ${ev.id}; ignored`,
              extra: { payload: p },
            },
          });
          break;
      }
    } catch (err) {
      // Per R9, errors from applying events must surface — never silent.
      await client.app.log({
        body: {
          service: AET_PLUGIN_ID,
          level: 'error',
          message: `failed to apply ${ev.id}: ${(err as Error).message}`,
        },
      });
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
