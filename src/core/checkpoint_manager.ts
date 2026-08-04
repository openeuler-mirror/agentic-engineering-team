/**
 * @file src/core/checkpoint_manager.ts
 *
 * Layer 4 — CheckpointManager (Core-internal workflow state recorder).
 *
 * Records workflow lifecycle transitions to disk: when a workflow starts,
 * when a step advances, and when a workflow completes. This is
 * CORE-INTERNAL state — it is NOT surfaced as OutputEvents. Per
 * 新方案.md §3.2, lifecycle signals (`workflow.started`, `workflow.completed`,
 * `checkpoint.created`) are core-internal by design and stay inside Core.
 * The plugin / CLI never sees them on the output channel.
 *
 * Scope of this iteration: RECORDING ONLY.
 *   ✅ create()            — records `workflow_started`
 *   ✅ recordStepAdvance() — records `step_advanced` (prior step's
 *                              implicit completion is captured in `from`)
 *   ✅ recordContinue()   — records `step_resumed` (a `workflow.continue`
 *                              re-emitted the current step's prompt; no
 *                              currentStepId change, only an audit entry
 *                              + `updatedAt` bump)
 *   ✅ recordComplete()    — records `workflow_completed` + archives file
 *   ✅ recordAbort()       — records `workflow_aborted` + archives file
 *                              (user-initiated termination, NOT natural
 *                              completion; distinct history event so
 *                              audit trail can tell them apart)
 *
 * Out of scope (left to higher layers / later iterations):
 *   ❌ interrupt / resume / handover-context tracking
 *   ❌ sessionID / agentId tracking (plugin/CLI concerns)
 *   ❌ multi-execution-per-step (the plugin layer handles retries)
 *
 * Storage layout (<projectRoot>/.aet/core-checkpoint/):
 *   index.json                — top-level active/recent-completed index
 *   ckpt_<ts>_<rand>.json     — per-workflow checkpoint file (in-progress)
 *   archive/
 *     ckpt_<ts>_<rand>.json   — completed checkpoints (moved here on
 *                                 `recordComplete` so the active dir stays
 *                                 focused on in-progress workflows)
 *
 * The directory is intentionally distinct from the plugin's
 * `.aet/checkpoint/` store: Core records track only the workflow lifecycle
 * as Core sees it; the plugin's records track executions, session IDs,
 * agent IDs, and resume hints — different concerns.
 *
 * Failure semantics: all I/O errors are swallowed (logged to stderr).
 * Recording is best-effort — a write failure MUST NOT break workflow
 * execution. The contract is "if you can write, write; if you can't,
 * keep going." Callers do not see exceptions.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import type { OutputEvent } from '../definitions/events.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHECKPOINT_VERSION = '1.0';
const RECENT_COMPLETED_MAX = 10;

// ---------------------------------------------------------------------------
// Public input type (callers need to construct this)
// ---------------------------------------------------------------------------

export interface CheckpointWorkflowMeta {
  name: string;
  description: string;
  /**
   * Optional initial-requirement text captured at init time (the user's
   * original task description). Kept distinct from `description` (the
   * workflow's STATIC config description) — this is per-run user input.
   * Absent on checkpoints created before this field existed; consumers
   * treat absence as "no requirement recorded" and inject nothing.
   */
  argument?: string;
}

/**
 * A step transition deferred by a `prompt.inject` step hook (execute-first).
 *
 * When a handover fires a `prompt.inject` hook, the step does NOT advance:
 * the hook's text is returned as the handover prompt (plus a reminder to
 * handover again) and the still-unprocessed portion of the transition is
 * persisted here so the NEXT handover resumes where the inject deferred.
 *
 * `events` holds the REMAINING resolved OutputEvents (context.clear to
 * carry, prompt.inject to serve next, in order). `from`/`to` name the
 * transition being deferred (`to === null` means the transition completes
 * the workflow once its hooks are consumed).
 */
export interface PendingTransition {
  /** Step being left (null when entering step 1). */
  from: string | null;
  /** Step being entered, or null when the deferred transition completes the workflow. */
  to: string | null;
  /** Remaining resolved step-hook events to process before advancing. */
  events: OutputEvent[];
}

// ---------------------------------------------------------------------------
// On-disk schemas (bump CHECKPOINT_VERSION on breaking changes)
// ---------------------------------------------------------------------------

