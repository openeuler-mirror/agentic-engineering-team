/**
 * UT for manifest.ts — SetupManifest hash tracking, atomic save/load,
 * uninstall-by-hash semantics. Architecture ported from Spec Kit's
 * `integrations/manifest.py` IntegrationManifest class.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  existsSync,
  symlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SetupManifest, sha256 } from './manifest';

function makeTempProject(prefix = 'aet-manifest-ut-'): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), prefix));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

describe('SetupManifest record/uninstall', () => {
  let project: { root: string; cleanup: () => void };
  let manifest: SetupManifest;

  beforeEach(() => {
    project = makeTempProject();
    manifest = new SetupManifest('aet-design-env', project.root);
  });
  afterEach(() => { project.cleanup(); });

  describe('recordFile (PRODUCED)', () => {
    it('writes file and records sha256', () => {
      const content = '# rule\nsample\n';
      manifest.recordFile('.claude/agents/rule.md', content);
      expect(existsSync(join(project.root, '.claude/agents/rule.md'))).toBe(true);
      expect(manifest.files['.claude/agents/rule.md']).toBe(sha256(content));
      expect(manifest.isRecovered('.claude/agents/rule.md')).toBe(false);
    });

    it('rejects absolute path', () => {
      expect(() => manifest.recordFile('/etc/passwd', 'foo')).toThrow();
    });

    it('rejects .. segments', () => {
      expect(() => manifest.recordFile('../escape.txt', 'foo')).toThrow();
    });

    it('discards recovered marker when overwriting as PRODUCED', () => {
      // Pre-existing file marked recovered
      const p = join(project.root, 'foo.txt');
      writeFileSync(p, 'original');
      manifest.recordExisting('foo.txt', true);
      expect(manifest.isRecovered('foo.txt')).toBe(true);
      // Re-record as PRODUCED (we now own it)
      manifest.recordFile('foo.txt', 'new content');
      expect(manifest.isRecovered('foo.txt')).toBe(false);
    });
  });

  describe('recordExisting (OBSERVED)', () => {
    it('marks recovered=true for pre-existing files', () => {
      const p = join(project.root, 'CLAUDE.md');
      writeFileSync(p, 'existing user content\n');
      manifest.recordExisting('CLAUDE.md', true);
      expect(manifest.isRecovered('CLAUDE.md')).toBe(true);
      expect(manifest.recoveredFiles).toContain('CLAUDE.md');
    });

    it('requires the path to be a regular file', () => {
      mkdirSync(join(project.root, 'a-dir'), { recursive: true });
      expect(() => manifest.recordExisting('a-dir', true)).toThrow();
    });
  });

  describe('save/load round-trip', () => {
    it('save() writes manifest JSON with correct shape', () => {
      manifest.recordFile('.claude/agents/rule.md', 'content');
      manifest.save();
      const raw = JSON.parse(readFileSync(manifest.manifestPath, 'utf-8'));
      expect(raw.integration).toBe('aet-design-env');
      expect(raw.version).toBe(1);
      expect(raw.installed_at).toBeTruthy();
      expect(raw.files['.claude/agents/rule.md']).toBeTruthy();
    });

    it('load() round-trips and cross-checks key', () => {
      manifest.recordFile('foo.txt', 'bar');
      manifest.save();
      const loaded = SetupManifest.load('aet-design-env', project.root);
      expect(loaded).not.toBeNull();
      expect(loaded!.files['foo.txt']).toBe(sha256('bar'));
      expect(loaded!.key).toBe('aet-design-env');
    });

    it('load() throws on integration key mismatch', () => {
      manifest.recordFile('foo.txt', 'bar');
      manifest.save();
      // The manifest file is at .aet/design/.manifest/aet-design-env.json
      // with integration:"aet-design-env" inside. Copy it to a different-key
      // path so load('different-key') finds the file but the integration
      // field mismatches.
      const wrongPath = join(project.root, '.aet', 'design', '.manifest', 'different-key.json');
      writeFileSync(wrongPath, readFileSync(manifest.manifestPath));
      expect(() => SetupManifest.load('different-key', project.root)).toThrow();
    });

    it('load() returns null when no manifest exists', () => {
      expect(SetupManifest.load('aet-design-env', project.root)).toBeNull();
    });

    it('load() self-corrects by dropping recovered_files not in files', () => {
      manifest.recordFile('foo.txt', 'bar');
      manifest.recordExisting('foo.txt', true);
      manifest.save();
      // Corrupt: add a recovered_files entry not in files
      const raw = JSON.parse(readFileSync(manifest.manifestPath, 'utf-8'));
      raw.recovered_files = ['foo.txt', 'orphan.txt'];
      writeFileSync(manifest.manifestPath, JSON.stringify(raw, null, 2));
      const loaded = SetupManifest.load('aet-design-env', project.root);
      expect(loaded!.recoveredFiles).toEqual(['foo.txt']);
    });
  });

  describe('uninstall() hash-matched removal', () => {
    it('removes only hash-matched files; preserves modified', () => {
      const unmodified = '.claude/agents/rule.md';
      const userEdited = '.codex/config.toml';
      manifest.recordFile(unmodified, 'original');
      manifest.recordFile(userEdited, 'original');
      manifest.save();
      // User edits userEdited after install
      writeFileSync(join(project.root, userEdited), 'CHANGED BY USER');
      const result = manifest.uninstall();
      expect(result.removed).toContain(unmodified);
      expect(result.skipped).toContain(userEdited);
      expect(existsSync(join(project.root, unmodified))).toBe(false);
      expect(existsSync(join(project.root, userEdited))).toBe(true); // preserved
      // Manifest file itself removed last
      expect(existsSync(manifest.manifestPath)).toBe(false);
    });

    it('never removes recovered (pre-existing) files', () => {
      mkdirSync(join(project.root, '.cursor', 'rules'), { recursive: true });
      const p = join(project.root, '.cursor/rules/rule.mdc');
      writeFileSync(p, 'user wrote this');
      manifest.recordExisting('.cursor/rules/rule.mdc', true);
      manifest.save();
      const result = manifest.uninstall();
      expect(result.skipped).toContain('.cursor/rules/rule.mdc');
      expect(existsSync(p)).toBe(true); // not removed
    });

    it('cleans empty parent dirs up to root', () => {
      manifest.recordFile('.claude/agents/rule.md', 'content');
      manifest.save();
      const result = manifest.uninstall();
      expect(result.removed.length).toBe(1);
      expect(existsSync(join(project.root, '.claude'))).toBe(false);
      expect(existsSync(join(project.root, '.claude/agents'))).toBe(false);
    });

    it('force=true removes modified files too', () => {
      manifest.recordFile('foo.txt', 'original');
      manifest.save();
      writeFileSync(join(project.root, 'foo.txt'), 'CHANGED');
      const result = manifest.uninstall(true);
      expect(result.removed).toContain('foo.txt');
      expect(existsSync(join(project.root, 'foo.txt'))).toBe(false);
    });

    it('still skips recovered files even with force=true', () => {
      const p = join(project.root, 'user.md');
      writeFileSync(p, 'user content');
      manifest.recordExisting('user.md', true);
      manifest.save();
      const result = manifest.uninstall(true);
      expect(result.skipped).toContain('user.md');
      expect(existsSync(p)).toBe(true);
    });
  });

  describe('checkModified() disk-vs-manifest', () => {
    it('classifies present/modified/missing', () => {
      manifest.recordFile('a.txt', 'aaa');
      manifest.recordFile('b.txt', 'bbb');
      manifest.recordFile('c.txt', 'ccc');
      manifest.save();
      // Modify b, delete c, leave a unchanged
      writeFileSync(join(project.root, 'b.txt'), 'CHANGED');
      rmSync(join(project.root, 'c.txt'));
      const check = manifest.checkModified();
      expect(check.present).toContain('a.txt');
      expect(check.modified).toContain('b.txt');
      expect(check.missing).toContain('c.txt');
    });

    it('treats symlinks/non-regular as modified', () => {
      manifest.recordFile('a.txt', 'aaa');
      manifest.save();
      // Replace a.txt with a symlink → should appear as modified
      const target = join(project.root, 'target.txt');
      writeFileSync(target, 'target');
      const link = join(project.root, 'a.txt');
      rmSync(link);
      try {
        symlinkSync(target, link);
      } catch {
        return; // platform doesn't support symlinks
      }
      const check = manifest.checkModified();
      expect(check.modified).toContain('a.txt');
    });
  });
});

describe('SetupManifest symlink rejection', () => {
  let project: { root: string; cleanup: () => void };
  beforeEach(() => { project = makeTempProject(); });
  afterEach(() => { project.cleanup(); });

  it('recordExisting rejects symlinks', () => {
    const targetPath = join(project.root, 'real.txt');
    const symlinkPath = join(project.root, 'link.txt');
    writeFileSync(targetPath, 'real');
    try {
      symlinkSync(targetPath, symlinkPath);
    } catch {
      return; // platform doesn't support symlinks
    }
    const manifest = new SetupManifest('aet-design-env', project.root);
    expect(() => manifest.recordExisting('link.txt', true)).toThrow();
  });
});
