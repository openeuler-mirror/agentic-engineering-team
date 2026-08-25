import type { PermissionsFormat } from '../../base-agent';
import { PythonHookWriter } from './python-hook-base';

export class CodexHooksWriter extends PythonHookWriter {
  readonly format: PermissionsFormat = 'codex_hooks';
  protected readonly matcher = 'Bash|Edit|Write';
  protected readonly eventName = 'PreToolUse' as const;
  protected readonly timeout = 5;
  protected readonly valueVar = 'cmd';
  protected buildPreamble(): string {
    return `cmd=(d.get("tool_input")or{}).get("command","")or""`;
  }
}