interface CheckpointFile {
  version: string;
  checkpointId: string;
  workflow: CheckpointWorkflowMeta;
  currentStepId: string | null;
  status: 'in_progress' | 'completed' | 'aborted';
  /** Deferred step transition from a `prompt.inject` hook (see {@link PendingTransition}). Absent when none. */
  pendingTransition?: PendingTransition | null;
  history: HistoryEntry[];
  startedAt: string;
  updatedAt: string;
  completedAt: null | string;
}

type HistoryEntry =
  | { ts: string; event: 'workflow_started'; workflow: string; firstStepId: string | null }
  | { ts: string; event: 'step_advanced'; from: string | null; to: string | null }
  | { ts: string; event: 'hook_pending' }
  | { ts: string; event: 'step_resumed'; step: string }
  | { ts: string; event: 'workflow_completed' }
  | { ts: string; event: 'workflow_aborted'; reason?: string };

interface CheckpointIndex {
  version: string;
  lastUpdated: null | string;
  active: ActiveEntry[];
  recentCompleted: CompletedEntry[];
}

export interface ActiveEntry {
  checkpointId: string;
  workflow: string;
  currentStepId: string | null;
  startedAt: string;
  updatedAt: string;
  /** Mirrors the checkpoint file's deferred-transition state. See {@link PendingTransition}. */
  pendingTransition?: PendingTransition | null;
}

interface CompletedEntry {
  checkpointId: string;
  workflow: string;
  startedAt: string;
  completedAt: string;
  /**
   * Why this workflow ended. `'completed'` = natural completion (ran past
   * the last step via `recordComplete`); `'aborted'` = user-initiated
   * termination via `recordAbort`. Optional for backward-compat with
   * archive files written before this field existed — defaults to
   * `'completed'` when missing.
   */
  status?: 'completed' | 'aborted';
}// ---------------------------------------------------------------------------
// CheckpointManager
// ---------------------------------------------------------------------------

export class CheckpointManager {
  private readonly checkpointDir: string;
  private readonly archiveDir: string;
  private dirsEnsured = false;

  constructor(projectRoot: string) {
    this.checkpointDir = join(projectRoot, '.aet', 'core-checkpoint');
    this.archiveDir = join(this.checkpointDir, 'archive');
  }

  // -----------------------------------------------------------------------
  // Public API — recording only
  // -----------------------------------------------------------------------

  /**
   * Create a new checkpoint for a freshly-started workflow. Records
   * `workflow_started` and pushes a new entry to the active index.
   *
   * Callers MUST call {@link findLatestActive} first and decide how to
   * handle an existing in-progress instance of the same workflow (e.g.
   * surface an intervention prompt, or archive the old one). Calling
   * `create` while an active entry exists will create a second entry for
   * the same workflow name — `findLatestActive` will then return only the
   * newest one, leaving the older entry dangling. The expected usage
   * pattern is enforced at the {@link WorkflowEngine.initWorkflow} layer,
   * which intercepts the "already active" case before reaching `create`.
   *
   * Returns the new checkpointId, or `null` on persistent I/O failure
   * (best-effort: callers MUST proceed regardless).
   */
  create(workflow: CheckpointWorkflowMeta, firstStepId: string | null): string | null {
    const checkpointId = this.generateId();
    const now = new Date().toISOString();

    const checkpoint: CheckpointFile = {
      version: CHECKPOINT_VERSION,
      checkpointId,
      workflow: {
        name: workflow.name,
        description: workflow.description,
        argument: workflow.argument,
      },
      currentStepId: firstStepId,
      status: 'in_progress',
      history: [
        { ts: now, event: 'workflow_started', workflow: workflow.name, firstStepId },
      ],
      startedAt: now,
      updatedAt: now,
      completedAt: null,
    };

    this.writeCheckpointFile(checkpointId, checkpoint);

    const index = this.loadIndex();
    index.active.push({
      checkpointId,
      workflow: workflow.name,
      currentStepId: firstStepId,
      startedAt: now,
      updatedAt: now,
    });
    this.saveIndex(index);

    return checkpointId;
  }

