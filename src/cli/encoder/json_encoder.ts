/**
 * @file src/cli/encoder/json_encoder.ts
 *
 * Layer 3 — JSON output encoder.
 *
 * Encodes a CommandResult as a single-line JSON string for the host plugin
 * to consume (新方案.md §3.2 "JSON 模式"). This is the canonical output
 * mode for plugins that translate downstream events into host-specific API
 * calls themselves.
 */

import type { CommandResult } from '../../definitions/events.js';

export function encodeJson(result: CommandResult): string {
  return JSON.stringify(result);
}
