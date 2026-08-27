/**
 * Cross-platform session lock, implemented with `mkdir` (atomic on all
 * platforms). The lock directory's mtime is refreshed as a heartbeat; a lock
 * whose mtime is older than `LOCK_STALE_MS` is treated as stale (crashed
 * holder) and taken over by the next contender — immune to Windows PID reuse.
 */

import { mkdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LOCK_STALE_MS = 30 * 60 * 1000; // free a crashed holder after 30 min
const HEARTBEAT_MS = 10 * 1000;       // refresh interval of a live lock
const POLL_MS = 500;                  // contention retry cadence
const MAX_WAIT_MS = 30 * 1000;        // fail a live-lock only after this long

interface LockFileData {
  pid: number;
  time: number;
  host: string;
}

const lockPathDir = (sessionDir: string) => join(sessionDir, '.lock');
const dataPath = (sessionDir: string) => join(sessionDir, '.lock', 'owner.json');

function readData(sessionDir: string): LockFileData | null {
  try {
    const raw = readFileSync(dataPath(sessionDir), 'utf-8');
    return JSON.parse(raw) as LockFileData;
  } catch {
    return null;
  }
}

async function acquireNow(sessionDir: string): Promise<boolean> {
  try {
    await mkdir(lockPathDir(sessionDir), { recursive: false });
    await writeFile(
      dataPath(sessionDir),
      JSON.stringify({ pid: process.pid, time: Date.now(), host: 'aet' }),
    );
    return true;
  } catch {
    return false;
  }
}

async function isStale(sessionDir: string): Promise<boolean> {
  try {
    const s = await stat(lockPathDir(sessionDir));
    return Date.now() - s.mtimeMs > LOCK_STALE_MS;
  } catch {
    return true; // dir missing → free
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Acquire the session lock; resolves `true` on success, `false` if a live holder exists. */
export async function acquireLock(sessionDir: string): Promise<boolean> {
  if (await acquireNow(sessionDir)) return true;

  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_MS) {
    // Sleep FIRST every poll iteration — this is the retry cadence, not a
    // busy-spin. `acquireNow` (mkdir of an existing dir) fails instantly, so
    // calling it before sleeping would busy-loop the whole MAX_WAIT_MS with
    // zero useful progress.
    await sleep(POLL_MS);
    if (!(await isStale(sessionDir))) continue;
    try {
      await rm(lockPathDir(sessionDir), { recursive: true, force: true });
    } catch {
      /* raced */
    }
    if (await acquireNow(sessionDir)) return true;
  }
  return false; // caller reports 'locked' (holder = readData(sessionDir))
}

/** Release a session lock (idempotent, never throws). */
export async function releaseLock(sessionDir: string): Promise<void> {
  try {
    await rm(lockPathDir(sessionDir), { recursive: true, force: true });
  } catch {
    /* already released */
  }
}

/** Refresh a live lock's mtime (heartbeat). No-op if we no longer own it. */
async function updateLock(sessionDir: string): Promise<void> {
  try {
    const now = new Date();
    await utimes(lockPathDir(sessionDir), now, now);
  } catch {
    /* lock dir removed → session closed */
  }
}

/** Start a heartbeat; stop it with the returned fn. */
export function startHeartbeat(sessionDir: string): () => void {
  const t = setInterval(() => {
    void updateLock(sessionDir);
  }, HEARTBEAT_MS);
  t.unref?.();
  return () => clearInterval(t);
}