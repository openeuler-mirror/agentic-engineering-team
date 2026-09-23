/**
 * Diff utilities — port of the original `diff-utils.mjs`, with a two-pass
 * context-counting fix: the original derived context line counts from the
 * *new* text while slicing context from the *old* text, producing wrong
 * `@@ -old,count +new,count @@` headers. Here context counts are counted on
 * the same (old) side that the slices are taken from, and context lines are
 * newline-joined (`join('\n')`) so a multi-line context renders as separate
 * lines, not concatenated text with off-by-N offsets.
 *
 * Requires: a diff algorithm with a `diffLines(old, new)` free function and
 * the `diff/*` types. See the note in index.ts for how the bundled zero-dep
 * build supplies it.
 */

import { diffLines, type Change } from 'diff';

const CONTEXT_MIN_LINES = 1;
const CONTEXT_MAX_LINES = 5;

export interface HunksConfig {
  oldPrefix?: string;
  newPrefix?: string;
}

export interface Hunk {
  type: 'add' | 'delete' | 'modify';
  oldStart: number;
  oldEnd: number;
  newStart: number;
  newEnd: number;
  oldContent: string;
  newContent: string;
  contextBefore: string;
  contextAfter: string;
}

function countEffectiveChars(text: string): number {
  return text.replace(/\s/g, '').length;
}

/** Line-range context lengths derived from the *old* lines, clamped to [min,max]. */
function contextLengths(
  oldLines: string[],
  oldStartIndex: number,
  oldEndIndex: number,
  direction: 'before' | 'after',
): number {
  const available =
    direction === 'before' ? oldStartIndex : oldLines.length - oldEndIndex - 1;
  if (available <= 0) return 0;

  // When the (old) range is empty (pure insertion), anchor to the line *before*
  // the gap for 'before' and the line *after* for 'after'.
  const anchorFixedIndex =
    direction === 'before' ? oldStartIndex - 1 : oldEndIndex + 1;
  let totalChars = 0;
  let lineCount = 0;

  if (direction === 'before') {
    for (let i = anchorFixedIndex; i >= 0 && lineCount < CONTEXT_MAX_LINES; i--) {
      totalChars += countEffectiveChars(oldLines[i]);
      lineCount++;
      if (totalChars >= 75) break;
    }
  } else {
    for (let i = anchorFixedIndex; i < oldLines.length && lineCount < CONTEXT_MAX_LINES; i++) {
      totalChars += countEffectiveChars(oldLines[i]);
      lineCount++;
      if (totalChars >= 75) break;
    }
  }

  return Math.max(CONTEXT_MIN_LINES, Math.min(lineCount, available, CONTEXT_MAX_LINES));
}

function getContext(
  oldLines: string[],
  oldStart: number,
  oldEnd: number,
): { contextBefore: string; contextAfter: string } {
  const before = contextLengths(oldLines, oldStart - 1, oldEnd - 1, 'before');
  const after = contextLengths(oldLines, oldStart - 1, oldEnd - 1, 'after');

  const contextBefore = oldLines
    .slice(Math.max(0, oldStart - 1 - before), oldStart - 1)
    .join('\n');
  const contextAfter = oldLines.slice(oldEnd, oldEnd + after).join('\n');

  return { contextBefore, contextAfter };
}

function splitLines(text?: string): string[] {
  return (text ?? '').split('\n');
}

/**
 * Split a `diff` Change.value into its constituent lines for rendering.
 *
 * A Change.value is the concatenation of COMPLETE lines INCLUDING their
 * trailing `\n` (only a final unterminated line omits it), so a naive
 * `split('\n')` leaves a phantom empty element at the end. Stripping ONE
 * trailing newline first yields exactly the file's lines — a genuine blank
 * line mid-file (`"\n"`) is preserved as `''`, while the phantom tail is
 * dropped. Rendered hunks therefore never contain an extra `-` or `+` line,
 * so their content span always matches the `@@ -a,b +c,d @@` header.
 */
function contentLines(value?: string): string[] {
  return (value ?? '').replace(/\n$/, '').split('\n');
}

