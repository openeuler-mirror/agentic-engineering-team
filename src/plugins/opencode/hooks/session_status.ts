/**
 * @file src/plugins/opencode/hooks/session_status.ts
 *
 * Passive hook: `event` (新方案.md §3.1).
 *
 * OpenCode's `event` hook fires for many event types (per ctx7 docs):
 *   session.created, session.compacted, session.deleted, session.idle,
 *   session.status, session.updated, message.updated, message.removed,
 *   tui.prompt.append, tui.command.execute, tui.toast.show, etc.
 *
 * The legacy AET plugin used this hook to drive step-state-machine
 * transitions on session idle / busy / abort. The new Core is stateless
 * — the caller tracks step state explicitly via `aet workflow handover`.
 * So this hook is now a STUB: it observes the events and logs them.
 *
 * Future: if Core adds session.* input events, this hook may forward them
 * via `aet session ...` and apply returned events (context.clear,
 * prompt.inject, ...).
 */

import { AET_PLUGIN_ID } from '../constants.js';
import type { PluginContext } from '../types.js';

/** Event payload shape for OpenCode's `event` hook. */
interface EventHookPayload {
  type: string;
  // OpenCode events carry various fields; we use only sessionID.
  sessionID?: string;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Build the `event` hook handler. Filters for session-status and abort events
 * and logs them. Returns the handler so the plugin entry can return its hooks
 * object (the OpenCode Plugin API contract). The hook receives
 * `{ event: Event }` — destructure it before reading event fields.
 */
export function registerSessionStatusHook(ctx: PluginContext): (input: unknown) => Promise<void> {
  return async (rawInput: unknown): Promise<void> => {
    // OpenCode passes `{ event }`; the SDK Event carries `type` + `properties`.
    const event = (rawInput as { event?: EventHookPayload }).event;
    if (!event?.type) return;

    // Filter: only act on session-status and abort events.
    switch (event.type) {
      case 'session.idle':
      case 'session.status': {
        await ctx.client.app.log({
          body: {
            service: AET_PLUGIN_ID,
            level: 'debug',
            message: `session ${event.type} (properties=${JSON.stringify(event.properties)})`,
            extra: { properties: event.properties },
          },
        });
        break;
      }
      case 'message.updated': {
        const props = event.properties ?? {};
        if (props.error === 'MessageAbortedError' || props.error === 'Aborted') {
          await ctx.client.app.log({
            body: {
              service: AET_PLUGIN_ID,
              level: 'info',
              message: 'session aborted (message.updated)',
              extra: { properties: event.properties },
            },
          });
        }
        break;
      }
      default:
        // Other event types — ignore. (Avoid log spam on message.part.* etc.)
        return;
    }
  };
}