  /**
   * Append a `step_advanced` event to the latest active checkpoint for
   * `workflowName`. Updates `currentStepId` in both the checkpoint file
   * and the active index entry. No-op if no active checkpoint exists for
   * the given workflow name (caller may have started the workflow via a
   * different store, or the checkpoint file was deleted out-of-band).
   */
  recordStepAdvance(
    workflowName: string,
    fromStepId: string | null,
    toStepId: string | null,
  ): void {
    const entry = this.findLatestActive(workflowName);
    if (!entry) return;

    const checkpoint = this.readCheckpointFile(entry.checkpointId);
    if (!checkpoint) return;

    const now = new Date().toISOString();
    checkpoint.currentStepId = toStepId;
    delete checkpoint.pendingTransition; // a pending inject transition is consumed by the advance
    checkpoint.history.push({ ts: now, event: 'step_advanced', from: fromStepId, to: toStepId });
    checkpoint.updatedAt = now;
    this.writeCheckpointFile(checkpoint.checkpointId, checkpoint);

    entry.currentStepId = toStepId;
    delete entry.pendingTransition;
    entry.updatedAt = now;
    this.replaceActiveEntry(entry);
  }

  /**
   * Append a `step_resumed` event to the latest active checkpoint for
   * `workflowName`. Unlike {@link recordStepAdvance}, this does NOT change
   * `currentStepId` — the step is the same one being resumed (state
   * recovery via `workflow.continue`). It records that a continue was
   * executed (for auditability) and bumps `updatedAt` so
   * {@link findLatestActiveAny} reflects the most recent activity. No-op
   * if no active checkpoint exists for the given workflow name.
   */
  recordContinue(workflowName: string, stepId: string): void {
    const entry = this.findLatestActive(workflowName);
    if (!entry) return;

    const checkpoint = this.readCheckpointFile(entry.checkpointId);
    if (!checkpoint) return;

    const now = new Date().toISOString();
    checkpoint.history.push({ ts: now, event: 'step_resumed', step: stepId });
    checkpoint.updatedAt = now;
    this.writeCheckpointFile(checkpoint.checkpointId, checkpoint);

    entry.updatedAt = now;
    this.replaceActiveEntry(entry);
  }

  /**
   * Persist a deferred step transition (a `prompt.inject` hook fired and
   * deferred the advance). Records a `hook_pending` history entry, stores
   * the {@link PendingTransition} (remaining hooks to process) on both the
   * checkpoint file and the active index entry, and bumps `updatedAt`.
   * `currentStepId` is deliberately NOT changed — the step has not advanced.
   * No-op if no active checkpoint exists for the given workflow name.
   */
  recordPendingTransition(workflowName: string, pending: PendingTransition): void {
    const entry = this.findLatestActive(workflowName);
    if (!entry) return;

    const checkpoint = this.readCheckpointFile(entry.checkpointId);
    if (!checkpoint) return;

    const now = new Date().toISOString();
    checkpoint.pendingTransition = pending;
    checkpoint.history.push({ ts: now, event: 'hook_pending' });
    checkpoint.updatedAt = now;
    this.writeCheckpointFile(checkpoint.checkpointId, checkpoint);

    entry.pendingTransition = pending;
    entry.updatedAt = now;
    this.replaceActiveEntry(entry);
  }

  /**
   * Clear a previously-recorded pending transition (the deferred advance is
   * now being performed). No-op when there is none.
   */
  clearPendingTransition(workflowName: string): void {
    const entry = this.findLatestActive(workflowName);
    if (!entry) return;

    const checkpoint = this.readCheckpointFile(entry.checkpointId);
    if (!checkpoint) return;
    if (!checkpoint.pendingTransition) return;

    const now = new Date().toISOString();
    delete checkpoint.pendingTransition;
    checkpoint.updatedAt = now;
    this.writeCheckpointFile(checkpoint.checkpointId, checkpoint);

    delete entry.pendingTransition;
    entry.updatedAt = now;
    this.replaceActiveEntry(entry);
  }

  /**
   * Mark the latest active checkpoint for `workflowName` as completed.
   * Archives the checkpoint file (moves from active dir to `archive/`),
   * removes it from the active index, and prepends it to
   * `recentCompleted` (capped at {@link RECENT_COMPLETED_MAX}).
   *
   * Write-order is deliberate: archive first, then unlink active. If the
   * archive write fails, the active file is left intact (no data loss;
   * the entry just stays "in_progress" until a future call succeeds).
   */
  recordComplete(workflowName: string): void {
    this.recordEnd(workflowName, 'completed');
  }

  /**
   * Mark the latest active checkpoint for `workflowName` as aborted
   * (user-initiated termination, NOT natural completion). Same archive
   * + index-update semantics as {@link recordComplete}, but writes
   * `status='aborted'` and a `workflow_aborted` history entry (with
   * optional `reason`) so the audit trail can distinguish a workflow
   * that ran to completion from one the user terminated midway.
   */
  recordAbort(workflowName: string, reason?: string): void {
    this.recordEnd(workflowName, 'aborted', reason);
  }

