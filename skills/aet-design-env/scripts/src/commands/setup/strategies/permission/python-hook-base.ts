import type { PermissionsFormat } from '../../base-agent';
import type { PermissionWriter, PermissionWriterContext, PermissionWriterResult } from '../permission-writer';
import { loadJsonConfig, saveJsonConfig } from './base';

export abstract class PythonHookWriter implements PermissionWriter {
  abstract readonly format: PermissionsFormat;
  protected abstract readonly matcher: string;
  protected abstract readonly eventName: 'PreToolUse' | 'BeforeTool';
  protected abstract readonly timeout: number;
  protected readonly setVersion: boolean = true;
  protected abstract readonly valueVar: string;
  protected abstract buildPreamble(): string;
  protected buildCondition(joinedPatterns: string): string {
    return `${joinedPatterns} or True==False`;
  }

  apply(ctx: PermissionWriterContext): PermissionWriterResult {
    const combined = [...new Set([...(ctx.deny.read ?? []), ...(ctx.deny.write ?? [])])];
    if (combined.length === 0) {
      return { updated: false, skipped: true };
    }
    // Each deny pattern is interpolated into the generated python script as
    // a string literal. We use `JSON.stringify(p)` to produce a valid
    // python string literal — JSON and python share the same string-literal
    // escaping for `"`, `\`, control chars (`\n`, `\t`, `\b`, ...), and
    // `\uXXXX`. This is more robust than the previous `p.replace(/"/g,
    // '\\"')` which only escaped double-quotes and left backslashes raw —
    // patterns like `C:\backup\` would silently corrupt the python script
    // (`\b` → python backspace, `\t` → tab, etc.) producing wrong match
    // semantics without any syntax error (the existing `compile()` test
    // cannot catch this — `\b` is legal python).
    //
    // For the fnmatch() call we wrap the pattern in `*...*` (substring
    // match). We pre-compute the wrapped literal via JSON.stringify of the
    // concatenated string so the same escaping applies.
    const patternLines = combined.map((p) => {
      const pyLit = JSON.stringify(p);
      const pyWrappedLit = JSON.stringify(`*${p}*`);
      return `${this.valueVar}.startswith(${pyLit}) or fnmatch.fnmatch(${this.valueVar},${pyWrappedLit})`;
    });
    const checkScript = `import sys,json,fnmatch;d=json.load(sys.stdin);${this.buildPreamble()};exit(2 if(${this.buildCondition(patternLines.join(' or '))})else 0)`;
    // Pre-compute the JSON-escaped form: `command` is built as
    // `python3 -c ${JSON.stringify(checkScript)}`, so the escaped form
    // (with surrounding `"` and internal `\"`) is the substring actually
    // present in the stored command. Using `checkScript` (raw, with `"`)
    // for the duplicate check would ALWAYS fail because `\"` ≠ `"`.
    const escapedScript = JSON.stringify(checkScript);
    const hookEntry = {
      matcher: this.matcher,
      hooks: [{
        type: 'command' as const,
        command: `python3 -c ${escapedScript}`,
        timeout: this.timeout,
      }],
    };
    const existing = loadJsonConfig(ctx.permFile);
    if (this.setVersion) existing.version = existing.version ?? 1;
    existing.hooks = existing.hooks ?? {};
    existing.hooks[this.eventName] = existing.hooks[this.eventName] ?? [];
    const arr = existing.hooks[this.eventName];
    if (!arr.some((e: any) => {
      if (!e.hooks) return false;
      return (e.hooks as any[]).some((h: any) => h.command && h.command.includes(escapedScript));
    })) {
      arr.push(hookEntry);
      saveJsonConfig(ctx.permFile, existing);
      return { updated: true, skipped: false };
    }
    return { updated: false, skipped: true };
  }
}
