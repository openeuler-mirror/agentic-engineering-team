import type { PermissionsFormat } from '../../base-agent';
import { PythonHookWriter } from './python-hook-base';

export class TraeHooksWriter extends PythonHookWriter {
  readonly format: PermissionsFormat = 'trae_hooks';
  protected readonly matcher = 'Read|Edit|Write';
  protected readonly eventName = 'PreToolUse' as const;
  protected readonly timeout = 5;
  protected readonly valueVar = 'fp';
  protected buildPreamble(): string {
    return `fp=d.get("tool_input",{}).get("file_path","")or""`;
  }
}
