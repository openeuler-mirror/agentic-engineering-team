import { describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CheckpointManager, type PendingTransition } from './checkpoint_manager.js';
import { out } from '../definitions/events.js';

function fresh(): { root: string; cm: CheckpointManager } {
  const root = mkdtempSync(join(tmpdir(), 'aet-ckpt-'));
  return { root, cm: new CheckpointManager(root) };
}

function readIndex(root: string) {
  return JSON.parse(readFileSync(join(root, '.aet', 'core-checkpoint', 'index.json'), 'utf8'));
}

function readCheckpointFile(root: string, id: string) {
  return JSON.parse(readFileSync(join(root, '.aet', 'core-checkpoint', `${id}.json`), 'utf8'));
}

describe('CheckpointManager', () => {
  it('create writes a checkpoint file + active index entry and returns an id', () => {
    const { root, cm } = fresh();
    const id = cm.create({ name: 'design', description: 'Workflow' }, null);
    expect(id).toBeTruthy();
    expect(existsSync(join(root, '.aet', 'core-checkpoint', `${id}.json`))).toBe(true);
    const fsIdx = readIndex(root);
    expect(fsIdx.active).toHaveLength(1);
    expect(fsIdx.active[0].workflow).toBe('design');
    expect(cm.findLatestActive('design')?.checkpointId).toBe(id);
  });

  it('create persists the workflow argument into the checkpoint file', () => {
    const { root, cm } = fresh();
    const id = cm.create(
      { name: 'design', description: 'Workflow', argument: '做一个登录功能' },
      null,
    )!;
    const file = readCheckpointFile(root, id);
    expect(file.workflow.argument).toBe('做一个登录功能');
    expect(cm.getCheckpointMeta(id)?.argument).toBe('做一个登录功能');
  });

  it('create omits argument when not supplied (forward-compatible)', () => {
    const { cm } = fresh();
    const id = cm.create({ name: 'design', description: 'd' }, null)!;
    expect(cm.getCheckpointMeta(id)?.argument).toBeUndefined();
  });

  it('getCheckpointMeta returns null for an unknown checkpoint id', () => {
    const { cm } = fresh();
    expect(cm.getCheckpointMeta('ckpt_does_not_exist')).toBeNull();
  });

  it('findLatestActiveAny returns the most recently updated active entry', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const { cm } = fresh();
    cm.create({ name: 'design', description: 'd' }, null);
    vi.setSystemTime(new Date('2026-01-01T00:00:01.000Z'));
    const id2 = cm.create({ name: 'implement', description: 'i' }, null);
    expect(cm.findLatestActiveAny()?.checkpointId).toBe(id2);
    vi.useRealTimers();
  });

  it('findLatestActive returns null when no active entry matches', () => {
    const { cm } = fresh();
    expect(cm.findLatestActive('design')).toBeNull();
  });

  it('recordStepAdvance updates currentStepId in the file and index', () => {
    const { root, cm } = fresh();
    cm.create({ name: 'design', description: 'd' }, null);
    cm.recordStepAdvance('design', null, 'stage2');
    const cid = cm.findLatestActive('design')!.checkpointId;
    expect(readCheckpointFile(root, cid).currentStepId).toBe('stage2');
    expect(cm.findLatestActive('design')?.currentStepId).toBe('stage2');
  });

  it('recordContinue keeps currentStepId and records a step_resumed history entry', () => {
    const { root, cm } = fresh();
    cm.create({ name: 'design', description: 'd' }, 'stage1');
    cm.recordContinue('design', 'stage1');
    const cid = cm.findLatestActive('design')!.checkpointId;
    const file = readCheckpointFile(root, cid);
    expect(file.currentStepId).toBe('stage1');
    expect(file.history.some((h: { event: string }) => h.event === 'step_resumed')).toBe(true);
  });

  it('recordPendingTransition then clearPendingTransition', () => {
    const { cm } = fresh();
    cm.create({ name: 'design', description: 'd' }, 's1');
    const pending: PendingTransition = {
      from: 's1',
      to: 's2',
      events: [out('prompt.inject', { text: 'x', type: 'task' })],
    };
    cm.recordPendingTransition('design', pending);
    expect(cm.findLatestActive('design')?.pendingTransition?.to).toBe('s2');
    cm.clearPendingTransition('design');
    expect(cm.findLatestActive('design')?.pendingTransition).toBeUndefined();
  });

  it('recordComplete archives the checkpoint and removes it from active', () => {
    const { root, cm } = fresh();
    const cid = cm.create({ name: 'design', description: 'd' }, 's1')!;
    cm.recordComplete('design');
    expect(existsSync(join(root, '.aet', 'core-checkpoint', 'archive', `${cid}.json`))).toBe(true);
    expect(existsSync(join(root, '.aet', 'core-checkpoint', `${cid}.json`))).toBe(false);
    const fsIdx = readIndex(root);
    expect(fsIdx.active).toHaveLength(0);
    expect(fsIdx.recentCompleted[0]).toMatchObject({ checkpointId: cid, status: 'completed' });
    expect(readFileSync(join(root, '.aet', 'core-checkpoint', 'archive', `${cid}.json`), 'utf8')).toContain('workflow_completed');
  });

  it('recordAbort archives with status=aborted + reason and bumps recents', () => {
    const { root, cm } = fresh();
    const cid = cm.create({ name: 'design', description: 'd' }, 's1')!;
    cm.recordAbort('design', 'wrong direction');
    const fsIdx = readIndex(root);
    expect(fsIdx.recentCompleted[0].status).toBe('aborted');
    const archive = JSON.parse(
      readFileSync(join(root, '.aet', 'core-checkpoint', 'archive', `${cid}.json`), 'utf8'),
    );
    expect(archive.status).toBe('aborted');
    expect(archive.history.find((h: { event: string }) => h.event === 'workflow_aborted')?.reason).toBe('wrong direction');
  });

  it('does not error when recording against a workflow with no active checkpoint (no-op)', () => {
    const { cm } = fresh();
    expect(() => {
      cm.recordStepAdvance('ghost', null, 's1');
      cm.recordComplete('ghost');
    }).not.toThrow();
  });
});