  /**
   * Internal: shared end-of-workflow recording for {@link recordComplete}
   * and {@link recordAbort}. Archives the checkpoint file, removes it
   * from the active index, and prepends a {@link CompletedEntry} (with
   * `status` set so consumers can distinguish natural completion from
   * user-initiated abort) to `recentCompleted` (capped at
   * {@link RECENT_COMPLETED_MAX}).
   *
   * Write-order: archive first, then unlink active. If the archive
   * write fails, the active file is left intact (no data loss; the
   * entry stays "in_progress" until a future call succeeds).
   */
  private recordEnd(
    workflowName: string,
    endStatus: 'completed' | 'aborted',
    reason?: string,
  ): void {
    const entry = this.findLatestActive(workflowName);
    if (!entry) return;

    const checkpoint = this.readCheckpointFile(entry.checkpointId);
    if (!checkpoint) {
      // File already gone — just clean up the dangling index entry.
      this.removeActiveEntry(entry.checkpointId);
      return;
    }

    const now = new Date().toISOString();
    checkpoint.status = endStatus;
    checkpoint.currentStepId = null;
    delete checkpoint.pendingTransition;
    checkpoint.completedAt = now;
    checkpoint.updatedAt = now;
    if (endStatus === 'completed') {
      checkpoint.history.push({ ts: now, event: 'workflow_completed' });
    } else {
      const ev: HistoryEntry = { ts: now, event: 'workflow_aborted' };
      if (reason !== undefined) (ev as { reason?: string }).reason = reason;
      checkpoint.history.push(ev);
    }

    this.writeArchiveCheckpoint(checkpoint);
    this.deleteActiveCheckpointFile(entry.checkpointId);

    const index = this.loadIndex();
    index.active = index.active.filter(e => e.checkpointId !== entry.checkpointId);
    index.recentCompleted.unshift({
      checkpointId: entry.checkpointId,
      workflow: entry.workflow,
      startedAt: entry.startedAt,
      completedAt: now,
      status: endStatus,
    });
    if (index.recentCompleted.length > RECENT_COMPLETED_MAX) {
      index.recentCompleted = index.recentCompleted.slice(0, RECENT_COMPLETED_MAX);
    }
    this.saveIndex(index);
  }

  // -----------------------------------------------------------------------
  // Read access (for future status commands — not used internally today)
  // -----------------------------------------------------------------------

  /** Find the latest active checkpoint entry for a workflow name. */
  findLatestActive(workflowName: string): ActiveEntry | null {
    const index = this.loadIndex();
    // Iterate from the end: the most recently-pushed active entry wins.
    for (let i = index.active.length - 1; i >= 0; i--) {
      if (index.active[i]!.workflow === workflowName) return index.active[i]!;
    }
    return null;
  }

  /**
   * Find the most-recently-updated active checkpoint entry regardless of
   * workflow name. Used by the stateful Core contract: the CLI's
   * `workflow.handover` passes no workflow name, so Core resolves the single
   * active workflow from the on-disk index.
   *
   * Selection rule: pick the entry with the latest `updatedAt`. Ties break
   * by recency of position in `active[]` (later push wins). Returns `null`
   * when no active entry exists — the caller surfaces a `NO_ACTIVE_WORKFLOW`
   * error.
   *
   * This assumes the "one active workflow per project root" model the
   * CLI contract documents. If multiple workflows are active concurrently
   * (unusual; only happens if a previous one was left in_progress and a
   * new one was created without the engine's "already-active" guard firing),
   * the latest-updated one wins as the "current" workflow.
   */
  findLatestActiveAny(): ActiveEntry | null {
    const index = this.loadIndex();
    if (index.active.length === 0) return null;
    let best = index.active[0]!;
    for (let i = 1; i < index.active.length; i++) {
      const e = index.active[i]!;
      if (e.updatedAt > best.updatedAt) best = e;
    }
    return best;
  }

  /**
   * Read the workflow meta (name / description / argument) for a checkpoint
   * file by id. Returns `null` when the file is missing or unreadable
   * (best-effort read; callers treat null as "no meta available"). Used by
   * the engine to re-inject the original requirement (`argument`) into
   * step / continue prompts. The meta is intentionally NOT mirrored into
   * the index (`ActiveEntry`) — the requirement text can be long and the
   * index should stay a lightweight summary.
   */
  getCheckpointMeta(checkpointId: string): CheckpointWorkflowMeta | null {
    const checkpoint = this.readCheckpointFile(checkpointId);
    return checkpoint ? checkpoint.workflow : null;
  }

