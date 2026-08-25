import type { PermissionsFormat } from '../../base-agent';
import type { PermissionWriter, PermissionWriterContext, PermissionWriterResult } from '../permission-writer';
import { loadJsonConfig, saveJsonConfig } from './base';

export abstract class JsonDenyArrayWriter implements PermissionWriter {
  abstract readonly format: PermissionsFormat;
  protected abstract readonly writeTool: 'Edit' | 'Write';
  protected readonly setVersion: boolean = false;

  apply(ctx: PermissionWriterContext): PermissionWriterResult {
    const existing = loadJsonConfig(ctx.permFile);
    if (this.setVersion) existing.version = 1;
    existing.permissions = existing.permissions || {};
    existing.permissions.deny = existing.permissions.deny || [];
    const denyArr: string[] = existing.permissions.deny;
    const toAdd: string[] = [
      ...(ctx.deny.read ?? []).map((p) => `Read(${p})`),
      ...(ctx.deny.write ?? []).map((p) => `${this.writeTool}(${p})`),
    ];
    let changed = false;
    for (const item of toAdd) {
      if (!denyArr.includes(item)) {
        denyArr.push(item);
        changed = true;
      }
    }
    if (!changed) return { updated: false, skipped: true };
    saveJsonConfig(ctx.permFile, existing);
    return { updated: true, skipped: false };
  }
}
