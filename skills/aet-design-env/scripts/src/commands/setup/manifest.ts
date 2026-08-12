/**
 * SetupManifest — ports Spec Kit's `IntegrationManifest` (manifest.py) to
 * TypeScript. Hash-tracked file inventory for safe env recovery.
 *
 * Architecture (architecture-only reference, content ours):
 *   - On-disk shape: { integration, version, installed_at, files: {rel:sha256}, recovered_files: [rel] }
 *   - Path: {projectRoot}/.aet/design/.manifest/{key}.json
 *   - record_file(rel, content)  → PRODUCED (we wrote it, discard recovered marker).
 *   - record_existing(rel, recovered) → OBSERVED (file pre-existed, don't clobber).
 *   - uninstall(force=false) → only deletes files whose hash STILL MATCHES;
 *     modified files are preserved; cleans empty parent dirs up to root;
 *     removes the manifest file itself last.
 *   - Path validation invariants: reject absolute, `..`, backslash, symlink,
 *     out-of-root resolution (delegated to path-safe.ts).
 *   - Atomic save: tempfile in same parent + fs.renameSync.
 *
 * Difference from Spec Kit:
 *   - Manifest is per-skill-key (we always key on "aet-design-env") and lives
 *     under `.aet/design/.manifest/` rather than `.specify/integrations/`.
 *   - File map is a plain object, not nested per-integration.
 */
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  rmdirSync,
  unlinkSync,
  statSync,
  lstatSync,
  mkdtempSync,
  renameSync,
} from 'node:fs';
import { join, dirname, resolve, sep, posix } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import {
  assertSafeRelativePath,
  assertNotSymlink,
  isRegularFile,
  isPathInside,
  relativizeKey,
} from './path-safe';

const MANIFEST_VERSION = 1;

/** SHA-256 hex digest of a string/buffer. */
export function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Walk each path component from `root` down to `target`, refusing symlinked
 * parents and validating containment after each mkdir. Mirrors Spec Kit's
 * `_ensure_safe_manifest_directory`.
 */
function ensureSafeDirectory(root: string, target: string): void {
  const rel = target.startsWith(root)
    ? target.slice(root.length).replace(/^[/\\]+/, '')
    : '';
  if (!rel) return; // target === root
  const parts = rel.split(/[/\\]+/).filter(Boolean);
  let acc = root;
  for (const part of parts) {
    acc = join(acc, part);
    try {
      const lst = lstatSync(acc);
      if (lst.isSymbolicLink()) {
        throw new Error(`symlinked parent not allowed: ${acc}`);
      }
      if (!lst.isDirectory()) {
        throw new Error(`not a directory (cannot mkdir): ${acc}`);
      }
    } catch (e: any) {
      if (e?.message?.startsWith('symlinked') || e?.message?.startsWith('not a directory')) {
        throw e;
      }
      // doesn't exist yet — create
      mkdirSync(acc, { recursive: false });
      // re-validate containment after creation
      if (!isPathInside(acc, root)) {
        throw new Error(`created path escapes root: ${acc}`);
      }
    }
  }
}

/**
 * Ensure parent dir of `target` exists and is safe (no symlinks, contained).
 * Mirrors Spec Kit's `_ensure_safe_manifest_destination`.
 */
function ensureSafeDestination(root: string, target: string): void {
  const parent = dirname(target);
  ensureSafeDirectory(root, parent);
  if (existsSync(target)) {
    const lst = lstatSync(target);
    if (lst.isSymbolicLink()) {
      throw new Error(`refusing to write to symlink: ${target}`);
    }
  }
}

export interface ManifestFileEntry {
  /** rel POSIX path → sha256 hex */
  files: Record<string, string>;
  /** rel POSIX paths that pre-existed (OBSERVED, not PRODUCED) */
  recovered_files?: string[];
}

export interface ManifestJson {
  integration: string;
  version: number;
  installed_at: string;
  files: Record<string, string>;
  recovered_files?: string[];
}

export interface UninstallResult {
  removed: string[];
  skipped: string[];
}

export interface CheckModifiedResult {
  modified: string[]; // hash differs from recorded
  missing: string[]; // file no longer exists
  present: string[]; // hash matches (clean, ready for uninstall)
  recovered: string[]; // pre-existing files (not removed by uninstall)
}

export class SetupManifest {
  readonly key: string;
  readonly projectRoot: string;
  readonly version: number = MANIFEST_VERSION;
  private _files: Map<string, string> = new Map();
  private _recoveredFiles: Set<string> = new Set();
  private _installedAt: string = '';

  constructor(key: string, projectRoot: string) {
    this.key = key;
    this.projectRoot = resolve(projectRoot);
  }

  /** Manifest JSON file path: {projectRoot}/.aet/design/.manifest/{key}.json */
  get manifestPath(): string {
    return join(this.projectRoot, '.aet', 'design', '.manifest', `${this.key}.json`);
  }

