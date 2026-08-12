import type { PermissionsFormat } from '../../base-agent';
import { PythonHookWriter } from './python-hook-base';

export class GeminiHooksWriter extends PythonHookWriter {
  readonly format: PermissionsFormat = 'gemini_hooks';
  protected readonly matcher = '*';
  protected readonly eventName = 'BeforeTool' as const;
  protected readonly timeout = 5000;
  protected readonly setVersion = false;
  protected readonly valueVar = 'v';
  protected buildPreamble(): string {
    return `ti=(d.get("tool_input")or{});cmd=(ti.get("command")or"");fp=(ti.get("file_path")or"");v=cmd or fp`;
  }
  protected buildCondition(joinedPatterns: string): string {
    return `v and(${joinedPatterns})`;
  }
}