  // -----------------------------------------------------------------------
  // Internals — IDs, paths, atomic writes
  // -----------------------------------------------------------------------

  private generateId(): string {
    const ts = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    return `ckpt_${ts}_${rand}`;
  }

  private ensureDirs(): void {
    if (this.dirsEnsured) return;
    try {
      mkdirSync(this.checkpointDir, { recursive: true });
      mkdirSync(this.archiveDir, { recursive: true });
      this.dirsEnsured = true;
    } catch (e) {
      console.error('[CheckpointManager] ensureDirs error:', (e as Error).message);
    }
  }

  private getCheckpointPath(checkpointId: string): string {
    return join(this.checkpointDir, `${checkpointId}.json`);
  }

  private getArchivePath(checkpointId: string): string {
    return join(this.archiveDir, `${checkpointId}.json`);
  }

  private getIndexPath(): string {
    return join(this.checkpointDir, 'index.json');
  }

  /**
   * Atomic write: write to `<path>.tmp`, then `rename`. Crash-safe:
   * either the old file is intact or the new one is fully in place —
   * never half-written. (The plugin's CheckpointManager does NOT do this
   * for its checkpoint files; we improve on it here.)
   */
  private atomicWrite(filePath: string, content: string): void {
    this.ensureDirs();
    const tmp = `${filePath}.tmp`;
    try {
      writeFileSync(tmp, content, 'utf8');
      renameSync(tmp, filePath);
    } catch (e) {
      console.error(`[CheckpointManager] atomicWrite (${filePath}) error:`, (e as Error).message);
      // Best-effort cleanup of the .tmp file; ignore failure — it will be
      // overwritten on the next write.
      try {
        if (existsSync(tmp)) unlinkSync(tmp);
      } catch {
        /* swallow */
      }
    }
  }

  private writeCheckpointFile(checkpointId: string, checkpoint: CheckpointFile): void {
    this.atomicWrite(this.getCheckpointPath(checkpointId), JSON.stringify(checkpoint, null, 2));
  }

  private writeArchiveCheckpoint(checkpoint: CheckpointFile): void {
    this.atomicWrite(this.getArchivePath(checkpoint.checkpointId), JSON.stringify(checkpoint, null, 2));
  }

  private deleteActiveCheckpointFile(checkpointId: string): void {
    try {
      const p = this.getCheckpointPath(checkpointId);
      if (existsSync(p)) unlinkSync(p);
    } catch (e) {
      console.error('[CheckpointManager] deleteActiveCheckpointFile error:', (e as Error).message);
    }
  }

  private readCheckpointFile(checkpointId: string): CheckpointFile | null {
    try {
      const p = this.getCheckpointPath(checkpointId);
      if (!existsSync(p)) return null;
      return JSON.parse(readFileSync(p, 'utf8')) as CheckpointFile;
    } catch (e) {
      console.error('[CheckpointManager] readCheckpointFile error:', (e as Error).message);
      return null;
    }
  }

  private loadIndex(): CheckpointIndex {
    try {
      const p = this.getIndexPath();
      if (existsSync(p)) {
        return JSON.parse(readFileSync(p, 'utf8')) as CheckpointIndex;
      }
    } catch (e) {
      console.error('[CheckpointManager] loadIndex error:', (e as Error).message);
    }
    return {
      version: CHECKPOINT_VERSION,
      lastUpdated: null,
      active: [],
      recentCompleted: [],
    };
  }

  private saveIndex(index: CheckpointIndex): void {
    index.lastUpdated = new Date().toISOString();
    this.atomicWrite(this.getIndexPath(), JSON.stringify(index, null, 2));
  }

  private replaceActiveEntry(entry: ActiveEntry): void {
    const index = this.loadIndex();
    const idx = index.active.findIndex(e => e.checkpointId === entry.checkpointId);
    if (idx >= 0) index.active[idx] = entry;
    else index.active.push(entry);
    this.saveIndex(index);
  }

  private removeActiveEntry(checkpointId: string): void {
    const index = this.loadIndex();
    index.active = index.active.filter(e => e.checkpointId !== checkpointId);
    this.saveIndex(index);
  }
}
