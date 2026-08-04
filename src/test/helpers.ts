/**
 * Shared test helpers for the AET `src/` suite.
 *
 * Core is stateful — it owns `active workflow + currentStep` state in
 * `<projectRoot>/.aet/core-checkpoint/`, and config merges from
 * `<projectRoot>/.aet/config/workflow.json`. Tests therefore run against a
 * fresh tmp project root per test (no ambient cwd/env), and clean up after
 * themselves.
 */

import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach } from 'vitest';

const tempDirs = new Set<string>();

/** Create a fresh tmp project root with the `.aet/config/` skeleton. */
export function mkTempProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'aet-test-'));
  // `.aet/config/` — ConfigManager reads `<project>/.aet/config/workflow.json`
  // (absent → falls back to baseline). `.aet/core-checkpoint/` is created
  // lazily by CheckpointManager.
  mkdirSync(join(root, '.aet', 'config'), { recursive: true });
  tempDirs.add(root);
  return root;
}

/** Collect runCli stdout into a string (read via `.text` after the run). */
export function collectWriter(): { text: string; writer: (t: string) => void } {
  const acc: { text: string } = { text: '' };
  return {
    get text() {
      return acc.text;
    },
    writer: (t) => {
      acc.text += t;
    },
  };
}

/** Register afterEach cleanup — every tmp dir created by mkTempProject is removed. */
afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.clear();
});