  get files(): Record<string, string> {
    return Object.fromEntries(this._files);
  }

  get recoveredFiles(): string[] {
    return [...this._recoveredFiles];
  }

  get installedAt(): string {
    return this._installedAt;
  }

  isRecovered(rel: string): boolean {
    return this._recoveredFiles.has(rel);
  }

  /**
   * Check if a file is tracked in the manifest (either PRODUCED or
   * RECOVERED). Uses the same key normalization as recordFile/recordExisting
   * so cross-platform path separators don't cause false negatives.
   */
  isTracked(relPath: string): boolean {
    const abs = join(this.projectRoot, relPath);
    const key = relativizeKey(abs, this.projectRoot);
    return this._files.has(key);
  }

  /**
   * Record a file we PRODUCED (wrote content for). Validates the relative
   * path, mkdirs the parent, writes bytes, hashes content, normalizes the
   * path key to POSIX-relative, discards any recovered marker (PRODUCED
   * overrides OBSERVED).
   */
  recordFile(relPath: string, content: string | Buffer): void {
    assertSafeRelativePath(relPath, this.projectRoot);
    const abs = join(this.projectRoot, relPath);
    ensureSafeDestination(this.projectRoot, abs);
    const buf = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;
    writeFileSync(abs, buf);
    const key = relativizeKey(abs, this.projectRoot);
    const hash = sha256(buf);
    this._files.set(key, hash);
    this._recoveredFiles.delete(key);
  }

  /**
   * Record a file that already exists on disk (OBSERVED, not PRODUCED).
   * `recovered=true` marks it as pre-existing so uninstall won't clobber
   * the user's version.
   */
  recordExisting(relPath: string, recovered = false): void {
    assertSafeRelativePath(relPath, this.projectRoot);
    const abs = join(this.projectRoot, relPath);
    assertNotSymlink(abs);
    if (!isRegularFile(abs)) {
      throw new Error(`not a regular file: ${abs}`);
    }
    const buf = readFileSync(abs);
    const key = relativizeKey(abs, this.projectRoot);
    const hash = sha256(buf);
    this._files.set(key, hash);
    if (recovered) {
      this._recoveredFiles.add(key);
    } else {
      this._recoveredFiles.delete(key);
    }
  }

  /** Drop a file from tracking (no disk touch). Returns true if was tracked. */
  remove(relPath: string): boolean {
    const abs = join(this.projectRoot, relPath);
    const key = relativizeKey(abs, this.projectRoot);
    const had = this._files.has(key);
    this._files.delete(key);
    this._recoveredFiles.delete(key);
    return had;
  }

  /**
   * Check disk state vs manifest. Returns buckets:
   *   - modified: hash differs (user edited, preserve on uninstall)
   *   - missing: file gone (already removed)
   *   - present: hash matches (safe to remove on uninstall)
   *   - recovered: pre-existing files (won't be removed)
   */
  checkModified(): CheckModifiedResult {
    const out: CheckModifiedResult = { modified: [], missing: [], present: [], recovered: [] };
    for (const [key, expectedHash] of this._files) {
      const abs = join(this.projectRoot, key.split(posix.sep).join(sep));
      if (this._recoveredFiles.has(key)) {
        out.recovered.push(key);
        continue;
      }
      try {
        const lst = lstatSync(abs);
        if (lst.isSymbolicLink() || !lst.isFile()) {
          out.modified.push(key);
          continue;
        }
        const actual = sha256(readFileSync(abs));
        if (actual === expectedHash) out.present.push(key);
        else out.modified.push(key);
      } catch {
        out.missing.push(key);
      }
    }
    return out;
  }

