import type { PermissionsFormat } from '../../base-agent';
import type { PermissionWriter, PermissionWriterContext, PermissionWriterResult } from '../permission-writer';

export class NoneWriter implements PermissionWriter {
  readonly format: PermissionsFormat = 'none';

  apply(_ctx: PermissionWriterContext): PermissionWriterResult {
    return { updated: false, skipped: true, note: 'no native permission support' };
  }
}
