#!/usr/bin/env node
/**
 * Prepare Revision Script (Session-Isolated with Security Fixes)
 *
 * Creates backup snapshots with unique UUID prefix.
 * Session isolation based on source file paths hash.
 * Security: path normalization, symlink check, file size limit, lock mechanism, text-only validation.
 *
 * Usage: node prepare-revision.mjs --source <path1> --source <path2> ...
 *        [--max-size <bytes>] [--ttl <hours>]
 *
 * Output: JSON with snapshot mappings
 *
 * Requires: Node.js >= 18.0.0
 */

import {
  access,
  mkdir,
  copyFile,
  writeFile,
  readFile,
  realpath,
  lstat,
  stat,
  rm,
  readdir,
} from 'fs/promises';
import { tmpdir } from 'os';
import { join, basename, dirname, resolve, isAbsolute } from 'path';
import { randomUUID, createHash } from 'crypto';
import { parseArgs } from 'util';

// Configuration constants
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_TTL_HOURS = 24;
const SESSION_HASH_LENGTH = 8;
const LOG_DIR_NAME = '.logs';
const LOG_FILE_NAME = 'interactive-revision.log';

// Parse arguments
const args = parseArgs({
  options: {
    source: { type: 'string', short: 's', multiple: true },
    'max-size': { type: 'string', default: String(DEFAULT_MAX_FILE_SIZE) },
    ttl: { type: 'string', default: String(DEFAULT_TTL_HOURS) },
  },
  strict: true,
});

const sourcePaths = args.values.source || [];
const maxFileSize = parseInt(args.values['max-size'], 10) || DEFAULT_MAX_FILE_SIZE;
const ttlHours = parseInt(args.values.ttl, 10) || DEFAULT_TTL_HOURS;

if (sourcePaths.length === 0) {
  const result = {
    success: false,
    files: [],
    message: 'Missing required argument: --source <sourcePath> (specify at least one)',
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
    // Silently fail if logging fails - don't block main operation
  }
}

/**
 * Check and acquire lock
 */