/** Convert line-level changes into hunks (adjacent delete+add merged into modify). */
export function convertToHunks(oldContent: string, newContent: string): Hunk[] {
  const changes: Change[] = diffLines(oldContent, newContent);
  const oldLines = splitLines(oldContent);
  const hunks: Hunk[] = [];

  let oldLine = 1;
  let newLine = 1;

  for (const change of changes) {
    const lineCount = change.count ?? 0;
    const value = change.value ?? '';

    if (change.added) {
      const { contextBefore, contextAfter } = getContext(oldLines, oldLine, oldLine - 1);
      hunks.push({
        type: 'add',
        oldStart: oldLine,
        oldEnd: oldLine - 1,
        newStart: newLine,
        newEnd: newLine + lineCount - 1,
        oldContent: '',
        newContent: value,
        contextBefore,
        contextAfter,
      });
      newLine += lineCount;
    } else if (change.removed) {
      const { contextBefore, contextAfter } = getContext(oldLines, oldLine, oldLine + lineCount - 1);
      hunks.push({
        type: 'delete',
        oldStart: oldLine,
        oldEnd: oldLine + lineCount - 1,
        newStart: newLine,
        newEnd: newLine - 1,
        oldContent: value,
        newContent: '',
        contextBefore,
        contextAfter,
      });
      oldLine += lineCount;
    } else {
      oldLine += lineCount;
      newLine += lineCount;
    }
  }

  return mergeAdjacentHunks(hunks, oldLines);
}

function mergeAdjacentHunks(hunks: Hunk[], oldLines: string[]): Hunk[] {
  const merged: Hunk[] = [];
  let i = 0;

  while (i < hunks.length) {
    const current = hunks[i];
    if (current.type === 'delete' && i + 1 < hunks.length && hunks[i + 1].type === 'add') {
      const next = hunks[i + 1];
      const { contextBefore, contextAfter } = getContext(oldLines, current.oldStart, current.oldEnd);
      merged.push({
        type: 'modify',
        oldStart: current.oldStart,
        oldEnd: current.oldEnd,
        oldContent: current.oldContent,
        newStart: next.newStart,
        newEnd: next.newEnd,
        newContent: next.newContent,
        contextBefore,
        contextAfter,
      });
      i += 2;
    } else {
      merged.push(current);
      i++;
    }
  }

  return merged;
}

export interface HunkSummary {
  additions: number;
  deletions: number;
  modifications: number;
}

export function calculateSummary(hunks: Hunk[]): HunkSummary {
  let additions = 0;
  let deletions = 0;
  let modifications = 0;

  for (const hunk of hunks) {
    switch (hunk.type) {
      case 'add':
        additions += hunk.newEnd - hunk.newStart + 1;
        break;
      case 'delete':
        deletions += hunk.oldEnd - hunk.oldStart + 1;
        break;
      case 'modify':
        modifications++;
        additions += hunk.newEnd - hunk.newStart + 1;
        deletions += hunk.oldEnd - hunk.oldStart + 1;
        break;
    }
  }

  return { additions, deletions, modifications };
}

/** Render hunks in unified-diff form. */
export function generateUnifiedDiff(hunks: Hunk[], oldPath: string, newPath: string): string {
  if (hunks.length === 0) return '';

  const lines: string[] = [];
  lines.push(`--- ${oldPath}`);
  lines.push(`+++ ${newPath}`);

  for (const hunk of hunks) {
    // Content rows are computed once (the resolve-trailing-newline-aware
    // model) and the header counts are ALWAYS derived from the actual rows
    // rendered — so `@@ -a,b +c,d @@` can never disagree with the body's
    // span, which is what made old hunks unappliable by standard tools.
    const contentOld = hunk.type === 'delete' || hunk.type === 'modify' ? contentLines(hunk.oldContent) : [];
    const contentNew = hunk.type === 'add' || hunk.type === 'modify' ? contentLines(hunk.newContent) : [];

    const beforeLines = contentLines(hunk.contextBefore);
    const afterLines = contentLines(hunk.contextAfter);

    const ctxCount = beforeLines.length + afterLines.length;
    const startOld = hunk.oldStart > 0 && beforeLines.length > 0 ? hunk.oldStart - beforeLines.length : hunk.oldStart;
    const startNew = hunk.newStart > 0 && beforeLines.length > 0 ? hunk.newStart - beforeLines.length : hunk.newStart;
    lines.push(`@@ -${startOld},${contentOld.length + ctxCount} +${startNew},${contentNew.length + ctxCount} @@`);

    for (const line of beforeLines) lines.push(` ${line}`);

    for (const line of contentOld) lines.push(`-${line}`);
    for (const line of contentNew) lines.push(`+${line}`);

    for (const line of afterLines) lines.push(` ${line}`);
  }

  return lines.join('\n');
}