/**
 * prepare — create snapshot backups for a revision session.
 */

import { access, copyFile, mkdir, readdir, stat, writeFile, realpath, readFile, rm, lstat } from 'node:fs/promises';
import { join, basename, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { SESSIONS_DIR, sessionDirFor, LOG_FILE_NAME, snapshotFileName } from './utils';
import { generateSessionHash } from './utils';
import { acquireLock, releaseLock, startHeartbeat } from './lock';
import { extensionIsText, sniffText } from './mime';

export const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const DEFAULT_TTL_HOURS = 24;

let maxFileSize = DEFAULT_MAX_FILE_SIZE;
let ttlHours = DEFAULT_TTL_HOURS;

export function setPrepareOptions(opts: { maxSize?: number; ttl?: number }) {
  if (opts.maxSize !== undefined) maxFileSize = opts.maxSize;
  if (opts.ttl !== undefined) ttlHours = opts.ttl;
}

async function logsDirPath() {
  return join(SESSIONS_DIR, '.logs');
}

async function log(level: string, message: string, context: Record<string, unknown> = {}) {
  try {
    const dir = await logsDirPath();
    await mkdir(dir, { recursive: true });
    const timestamp = new Date().toISOString();
    await writeFile(join(dir, LOG_FILE_NAME), `[${timestamp}] [${level}] ${message} ${JSON.stringify(context)}\n`, {
      flag: 'a',
    });
  } catch {
    /* logging must never break the pipeline */
  }
}

async function cleanupExpired() {
  try {
    const entries = await readdir(SESSIONS_DIR);
    const now = Date.now();
    const ttlMs = ttlHours * 60 * 60 * 1000;

    for (const entry of entries) {
      if (entry === '.logs' || entry.startsWith('.')) continue;

      const dir = sessionDirFor(entry);
      try {
        const meta = JSON.parse(await readFile(join(dir, '.session-meta.json'), 'utf-8'));
        const createdAt = new Date(meta.createdAt).getTime();
        if (now - createdAt > ttlMs) {
          await rm(dir, { recursive: true, force: true });
          await log('INFO', 'Cleaned up expired session', { sessionHash: entry, ttlHours });
        }
      } catch {
        try {
          const s = await stat(dir);
          if (now - s.mtimeMs > ttlMs) {
            await rm(dir, { recursive: true, force: true });
            await log('INFO', 'Cleaned up stale session (no meta)', { sessionHash: entry });
          }
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* SESSIONS_DIR may not exist yet */
  }
}

interface NormalizedEntry {
  path: string;
  isSymlink: boolean;
  originalPath?: string;
  error?: string;
}

async function normalizePath(filePath: string): Promise<NormalizedEntry> {
  try {
    const lst = await lstat(filePath);
    if (lst.isSymbolicLink()) {
      return { path: await realpath(filePath), isSymlink: true, originalPath: filePath };
    }
  } catch {
    /* fall through */
  }
  try {
    return { path: resolve(filePath), isSymlink: false };
  } catch (error) {
    return { path: filePath, isSymlink: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function isTextFile(filePath: string, fileName: string) {
  if (extensionIsText(fileName)) return { isText: true, method: 'extension' };
  const sniffed = await sniffText(fileName, filePath);
  if (sniffed) return sniffed;
  return { isText: true, method: 'sniff-fallback' };
}

export async function prepare(sourcePaths: string[]): Promise<unknown> {
  if (sourcePaths.length === 0) {
    return {
      success: false,
      files: [],
      message: 'Missing required argument: --source <sourcePath> (specify at least one)',
    };
  }

  const sessionHash = await generateSessionHash(sourcePaths);
  const sessionDir = sessionDirFor(sessionHash);
  const manifestPath = join(sessionDir, 'manifest.json');
  const metaPath = join(sessionDir, '.session-meta.json');

  await log('INFO', 'Starting prepare', { sessionHash, sourcePaths, maxFileSize, ttlHours });
  await cleanupExpired();

  await mkdir(SESSIONS_DIR, { recursive: true });
  await mkdir(sessionDir, { recursive: true });

  const acquired = await acquireLock(sessionDir);
  if (!acquired) {
    await log('WARN', 'Lock contention', { sessionHash });
    return { success: false, files: [], sessionHash, message: 'Session locked (another revision in progress)' };
  }
  const stopHeartbeat = startHeartbeat(sessionDir);

  try {
    let manifest: any;
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
    } catch {
      manifest = { files: [], createdAt: new Date().toISOString() };
    }

    await writeFile(
      metaPath,
      JSON.stringify({ createdAt: manifest.createdAt || new Date().toISOString(), ttlHours, lastAccess: new Date().toISOString() }, null, 2),
    );

    const files: any[] = manifest.files || [];
    const addedFiles: any[] = [];
    const skippedFiles: any[] = [];
    const errors: Record<string, unknown>[] = [];

    for (const sourcePath of sourcePaths) {
      const normalized = await normalizePath(sourcePath);
      if (normalized.error) {
        errors.push({ sourcePath, message: `Failed to normalize path: ${normalized.error}` });
        continue;
      }
      const normalizedPath = normalized.path;
      if (normalized.isSymlink) {
        await log('WARN', 'Source file is symlink', { originalPath: sourcePath, resolvedPath: normalizedPath });
      }

      try {
        await access(normalizedPath);
      } catch {
        errors.push({ sourcePath, normalizedPath, message: `Source file does not exist: ${sourcePath}` });
        continue;
      }

      const size = await statSize(normalizedPath);
      if (size.error) {
        errors.push({ sourcePath, message: `Failed to stat: ${size.error}` });
        continue;
      }
      if ((size.value ?? 0) > maxFileSize) {
        errors.push({ sourcePath, message: `File exceeds size limit (${size.value} bytes > ${maxFileSize} bytes)` });
        continue;
      }

      const textCheck = await isTextFile(normalizedPath, basename(normalizedPath));
      if (!textCheck.isText) {
        errors.push({ sourcePath, normalizedPath, message: `Not a text document: ${textCheck.reason ?? 'binary'}` });
        continue;
      }

      const existingIndex = files.findIndex((f) => f.normalizedPath === normalizedPath);
      if (existingIndex !== -1) {
        // Already snapshotted in THIS session: keep the A1 baseline. A2 means
        // the user may already be editing the source — re-copying the current
        // bytes over the snapshot would freeze their edits into the baseline
        // and silently erase the only record of what changed. Note the skip so
        // the agent sees the session already covers this path.
        const old = files[existingIndex];
        skippedFiles.push(normalizedPath);
        await log('INFO', 'Snapshot already exists; skipping (keeps A1 baseline)', { sourcePath, snapshotId: old.snapshotId });
        continue;
      }

      const fileName = basename(normalizedPath);
      const snapId = createHash('sha256').update(fileName).digest('hex').slice(0, 10);
      const snapshotPath = join(sessionDir, snapshotFileName(fileName));

      try {
        await copyFile(normalizedPath, snapshotPath);
        const entry = {
          sourcePath,
          normalizedPath,
          snapshotPath,
          snapshotFileName: basename(snapshotPath),
          snapshotId: createHash('sha256').update(fileName).digest('hex').slice(0, 10),
          fileName,
          fileSize: size.value,
          isSymlink: normalized.isSymlink,
        };
        files.push(entry);
        addedFiles.push(entry);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push({ sourcePath, message: `Failed to create backup: ${err.message}` });
      }
    }

    manifest.files = files;
    manifest.updatedAt = new Date().toISOString();
    try {
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errors.push({ sourcePath: 'manifest', message: `Failed to write manifest: ${err.message}` });
    }

    if (errors.length > 0 && files.length === 0) {
      return { success: false, sessionHash, sessionDir, files: [], errors, message: 'All files failed to prepare.' };
    }

    return {
      success: true,
      sessionHash,
      sessionDir,
      files,
      newFiles: addedFiles,
      skippedFiles: skippedFiles.length > 0 ? skippedFiles : undefined,
      errors: errors.length > 0 ? errors : undefined,
      ttlHours,
      message: skippedFiles.length > 0
        ? `${addedFiles.length} file(s) added, ${skippedFiles.length} already snapshotted (A1 baseline kept).`
        : `${addedFiles.length} file(s) added. Session expires in ${ttlHours} hours.`,
    };
  } finally {
    stopHeartbeat();
    await releaseLock(sessionDir);
  }
}

async function statSize(p: string): Promise<{ value?: number; error?: string }> {
  try {
    const s = await stat(p);
    return { value: s.size };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}