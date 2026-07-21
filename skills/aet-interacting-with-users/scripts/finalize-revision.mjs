#!/usr/bin/env node
/**
 * Finalize Revision Script (Session-Isolated with Security Fixes)
 *
 * Reads session manifest, compares all source files with backups.
 * Generates diff hunks.
 * Cleans up all snapshots and manifest after processing.
 * Logs cleanup failures for later review.
 *
 * Usage: node finalize-revision.mjs --source <path1> [--source <path2> ...]
 *
 * Output: JSON with all file diffs and summary
 *
 * Requires: Node.js >= 18.0.0
 */

import { access, readFile, rm, mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname, resolve } from 'path';
import { parseArgs } from 'util';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

// Import diff utilities
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const { convertToHunks, calculateSummary, generateUnifiedDiff } = await import(
  join(__dirname, 'diff-utils.mjs')
);

// Configuration constants
const SESSION_HASH_LENGTH = 8;
const LOG_DIR_NAME = '.logs';
const LOG_FILE_NAME = 'interactive-revision.log';

// Parse arguments
const args = parseArgs({
  options: {
    source: { type: 'string', short: 's', multiple: true },
  },
  strict: true,
});

const sourcePaths = args.values.source || [];

if (sourcePaths.length === 0) {
  const result = {
    success: false,
    files: [],
    summary: { totalAdditions: 0, totalDeletions: 0, totalModifications: 0 },
    message: 'Missing required argument: --source <sourcePath> (specify at least one file from the revision session)',
  };
  console.log(JSON.stringify(result, null, 2));
  process.exit(1);
}

// Base directory for all sessions
const baseDir = join(tmpdir(), 'interactive-revision');
const logsDir = join(baseDir, LOG_DIR_NAME);
const logFilePath = join(logsDir, LOG_FILE_NAME);

/**
 * Generate session hash from source file paths
 */
function generateSessionHash(paths) {
  const normalized = paths.map(p => resolve(p)).sort().join('\n');
  return createHash('sha256').update(normalized).digest('hex').slice(0, SESSION_HASH_LENGTH);
}

/**
 * Log message to file
 */
