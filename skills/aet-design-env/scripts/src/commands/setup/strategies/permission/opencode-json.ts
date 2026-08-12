import type { PermissionsFormat } from '../../base-agent';
import type { PermissionWriter, PermissionWriterContext, PermissionWriterResult } from '../permission-writer';
import { loadJsonConfig, saveJsonConfig } from './base';

export class OpencodeJsonWriter implements PermissionWriter {
  readonly format: PermissionsFormat = 'opencode_json';

  apply(ctx: PermissionWriterContext): PermissionWriterResult {
    const existing = loadJsonConfig(ctx.permFile);
    existing.permission = existing.permission ?? {};
    const toolPaths: Array<{ tool: 'read' | 'edit'; paths?: string[] }> = [
      { tool: 'read', paths: ctx.deny.read },
      { tool: 'edit', paths: ctx.deny.write },
    ];
    let changed = false;
    for (const { tool, paths } of toolPaths) {
      if (!paths || paths.length === 0) continue;
      const existingVal = existing.permission[tool];
      let rules: Record<string, string>;
      if (typeof existingVal === 'string') {
        rules = { '*': existingVal };
      } else if (existingVal && typeof existingVal === 'object' && !Array.isArray(existingVal)) {
        rules = existingVal as Record<string, string>;
      } else {
        rules = {};
      }
      for (const p of paths) {
        if (rules[p] !== 'deny') {
          rules[p] = 'deny';
          changed = true;
        }
      }
      existing.permission[tool] = rules;
    }
    if (!changed) return { updated: false, skipped: true };
    saveJsonConfig(ctx.permFile, existing);
    return { updated: true, skipped: false };
  }
}
