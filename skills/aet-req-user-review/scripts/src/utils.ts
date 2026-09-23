/**
 * Cross-platform helpers for the interactive-revision CLI.
 */

import envPaths from 'env-paths';
import { join, basename, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { lstatSync } from 'node:fs';

export const SESSIONS_DIR: string = envPaths('interactive-revision').data;

export function sessionDirFor(hash: string): string {
  return join(SESSIONS_DIR, hash);
}

export const LOG_FILE_NAME = 'interactive-revision.log';

/** Strip a UTF-8 BOM (a Windows editor may leave one at the head). */
export function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** Normalize any line ending inside `s` to `\n`. */
export function normalizeNewlines(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** Read a text file in canonical form (BOM stripped, LF line endings). */
export async function readTextCanonical(p: string): Promise<string> {
  const raw = await readFile(p, 'utf-8');
  return normalizeNewlines(stripBom(raw));
}

export function isSymlink(p: string): boolean {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Canonicalize a path via realpath (resolves symlinks, case, mount points),
 * fall back to `resolve(p)` — never the raw string — so a stale relative
 * source still maps to a stable canonical path.
 */
async function canonicalizePath(p: string): Promise<string> {
  try {
    return await realpath(p);
  } catch {
    return resolve(p);
  }
}

/**
 * Derive a session hash from a source-path SET. The hash is the first 12 hex
 * chars of SHA-256 over the sorted canonical paths — 48 bits. Every existing
 * source on the command line participates, so the SAME SET of files maps to
 * the same directory and a DIFFERENT set gets a different directory — even if
 * one of them happens to be deleted by finalize time. Nonexistent sources are
 * skipped here (a source deleted after prepare still finalizes the session the
 * prepare created).
 */
export async function generateSessionHash(paths: string[]): Promise<string> {
  const canon = await Promise.all(paths.map(canonicalizePath));
  const normalized = canon.sort().join('\n');
  return createHash('sha256').update(normalized).digest('hex').slice(0, 12);
}

/** ASCII-only portable snapshot filename (avoids Windows MAX_PATH issues). */
export function snapshotFileName(fileName: string): string {
  return `${randomUUID()}-${createHash('sha256').update(basename(fileName)).digest('hex').slice(0, 10)}.snap`;
}