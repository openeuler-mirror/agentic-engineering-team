import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { PermissionsFormat } from '../../base-agent';
import type { PermissionWriter, PermissionWriterContext, PermissionWriterResult } from '../permission-writer';
import { ensureParentDir } from '../shared';

/**
 * Convert a glob-style pattern (containing `*`) into a JavaScript regex
 * source string for the omp `.ts` hook. The regex is anchored (`^...$`)
 * by the caller; here we only escape regex metacharacters that should
 * match literally, then translate `*` into `[^/]+` (matches path segments,
 * not `/`).
 *
 * Extracted as a pure function so the escaping logic is unit-testable in
 * isolation (previously inlined in apply() — lines.push string-concat
 * was hard to test directly). Covers all JS regex metacharacters:
 * `\ / . + ^ $ ( ) [ ] | ? *`.
 *
 * Note: `-` is intentionally NOT escaped — it is only a regex metacharacter
 * inside a character class `[]`, and we never emit one. `:`, `=`, `<`, `>`,
 * `{`, `}` are NOT regex metacharacters and need no escaping.
 *
 * Implementation: 2-step, order-independent within each step:
 *   1. Single char-class escape: escapes ALL regex metachars including `*`
 *      in one pass using the set `[.*+?^$()|[\]\\/]`. This matches the
 *      same 13 chars the old 12-chain escaped (`\ / . + ^ $ ( ) [ ] | ? *`),
 *      plus `*` which step 2 converts. `{` and `}` are deliberately NOT
 *      in the set — they are only special as quantifiers (`{3,5}`), and
 *      the old implementation + tests establish the convention of leaving
 *      them literal. Each char in the class is matched independently by
 *      the regex engine, so adding/removing a char can't break another
 *      char's escaping.
 *   2. Convert the escaped `\*` (backslash + asterisk) to `[^/]+`.
 *      This is safe because step 1 turned every `*` into `\*`, so the
 *      only `*` characters remaining are inside `\*` sequences.
 *
 * Previous implementation used 12 chained `.replace()` calls where order
 * was critical (`\` MUST be first, `*` MUST be last). This 2-step version
 * eliminates that order-coupling fragility.
 */
export function patternToRegex(p: string): string {
  return p
    .replace(/[.*+?^$()|[\]\\/]/g, '\\$&')
    .replace(/\\\*/g, '[^/]+');
}

export class OmpHooksWriter implements PermissionWriter {
  readonly format: PermissionsFormat = 'omp_hooks';

  apply(ctx: PermissionWriterContext): PermissionWriterResult {
    const combined = [...new Set([
      ...(ctx.deny.read ?? []),
      ...(ctx.deny.write ?? []),
    ])];
    if (combined.length === 0) {
      return { updated: false, skipped: true };
    }
    const strPatterns: string[] = [];
    const reLines: string[] = [];
    for (const p of combined) {
      if (p.includes('*')) {
        reLines.push(`  /^${patternToRegex(p)}$/,`);
      } else {
        strPatterns.push(p);
      }
    }
    const lines: string[] = [
      `import type { HookAPI } from "@oh-my-pi/pi-coding-agent/hooks";`,
      ``,
    ];
    if (strPatterns.length > 0) {
      lines.push(
        `const __strP: string[] = [`,
        ...strPatterns.map((p) => `  ${JSON.stringify(p)},`),
        `];`,
        ``,
      );
    }
    if (reLines.length > 0) {
      lines.push(
        `const __reP: RegExp[] = [`,
        ...reLines,
        `];`,
        ``,
      );
    }
    lines.push(
      `export default function (pi: HookAPI): void {`,
      `  pi.on("tool_call", async (event) => {`,
      `    const ___t = event.toolName;`,
      `    const ___i = (event as any).input ?? {};`,
      `    const ___cmd = ___t === "bash" ? String(___i.command ?? "") : "";`,
      `    const ___fp = ["read", "write", "edit"].includes(___t) ? String(___i.filePath ?? ___i.path ?? "") : "";`,
      `    const ___v = ___cmd || ___fp;`,
      `    if (!___v) return;`,
    );
    if (strPatterns.length > 0) {
      lines.push(
        `    for (const ___s of __strP) { if (___v.includes(___s)) return { block: true, reason: "blocked by aet-design-env policy" }; }`,
      );
    }
    if (reLines.length > 0) {
      lines.push(
        `    for (const ___r of __reP) { if (___r.test(___v)) return { block: true, reason: "blocked by aet-design-env policy" }; }`,
      );
    }
    lines.push(
      `  });`,
      `}`,
      ``,
    );
    const tsContent = lines.join('\n');
    if (existsSync(ctx.permFile)) {
      const existingContent = readFileSync(ctx.permFile, 'utf-8');
      if (existingContent === tsContent) {
        return { updated: false, skipped: true };
      }
    }
    ensureParentDir(ctx.permFile);
    writeFileSync(ctx.permFile, tsContent, 'utf-8');
    return { updated: true, skipped: false };
  }
}
