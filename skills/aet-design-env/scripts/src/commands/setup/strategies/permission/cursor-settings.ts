import type { PermissionsFormat } from '../../base-agent';
import { JsonDenyArrayWriter } from './json-deny-array-base';

export class CursorSettingsWriter extends JsonDenyArrayWriter {
  readonly format: PermissionsFormat = 'cursor_settings';
  protected readonly writeTool = 'Write' as const;
  protected readonly setVersion = true;
}
