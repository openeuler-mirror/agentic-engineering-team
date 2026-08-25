/**
 * Shared helpers used by both rule strategies and permission writers.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function ensureParentDir(filePath: string): void {
  const parentDir = dirname(filePath);
  if (!existsSync(parentDir)) mkdirSync(parentDir, { recursive: true });
}