  /**
   * Remove all tracked files (only those whose hash still matches).
   * Cleans empty parent dirs up to project root. Removes manifest last.
   *
   * `force=true` removes every tracked file regardless of hash (still
   * skips `recovered_files`).
   */
  uninstall(force = false): UninstallResult {
    const result: UninstallResult = { removed: [], skipped: [] };
    const dirsToClean = new Set<string>();

    for (const [key, expectedHash] of this._files) {
      if (this._recoveredFiles.has(key)) {
        result.skipped.push(key);
        continue;
      }
      const abs = join(this.projectRoot, key.split(posix.sep).join(sep));
      if (!existsSync(abs)) {
        result.skipped.push(key);
        continue;
      }
      try {
        const lst = lstatSync(abs);
        if (!lst.isFile() || lst.isSymbolicLink()) {
          if (!force) {
            result.skipped.push(key);
            continue;
          }
        } else {
          // Hash check (unless force)
          if (!force) {
            const actual = sha256(readFileSync(abs));
            if (actual !== expectedHash) {
              result.skipped.push(key);
              continue;
            }
          }
        }
        unlinkSync(abs);
        result.removed.push(key);
        // Collect parent dirs up to project root for cleanup
        let dir = dirname(abs);
        while (dir !== this.projectRoot && dir.length > this.projectRoot.length) {
          dirsToClean.add(dir);
          dir = dirname(dir);
        }
      } catch {
        result.skipped.push(key);
      }
    }

    // Clean empty parent dirs (deepest first). rmdirSync throws ENOTEMPTY
    // for non-empty dirs (expected — user files there); ENOENT for dirs
    // already removed by a prior iteration (expected — race). All other
    // errors (EACCES, EPERM, EBUSY, …) are RE-THROWN so the caller sees a
    // real permission/environment problem instead of a silent partial state.
    const sortedDirs = [...dirsToClean].sort((a, b) => b.length - a.length);
    for (const dir of sortedDirs) {
      try {
        const st = statSync(dir);
        if (st.isDirectory()) {
          try {
            rmdirSync(dir);
          } catch (e: any) {
            if (e?.code !== 'ENOTEMPTY' && e?.code !== 'ENOENT') throw e;
            /* not empty or already removed — skip */
          }
        }
      } catch (e: any) {
        if (e?.code !== 'ENOENT') throw e;
        /* missing — skip */
      }
    }

    // Finally remove manifest file + its parent dirs
    if (existsSync(this.manifestPath)) {
      unlinkSync(this.manifestPath);
      const manifestParent = dirname(this.manifestPath);
      let dir = manifestParent;
      while (dir !== this.projectRoot && dir.length > this.projectRoot.length) {
        try {
          rmdirSync(dir);
        } catch (e: any) {
          if (e?.code !== 'ENOTEMPTY' && e?.code !== 'ENOENT') throw e;
          /* not empty or already removed — skip */
        }
        dir = dirname(dir);
      }
    }

    this._files.clear();
    this._recoveredFiles.clear();

    return result;
  }

  /**
   * Atomic save: write to a temp file in the manifest's parent dir, then
   * rename. Mirrors Spec Kit's tempfile.mkstemp + os.replace pattern.
   */
  save(): void {
    if (!this._installedAt) {
      this._installedAt = new Date().toISOString();
    }
    const data: ManifestJson = {
      integration: this.key,
      version: this.version,
      installed_at: this._installedAt,
      files: this.files,
    };
    if (this._recoveredFiles.size > 0) {
      data.recovered_files = this.recoveredFiles;
    }
    const text = JSON.stringify(data, null, 2) + '\n';
    const buf = Buffer.from(text, 'utf-8');
    const parent = dirname(this.manifestPath);
    ensureSafeDirectory(this.projectRoot, parent);
    // tempfile in same parent (same filesystem → atomic rename)
    const tmpDir = mkdtempSync(join(tmpdir(), `.${this.key}-`));
    const tmpPath = join(tmpDir, 'manifest.json.tmp');
    writeFileSync(tmpPath, buf, { mode: 0o644 });
    // Re-validate destination
    if (existsSync(this.manifestPath)) {
      const lst = lstatSync(this.manifestPath);
      if (lst.isSymbolicLink()) {
        throw new Error(`refusing to overwrite symlink: ${this.manifestPath}`);
      }
    }
    renameSync(tmpPath, this.manifestPath);
    // remove temp dir
    try { rmSync(tmpDir, { recursive: true }); } catch { /* ignore */ }
  }

  /**
   * Load a manifest from disk. Validates shape, cross-checks integration key,
   * self-corrects by dropping recovered_files not in files.
   */
  static load(key: string, projectRoot: string): SetupManifest | null {
    const m = new SetupManifest(key, projectRoot);
    if (!existsSync(m.manifestPath)) return null;
    let raw: any;
    try {
      raw = JSON.parse(readFileSync(m.manifestPath, 'utf-8'));
    } catch {
      return null;
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (raw.integration !== key) {
      throw new Error(
        `manifest integration mismatch: file says ${JSON.stringify(raw.integration)} but requested ${JSON.stringify(key)}`,
      );
    }
    if (!raw.files || typeof raw.files !== 'object' || Array.isArray(raw.files)) {
      throw new Error(`manifest files map is invalid for ${key}`);
    }
    const files: Record<string, string> = raw.files;
    let recovered: string[] = [];
    if (Array.isArray(raw.recovered_files)) {
      recovered = raw.recovered_files.filter((p: unknown) => typeof p === 'string');
    }
    // self-correct: drop recovered entries not in files
    const fileKeys = new Set(Object.keys(files));
    recovered = recovered.filter((k) => fileKeys.has(k));

    m._files = new Map(Object.entries(files));
    m._recoveredFiles = new Set(recovered);
    m._installedAt = typeof raw.installed_at === 'string' ? raw.installed_at : '';
    return m;
  }
}
