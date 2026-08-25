/**
 * PermissionWriter — pluggable per-format permission-deny writer interface.
 *
 * A writer owns ONLY the format-specific file mutation logic (parse + update
 * + write). It does NOT touch the manifest — manifest recording is uniform
 * across all formats and stays in the orchestrator (BaseAgent.setup), which
 * records PRODUCED (fresh file, hash-tracked) or RECOVERED (pre-existing)
 * based on the writer's {updated, skipped} return + whether the file
 * pre-existed. This keeps writers pure format logic (reusable) and the
 * uniform recording logic in one place.
 */
import type { PermissionsFormat } from '../base-agent';

export interface PermissionWriterContext {
  /** Absolute path to the permission file. */
  permFile: string;
  /** Deny buckets from agents.json (config.permissions.deny). */
  deny: { read?: string[]; write?: string[] };
}

export interface PermissionWriterResult {
  updated: boolean;
  skipped: boolean;
  note?: string;
}

export interface PermissionWriter {
  readonly format: PermissionsFormat;
  apply(ctx: PermissionWriterContext): PermissionWriterResult;
}
