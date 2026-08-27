/**
 * finalize — compare snapshots against current sources, extract hunks,
 * then destroy the session only when every file's evidence was captured.
 *
 * Invariant: snapshots are immutable baselines. finalize NEVER writes back
 * to a snapshot — the user's current source is the "new" side and the A1
 * snapshot is the "old" side, so edits made during A2 are always visible in
 * the diff. If a file can't be compared (source/snapshot missing, read/parse
 * error), the session is retained (with TTL cleanup later) so the evidence is
 * never destroyed on a failure.
 */

import { access, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SESSIONS_DIR, sessionDirFor, LOG_FILE_NAME, readTextCanonical } from './utils';
import { generateSessionHash } from './utils';
import { acquireLock, releaseLock, startHeartbeat } from './lock';
import { convertToHunks, calculateSummary, generateUnifiedDiff } from './diff';

export async function finalize(sourcePaths: string[]): Promise<unknown> {
  if (sourcePaths.length === 0) {
    return {
      success: false,
      files: [],
      summary: { totalAdditions: 0, totalDeletions: 0, totalModifications: 0 },
      message: 'Missing required argument: --source <sourcePath> (specify at least one file from the revision session)',
    };
  }

  const sessionHash = await generateSessionHash(sourcePaths);
  const sessionDir = sessionDirFor(sessionHash);
  const manifestPath = join(sessionDir, 'manifest.json');
  const metaPath = join(sessionDir, '.session-meta.json');

  await log('INFO', 'Starting finalize', { sessionHash, sourcePaths });

  for (const [p, what] of [
    [sessionDir, 'session'],
    [manifestPath, 'manifest'],
  ] as const) {
    const ok = await access(p).then(() => true).catch(() => false);
    if (!ok) {
      return {
        success: false,
        sessionHash,
        sessionDir,
        files: [],
        summary: { totalAdditions: 0, totalDeletions: 0, totalModifications: 0 },
        message:
          what === 'session'
            ? `No revision session found for this path. Session hash: ${sessionHash}. Call prepare first.`
            : 'No manifest.json found in session directory. Session may have been cleaned up.',
      };
    }
  }

  // Any per-file failure below retains the session (no evidence destroyed).
  // The caller needs to know whether the session still exists regardless of
  // the success flag — mirror the success-path `sessionRetained` so early
  // returns are unambiguous.

  const acquired = await acquireLock(sessionDir);
  if (!acquired) {
    await log('WARN', 'Lock contention', { sessionHash });
    return {
      success: false,
      sessionHash,
      files: [],
      sessionRetained: true,
      message: 'Session locked (already being finalized?)',
    };
  }
  const stopHeartbeat = startHeartbeat(sessionDir);

  try {
    let manifest: any;
    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
    } catch (error) {
      await log('ERROR', 'Failed to read manifest', { sessionHash, error: String(error) });
      return {
        success: false,
        sessionHash,
        files: [],
        summary: { totalAdditions: 0, totalDeletions: 0, totalModifications: 0 },
        message: 'Failed to read manifest',
      };
    }

    if (!manifest.files || manifest.files.length === 0) {
      return {
        success: false,
        sessionHash,
        files: [],
        summary: { totalAdditions: 0, totalDeletions: 0, totalModifications: 0 },
        message: 'Manifest has no files. Nothing to process.',
      };
    }

    try {
      await writeFile(metaPath, JSON.stringify({ ...manifest, lastAccess: new Date().toISOString(), status: 'processing' }, null, 2));
    } catch {
      /* ignore */
    }

    const processedFiles: any[] = [];
    let totalAdditions = 0;
    let totalDeletions = 0;
    let totalModifications = 0;
    let hasAnyChanges = false;
    let failedCount = 0;

    for (const fileEntry of manifest.files) {
      const sourcePath: string = fileEntry.normalizedPath || fileEntry.sourcePath;
      const { snapshotPath, snapshotId, fileName } = fileEntry;

      const base = {
        sourcePath,
        fileName,
        snapshotId,
        hunks: [],
        summary: { additions: 0, deletions: 0, modifications: 0 },
      } as any;

      const sourceExists = await access(sourcePath).then(() => true).catch(() => false);
      if (!sourceExists) {
        failedCount++;
        processedFiles.push({ ...base, success: false, message: `Source file no longer exists: ${sourcePath}` });
        await log('WARN', 'Source file missing', { sessionHash, sourcePath });
        continue;
      }

      const snapshotExists = await access(snapshotPath).then(() => true).catch(() => false);
      if (!snapshotExists) {
        failedCount++;
        processedFiles.push({ ...base, success: false, message: `Snapshot file missing: ${snapshotPath}` });
        await log('ERROR', 'Snapshot file missing', { sessionHash, sourcePath, snapshotPath });
        continue;
      }

      try {
        // Diff the CURRENT source (user's newest state) against the A1
        // snapshot — a fully immutable baseline. Snapshots are NEVER
        // rewritten here: writing the source back over the snapshot would
        // make the user's edits invisible to the diff and destroy the only
        // record of what changed. Both sides are normalized (BOM stripped,
        // line endings unified to LF), so a Windows editor re-saving with
        // CRLF cannot produce spurious whole-file hunks.
        const [oldContent, newContent] = await Promise.all([
          readTextCanonical(snapshotPath),
          readTextCanonical(sourcePath),
        ]);

        const hunks = convertToHunks(oldContent, newContent);
        const summary = calculateSummary(hunks);
        const hasChanges = hunks.length > 0;

        if (hasChanges) {
          hasAnyChanges = true;
          totalAdditions += summary.additions;
          totalDeletions += summary.deletions;
          totalModifications += summary.modifications;
        }

        const unifiedDiff = hasChanges ? generateUnifiedDiff(hunks, snapshotPath, sourcePath) : '';

        processedFiles.push({
          ...base,
          success: true,
          hasChanges,
          hunks,
          summary,
          unifiedDiff,
          message: hasChanges
            ? `${hunks.length} hunks detected (${summary.additions} additions, ${summary.deletions} deletions)`
            : 'No changes detected.',
        });
      } catch (error) {
        failedCount++;
        processedFiles.push({ ...base, success: false, message: `Failed to compare files: ${String(error)}` });
        await log('ERROR', 'Failed to compare files', { sessionHash, sourcePath, error: String(error) });
      }
    }

    // Destroy the session ONLY if every file's evidence was captured. Any
    // failed file means the session may hold the only record of the user's
    // edits — retain it (TTL cleanup reaps it later) and say so explicitly
    // instead of silently destroying the evidence.
    const cleanupErrors: { path: string; error: string }[] = [];
    if (failedCount === 0) {
      try {
        await rm(sessionDir, { recursive: true, force: true });
      } catch (error) {
        cleanupErrors.push({ path: sessionDir, error: String(error) });
      }

      if (cleanupErrors.length > 0) {
        await log('WARN', 'Cleanup failed', { sessionHash, cleanupErrors });
      } else {
        await log('INFO', 'Cleanup completed', { sessionHash });
      }
    } else {
      cleanupErrors.push({
        path: sessionDir,
        error: `session retained for inspection (${failedCount} file(s) failed)`,
      });
      await log('WARN', 'Session retained (per-file failures)', { sessionHash, failedCount });
    }

    const result = {
      success: true,
      sessionHash,
      sessionDir,
      files: processedFiles,
      summary: { totalAdditions, totalDeletions, totalModifications },
      hasAnyChanges,
      canProceedToNextStep: !hasAnyChanges,
      sessionRetained: failedCount > 0,
      cleanupErrors: cleanupErrors.length > 0 ? cleanupErrors : undefined,
      message:
        failedCount > 0
          ? `Session finalized with ${failedCount} file(s) failing; session retained for inspection.`
          : hasAnyChanges
            ? `Session finalized. ${processedFiles.length} files processed, ${totalModifications} hunks total. Cleanup completed.`
            : 'Session finalized. No changes detected. Cleanup completed. You may proceed to next step.',
    };
    await log('INFO', 'finalize completed', { sessionHash, hasChanges: hasAnyChanges, sessionRetained: failedCount > 0 });
    return result;
  } finally {
    stopHeartbeat();
    try {
      await releaseLock(sessionDir);
    } catch {
      /* session dir may be gone */
    }
  }
}

async function log(level: string, message: string, context: Record<string, unknown> = {}) {
  try {
    const dir = join(SESSIONS_DIR, '.logs');
    await mkdir(dir, { recursive: true });
    const timestamp = new Date().toISOString();
    await writeFile(join(dir, LOG_FILE_NAME), `[${timestamp}] [${level}] ${message} ${JSON.stringify(context)}\n`, {
      flag: 'a',
    });
  } catch {
    /* ignore */
  }
}