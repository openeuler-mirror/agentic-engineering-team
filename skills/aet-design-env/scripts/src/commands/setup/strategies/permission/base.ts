import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { ensureParentDir } from '../shared';

export function loadJsonConfig(permFile: string): Record<string, any> {
  if (!existsSync(permFile)) return {};
  try {
    const parsed = JSON.parse(readFileSync(permFile, 'utf-8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveJsonConfig(permFile: string, data: Record<string, any>): void {
  ensureParentDir(permFile);
  writeFileSync(permFile, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}