async function acquireLock(sessionDir) {
  const lockPath = join(sessionDir, '.lock');
  const currentPid = process.pid;

  try {
    // Check if lock exists
    const lockContent = await readFile(lockPath, 'utf-8');
    const lockPid = parseInt(lockContent.trim(), 10);

    // Check if process is still running (Unix-like systems)
    if (lockPid > 0) {
      try {
        // Sending signal 0 to check if process exists
        process.kill(lockPid, 0);
        // Process exists, lock is valid
        return { acquired: false, reason: `Session locked by PID ${lockPid}` };
      } catch {
        // Process doesn't exist, lock is stale - we can take it
      }
    }
  } catch {
    // No existing lock, proceed
  }

  // Write our lock
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

/**
 * Clean up old sessions based on TTL
 */
async function cleanupOldSessions() {
  try {
    const entries = await readdir(baseDir);
    const now = Date.now();
    const ttlMs = ttlHours * 60 * 60 * 1000;

    for (const entry of entries) {
      if (entry === LOG_DIR_NAME) continue;

      const sessionDir = join(baseDir, entry);
      const metaPath = join(sessionDir, '.session-meta.json');

      try {
        const metaContent = await readFile(metaPath, 'utf-8');
        const meta = JSON.parse(metaContent);
        const createdAt = new Date(meta.createdAt).getTime();

        if (now - createdAt > ttlMs) {
          await rm(sessionDir, { recursive: true, force: true });
          await logMessage('INFO', `Cleaned up expired session`, {
            sessionHash: entry,
            ttlHours,
            createdAt: meta.createdAt,
          });
        }
      } catch {
        // No meta file or invalid - check directory mtime
        try {
          const stats = await stat(sessionDir);
          if (now - stats.mtimeMs > ttlMs) {
            await rm(sessionDir, { recursive: true, force: true });
            await logMessage('INFO', `Cleaned up stale session (no meta)`, {
              sessionHash: entry,
            });
          }
        } catch {
          // Ignore
        }
      }
    }
  } catch {
    // Base dir doesn't exist or readdir failed
  }
}

/**
 * Normalize path: resolve to absolute, handle symlinks
 */
async function normalizePath(filePath) {
  try {
    // First check if it's a symlink
    const lstatResult = await lstat(filePath);
    if (lstatResult.isSymbolicLink()) {
      // Resolve symlink to real path
      const realPath = await realpath(filePath);
      return { path: realPath, isSymlink: true, originalPath: filePath };
    }

    // Not a symlink, resolve to absolute
    const absolutePath = isAbsolute(filePath) ? filePath : resolve(filePath);
    return { path: absolutePath, isSymlink: false };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Check file size
 */
async function checkFileSize(filePath) {
  try {
    const stats = await stat(filePath);
    return { size: stats.size, exceeds: stats.size > maxFileSize };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Allowed text file extensions
 * Covers common documentation, config, code, and data formats
 */
const TEXT_FILE_EXTENSIONS = new Set([
  // Documentation
  'md', 'txt', 'rst', 'adoc', 'asciidoc', 'tex', 'latex', 'log',
  // Markup
  'html', 'htm', 'xhtml', 'xml', 'svg', 'xslt', 'rss', 'atom',
  // Config
  'json', 'yaml', 'yml', 'toml', 'ini', 'conf', 'cfg', 'config', 'env',
  'properties', 'gradle', 'maven', 'pom', 'xml',
  // Data
  'csv', 'tsv', 'psv',
  // Programming languages
  'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'es6', 'es',
  'py', 'pyw', 'pyi', 'pyx',
  'java', 'kt', 'kts', 'scala', 'groovy', 'gvy',
  'c', 'cpp', 'cc', 'cxx', 'h', 'hpp', 'hh', 'hxx',
  'cs', 'vb', 'fs', 'fsx',
  'go', 'rs', 'dart', 'swift', 'm', 'mm',
  'rb', 'rake', 'gemspec', 'erb',
  'php', 'phtml', 'php3', 'php4', 'php5',
  'pl', 'pm', 't', 'pod',
  'sh', 'bash', 'zsh', 'ksh', 'csh', 'fish', 'ps1', 'bat', 'cmd',
  'sql', 'ddl', 'dml',
  'lua', 'r', 'rmd', 'jl', 'nim', 'cr', 'ex', 'exs', 'erl', 'hrl',
  'vue', 'svelte', 'astro', 'wasm.wat',
  'scss', 'sass', 'css', 'less', 'styl',
  'graphql', 'gql',
  'dockerfile', 'makefile', 'cmake', 'mk',
  // Misc
  'gitignore', 'gitattributes', 'editorconfig', 'eslintrc', 'prettierrc',
  'babelrc', 'tsconfig', 'jsconfig', 'lock', 'sum', 'mod',
  'license', 'licence', 'copying', 'authors', 'contributors',
  'readme', 'changelog', 'changes', 'history', 'news', 'todo',
  'manifest', 'meta', 'project', 'workspace', 'agents',
  'skill', 'skillmd',
]);

/**
 * Check if file is a text document
 * Uses both extension check and content inspection
 */
async function isTextFile(filePath) {
  const ext = basename(filePath).toLowerCase().split('.').pop() || '';

  // Check extension first (fast)
  if (TEXT_FILE_EXTENSIONS.has(ext)) {
    return { isText: true, method: 'extension' };
  }

  // Special cases: files without extension but known names
  const fileName = basename(filePath).toLowerCase();
  const KNOWN_TEXT_FILENAMES = new Set([
    'readme', 'changelog', 'changes', 'license', 'licence', 'copying',
    'authors', 'contributors', 'makefile', 'dockerfile', 'rakefile',
    'gemfile', 'procfile', 'vagrantfile', 'brewfile', 'podfile',
    'fastfile', 'matchfile', 'scanfile', 'circlefile', 'agents',
    'skill', 'manifest', 'meta', 'project', 'workspace',
  ]);
  if (KNOWN_TEXT_FILENAMES.has(fileName) || fileName.startsWith('agents.')) {
    return { isText: true, method: 'filename' };
  }

  // Content inspection: try to read and check for binary content
  try {
    // Read file content (limited by maxFileSize, already checked)
    const content = await readFile(filePath);

    if (content.length === 0) {
      // Empty file is considered text
      return { isText: true, method: 'empty' };
    }

    // Analyze first 8KB for binary detection
    const sampleSize = Math.min(content.length, 8192);
    const sample = content.slice(0, sampleSize);

    // Check for null bytes (strong indicator of binary)
    if (sample.includes(0x00)) {
      return { isText: false, reason: 'Contains null bytes (binary file)' };
    }

    // Check ratio of printable characters
    // Allow: printable ASCII (32-126), newline (10), tab (9), carriage return (13)
    // Also allow common UTF-8 continuation bytes (128-255 in certain contexts)
    let printableCount = 0;
    for (let i = 0; i < sampleSize; i++) {
      const byte = sample[i];
      if (
        (byte >= 32 && byte <= 126) || // Printable ASCII
        byte === 10 || // Newline
        byte === 9 ||  // Tab
        byte === 13    // Carriage return
      ) {
        printableCount++;
      }
    }

    const printableRatio = printableCount / sampleSize;

    // If more than 85% printable ASCII, likely text
    // This threshold allows UTF-8 content with multi-byte characters
    if (printableRatio >= 0.85) {
      return { isText: true, method: 'content', printableRatio };
    }

    return {
      isText: false,
      reason: `Low printable ratio (${(printableRatio * 100).toFixed(1)}%), likely binary file`,
      printableRatio,
    };
  } catch (error) {
    // If content inspection fails, be conservative and reject
    return {
      isText: false,
      reason: `Content inspection failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function prepareRevision() {
  // Generate session hash from source file paths
  const sessionHash = generateSessionHash(sourcePaths);
  const sessionDir = join(baseDir, sessionHash);
  const manifestPath = join(sessionDir, 'manifest.json');
  const metaPath = join(sessionDir, '.session-meta.json');

  // Log start
  await logMessage('INFO', 'Starting prepare-revision', {
    sessionHash,
    sourcePaths,
    maxFileSize,
    ttlHours,
  });

  // Clean up old sessions first
  await cleanupOldSessions();

  // Create directories
  await mkdir(baseDir, { recursive: true });
  await mkdir(sessionDir, { recursive: true });

  // Acquire lock
  const lockResult = await acquireLock(sessionDir);
  if (!lockResult.acquired) {
    await logMessage('WARN', 'Failed to acquire lock', {
      sessionHash,
      reason: lockResult.reason,
    });
    const result = {
      success: false,
      files: [],
      sessionHash,
      message: lockResult.reason,
    };
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  try {
    // Read existing manifest (if exists)
    let manifest;
    try {
      const manifestContent = await readFile(manifestPath, 'utf-8');
      manifest = JSON.parse(manifestContent);
    } catch {
      // No existing manifest, create new
      manifest = { files: [], createdAt: new Date().toISOString() };
    }

    // Write session meta (TTL info)
    await writeFile(metaPath, JSON.stringify({
      createdAt: manifest.createdAt || new Date().toISOString(),
      ttlHours,
      lastAccess: new Date().toISOString(),
    }, null, 2));

    // Process each source file
    const files = manifest.files || [];
    const addedFiles = [];
    const replacedFiles = [];
    const errors = [];

    for (const sourcePath of sourcePaths) {
      // Normalize path (handle symlinks, resolve absolute)
      const normalized = await normalizePath(sourcePath);

      if (normalized.error) {
        errors.push({
          sourcePath,
          message: `Failed to normalize path: ${normalized.error}`,
        });
        continue;
      }

      // Warn about symlink (but allow it - just log)
      if (normalized.isSymlink) {
        await logMessage('WARN', 'Source file is symlink', {
          originalPath: sourcePath,
          resolvedPath: normalized.path,
        });
      }

      const normalizedPath = normalized.path;

      // Check source exists
      try {
        await access(normalizedPath);
      } catch {
        errors.push({
          sourcePath,
          normalizedPath,
          message: `Source file does not exist: ${sourcePath}`,
        });
        continue;
      }

      // Check file size
      const sizeCheck = await checkFileSize(normalizedPath);
      if (sizeCheck.error) {
        errors.push({
          sourcePath,
          message: `Failed to check file size: ${sizeCheck.error}`,
        });
        continue;
      }
      if (sizeCheck.exceeds) {
        errors.push({
          sourcePath,
          message: `File exceeds size limit (${sizeCheck.size} bytes > ${maxFileSize} bytes)`,
        });
        continue;
      }

      // Check if file is a text document
      const textCheck = await isTextFile(normalizedPath);
      if (!textCheck.isText) {
        errors.push({
          sourcePath,
          normalizedPath,
          message: `Not a text document: ${textCheck.reason}`,
        });
        await logMessage('WARN', 'Rejected non-text file', {
          sourcePath,
          normalizedPath,
          reason: textCheck.reason,
        });
        continue;
      }

      const existingIndex = files.findIndex(f => f.normalizedPath === normalizedPath);
      if (existingIndex !== -1) {
        const oldEntry = files[existingIndex];
        try {
          await rm(oldEntry.snapshotPath, { force: true });
        } catch {
          // Ignore cleanup failure of old snapshot
        }
        await logMessage('INFO', 'Replacing existing snapshot', {
          sourcePath,
          normalizedPath,
          oldSnapshotId: oldEntry.snapshotId,
        });
        files.splice(existingIndex, 1);
        replacedFiles.push(normalizedPath);
      }

      const snapshotId = randomUUID();
      const fileName = basename(normalizedPath);
      const snapshotFileName = `${snapshotId}-${fileName}`;
      const snapshotPath = join(sessionDir, snapshotFileName);

      try {
        await copyFile(normalizedPath, snapshotPath);

        const newEntry = {
          sourcePath,
          normalizedPath,
          snapshotPath,
          snapshotFileName,
          snapshotId,
          fileName,
          fileSize: sizeCheck.size,
          isSymlink: normalized.isSymlink,
        };
        files.push(newEntry);
        addedFiles.push(newEntry);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push({
          sourcePath,
          message: `Failed to create backup: ${err.message}`,
        });
        await logMessage('ERROR', 'Failed to create snapshot', {
          sourcePath,
          error: err.message,
        });
      }
    }

    // Write manifest
    manifest.files = files;
    manifest.updatedAt = new Date().toISOString();

    try {
      await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errors.push({
        sourcePath: 'manifest',
        message: `Failed to write manifest: ${err.message}`,
      });
      await logMessage('ERROR', 'Failed to write manifest', {
        sessionHash,
        error: err.message,
      });
    }

    // Build result
    if (errors.length > 0 && files.length === 0) {
      const result = {
        success: false,
        sessionHash,
        sessionDir,
        files: [],
        errors,
        message: 'All files failed to prepare. See errors array for details.',
      };
      console.log(JSON.stringify(result, null, 2));
      await releaseLock(sessionDir);
      process.exit(1);
    }

    const result = {
      success: true,
      sessionHash,
      sessionDir,
      files,
      newFiles: addedFiles,
      replacedFiles: replacedFiles.length > 0 ? replacedFiles : undefined,
      errors: errors.length > 0 ? errors : undefined,
      ttlHours,
      message: replacedFiles.length > 0
        ? `${addedFiles.length - replacedFiles.length} file(s) added, ${replacedFiles.length} snapshot(s) refreshed. Session now has ${files.length} file(s) total. Session expires in ${ttlHours} hours.`
        : `${addedFiles.length} file(s) added. Session now has ${files.length} file(s) total. Session expires in ${ttlHours} hours.`,
    };

    await logMessage('INFO', 'prepare-revision completed', {
      sessionHash,
      addedCount: addedFiles.length,
      totalCount: files.length,
      errorCount: errors.length,
    });

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await releaseLock(sessionDir);
  }
}

prepareRevision();