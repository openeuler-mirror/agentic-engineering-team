import type { PermissionsFormat } from '../../base-agent';
import { JsonDenyArrayWriter } from './json-deny-array-base';

export class ClaudeSettingsWriter extends JsonDenyArrayWriter {
  readonly format: PermissionsFormat = 'claude_settings';
  protected readonly writeTool = 'Edit' as const;
  protected readonly setVersion = false;
}