async function logMessage(level, message, context = {}) {
  try {
    await mkdir(logsDir, { recursive: true });
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${level}] ${message} ${JSON.stringify(context)}\n`;
    await writeFile(logFilePath, logLine, { flag: 'a' });
  } catch {
    // Silently fail if logging fails
  }
}

/**
 * Check and acquire lock
 */
async function acquireLock(sessionDir) {
  const lockPath = join(sessionDir, '.lock');
  const currentPid = process.pid;

  try {
    const lockContent = await readFile(lockPath, 'utf-8');
    const lockPid = parseInt(lockContent.trim(), 10);

    if (lockPid > 0) {
      try {
        process.kill(lockPid, 0);
        return { acquired: false, reason: `Session locked by PID ${lockPid}` };
      } catch {
        // Process doesn't exist, lock is stale
      }
    }
  } catch {
    // No existing lock
  }

  await writeFile(lockPath, String(currentPid));
  return { acquired: true, pid: currentPid };
}

/**
 * Release lock
 */
async function releaseLock(sessionDir) {
  const lockPath = join(sessionDir, '.lock');
  try {
    await rm(lockPath, { force: true });
  } catch {
    // Ignore
  }
}

async function finalizeRevision() {
  const sessionHash = generateSessionHash(sourcePaths);
  const sessionDir = join(baseDir, sessionHash);
  const manifestPath = join(sessionDir, 'manifest.json');
  const metaPath = join(sessionDir, '.session-meta.json');

  await logMessage('INFO', 'Starting finalize-revision', { sessionHash, sourcePaths });

  // Check session directory exists
  const sessionExists = await access(sessionDir).then(() => true).catch(() => false);
  if (!sessionExists) {
    const result = {
      success: false,
      sessionHash,
      files: [],
      summary: { totalAdditions: 0, totalDeletions: 0, totalModifications: 0 },
      message: `No revision session found for this path. Session hash: ${sessionHash}. Call prepare-revision first.`,
    };
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  // Check manifest exists
  const manifestExists = await access(manifestPath).then(() => true).catch(() => false);
  if (!manifestExists) {
    const result = {
      success: false,
      sessionHash,
      sessionDir,
      files: [],
      summary: { totalAdditions: 0, totalDeletions: 0, totalModifications: 0 },
      message: 'No manifest.json found in session directory. Session may have been cleaned up.',
    };
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  // Acquire lock
  const lockResult = await acquireLock(sessionDir);
  if (!lockResult.acquired) {
    await logMessage('WARN', 'Failed to acquire lock', { sessionHash, reason: lockResult.reason });
    const result = { success: false, sessionHash, files: [], message: lockResult.reason };
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  try {
    // Read manifest
    let manifest;
    try {
      const manifestContent = await readFile(manifestPath, 'utf-8');
      manifest = JSON.parse(manifestContent);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const result = {
        success: false,
        sessionHash,
        files: [],
        summary: { totalAdditions: 0, totalDeletions: 0, totalModifications: 0 },
        message: `Failed to read manifest: ${err.message}`,
      };
      console.log(JSON.stringify(result, null, 2));
      await logMessage('ERROR', 'Failed to read manifest', { sessionHash, error: err.message });
      process.exit(1);
    }

    if (!manifest.files || manifest.files.length === 0) {
      const result = {
        success: false,
        sessionHash,
        files: [],
        summary: { totalAdditions: 0, totalDeletions: 0, totalModifications: 0 },
        message: 'Manifest has no files. Nothing to process.',
      };
      console.log(JSON.stringify(result, null, 2));
      process.exit(1);
    }

    // Update session meta
    try {
      await writeFile(metaPath, JSON.stringify({
        ...manifest,
        lastAccess: new Date().toISOString(),
        status: 'processing',
      }, null, 2));
    } catch {
      // Ignore
    }

    // Process each file
    const processedFiles = [];
    let totalAdditions = 0;
    let totalDeletions = 0;
    let totalModifications = 0;
    let hasAnyChanges = false;

    for (const fileEntry of manifest.files) {
      const sourcePath = fileEntry.normalizedPath || fileEntry.sourcePath;
      const { snapshotPath, snapshotId, fileName } = fileEntry;

      // Check source file exists
      const sourceExists = await access(sourcePath).then(() => true).catch(() => false);
      if (!sourceExists) {
        processedFiles.push({
          sourcePath, fileName, snapshotId,
          success: false,
          message: `Source file no longer exists: ${sourcePath}`,
          hunks: [],
          summary: { additions: 0, deletions: 0, modifications: 0 },
        });
        await logMessage('WARN', 'Source file missing', { sessionHash, sourcePath, snapshotId });
        continue;
      }

      // Check snapshot exists
      const snapshotExists = await access(snapshotPath).then(() => true).catch(() => false);
      if (!snapshotExists) {
        processedFiles.push({
          sourcePath, fileName, snapshotId,
          success: false,
          message: `Snapshot file missing: ${snapshotPath}`,
          hunks: [],
          summary: { additions: 0, deletions: 0, modifications: 0 },
        });
        await logMessage('ERROR', 'Snapshot file missing', { sessionHash, sourcePath, snapshotPath, snapshotId });
        continue;
      }

      // Read and compare files
      try {
        const [oldContent, newContent] = await Promise.all([
          readFile(snapshotPath, 'utf-8'),
          readFile(sourcePath, 'utf-8'),
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
          sourcePath, fileName, snapshotId,
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
        const err = error instanceof Error ? error : new Error(String(error));
        processedFiles.push({
          sourcePath, fileName, snapshotId,
          success: false,
          message: `Failed to compare files: ${err.message}`,
          hunks: [],
          summary: { additions: 0, deletions: 0, modifications: 0 },
        });
        await logMessage('ERROR', 'Failed to compare files', { sessionHash, sourcePath, snapshotId, error: err.message });
      }
    }

    // Cleanup
    const cleanupPaths = [...manifest.files.map(f => f.snapshotPath), manifestPath, metaPath];
    const cleanupErrors = [];
    for (const path of cleanupPaths) {
      try {
        await rm(path, { force: true });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        cleanupErrors.push({ path, error: err.message });
        await logMessage('WARN', 'Cleanup failed', { sessionHash, path, error: err.message });
      }
    }

    try {
      await rm(sessionDir, { force: true });
    } catch {
      // Ignore
    }

    if (cleanupErrors.length > 0) {
      await logMessage('WARN', 'Cleanup completed with errors', { sessionHash, cleanupErrors });
    } else {
      await logMessage('INFO', 'Cleanup completed successfully', { sessionHash });
    }

    // Build result
    const result = {
      success: true,
      sessionHash,
      files: processedFiles,
      summary: { totalAdditions, totalDeletions, totalModifications },
      hasAnyChanges,
      canProceedToNextStep: !hasAnyChanges,
      cleanupErrors: cleanupErrors.length > 0 ? cleanupErrors : undefined,
      message: hasAnyChanges
        ? `Session finalized. ${processedFiles.length} files processed, ${totalModifications} hunks total. Cleanup completed.`
        : 'Session finalized. No changes detected. Cleanup completed. You may proceed to next step.',
    };

    await logMessage('INFO', 'finalize-revision completed', {
      sessionHash,
      processedCount: processedFiles.length,
      hasChanges: hasAnyChanges,
      cleanupErrors: cleanupErrors.length,
    });

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await releaseLock(sessionDir);
  }
}

finalizeRevision();