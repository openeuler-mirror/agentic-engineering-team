import type { PermissionsFormat } from '../../base-agent';
import type { PermissionWriter, PermissionWriterContext, PermissionWriterResult } from '../permission-writer';
import { readFileText, writeFileText } from '../../../../util';
import { ensureParentDir } from '../shared';

export class CursorIgnoreWriter implements PermissionWriter {
  readonly format: PermissionsFormat = 'cursor_ignore';

  apply(ctx: PermissionWriterContext): PermissionWriterResult {
    const all = [...new Set([
      ...(ctx.deny.read ?? []),
      ...(ctx.deny.write ?? []),
    ])];
    const text = readFileText(ctx.permFile);
    const lines = text ? text.split('\n') : [];
    const toAdd = all.filter((p) => !lines.includes(p));
    if (toAdd.length === 0) {
      return { updated: false, skipped: true };
    }
    const newText = (text ? text.replace(/\s*$/, '\n') : '') + toAdd.join('\n') + '\n';
    ensureParentDir(ctx.permFile);
    writeFileText(ctx.permFile, newText);
    return { updated: true, skipped: false };
  }
}
