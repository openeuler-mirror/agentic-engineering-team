/**
 * UT for project-analysis plugin — verifies byte-level alignment with aet.js
 * formatProjectAnalysis() and the ported helper functions.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ensureStringPath,
  extractFrontmatter,
  readMarkdownFile,
  readMarkdownMetadata,
  extractDescriptionFromFrontmatter,
  findCaseInsensitiveFile,
  getMarkdownFiles,
  formatProjectAnalysis,
  plugin,
} from './project-analysis';

function makeTempProject(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'aet-ctx-ut-'));
  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function ensureAnalysisDir(root: string): string {
  const dir = join(root, '.aet', 'project-analysis');
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('plugin metadata', () => {
  it('exposes the expected name and description', () => {
    expect(plugin.name).toBe('project-analysis');
    expect(plugin.description).toContain('project-analysis');
  });
  it('run() delegates to formatProjectAnalysis', () => {
    const { root, cleanup } = makeTempProject();
    try {
      expect(plugin.run(root)).toBeNull(); // no .aet/project-analysis
      ensureAnalysisDir(root);
      expect(plugin.run(root)).toBe('<project-analysis>\n</project-analysis>');
    } finally {
      cleanup();
    }
  });
});

describe('ensureStringPath', () => {
  it('passes string through', () => {
    expect(ensureStringPath('/foo/bar')).toBe('/foo/bar');
  });
  it('extracts .path from object', () => {
    expect(ensureStringPath({ path: '/foo' })).toBe('/foo');
  });
  it('returns null for non-path object', () => {
    expect(ensureStringPath({ other: 'x' })).toBeNull();
  });
  it('returns null for null/undefined/number', () => {
    expect(ensureStringPath(null)).toBeNull();
    expect(ensureStringPath(undefined)).toBeNull();
    expect(ensureStringPath(42)).toBeNull();
  });
});

describe('extractFrontmatter', () => {
  it('extracts block between --- markers', () => {
    expect(extractFrontmatter('---\nkey: value\n---\nbody')).toBe('key: value');
  });
  it('returns empty string when no frontmatter', () => {
    expect(extractFrontmatter('just body')).toBe('');
  });
  it('returns empty string for null/undefined', () => {
    expect(extractFrontmatter(null)).toBe('');
    expect(extractFrontmatter(undefined)).toBe('');
  });
  it('does not match across multiple --- markers incorrectly', () => {
    const content = '---\nkey: value\n---\n---\nother: x\n---';
    expect(extractFrontmatter(content)).toBe('key: value');
  });
});

describe('readMarkdownFile', () => {
  let tmp = '';
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'rm-ut-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('reads existing file', () => {
    const p = join(tmp, 'x.md');
    writeFileSync(p, 'hello');
    expect(readMarkdownFile(p)).toBe('hello');
  });
  it('returns null for missing file', () => {
    expect(readMarkdownFile(join(tmp, 'nope.md'))).toBeNull();
  });
  it('returns null for null input', () => {
    expect(readMarkdownFile(null)).toBeNull();
  });
});

describe('readMarkdownMetadata', () => {
  let tmp = '';
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'rmm-ut-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('returns frontmatter when present', () => {
    const p = join(tmp, 'x.md');
    writeFileSync(p, '---\nkey: v\n---\nbody');
    expect(readMarkdownMetadata(p)).toBe('key: v');
  });
  it('returns null when no frontmatter', () => {
    const p = join(tmp, 'x.md');
    writeFileSync(p, 'just body');
    expect(readMarkdownMetadata(p)).toBeNull();
  });
  it('returns null for missing file', () => {
    expect(readMarkdownMetadata(join(tmp, 'nope.md'))).toBeNull();
  });
});

describe('extractDescriptionFromFrontmatter', () => {
  it('parses plain value', () => {
    expect(extractDescriptionFromFrontmatter('description: hello world')).toBe('hello world');
  });
  it('parses single-quoted value', () => {
    expect(extractDescriptionFromFrontmatter("description: 'hello world'")).toBe('hello world');
  });
  it('parses double-quoted value', () => {
    expect(extractDescriptionFromFrontmatter('description: "hello world"')).toBe('hello world');
  });
  it('does NOT match with leading whitespace (^ anchored)', () => {
    // aet.js regex is /^description:/m — leading whitespace prevents match.
    expect(extractDescriptionFromFrontmatter('  description: x')).toBeNull();
  });
  it('returns null when description key absent', () => {
    expect(extractDescriptionFromFrontmatter('key: value')).toBeNull();
  });
  it('returns null for null/undefined/empty', () => {
    expect(extractDescriptionFromFrontmatter(null)).toBeNull();
    expect(extractDescriptionFromFrontmatter(undefined)).toBeNull();
    expect(extractDescriptionFromFrontmatter('')).toBeNull();
  });
  it('matches multiline frontmatter (m flag)', () => {
    const fm = 'id: c1\ndescription: comp desc\nauthor: me';
    expect(extractDescriptionFromFrontmatter(fm)).toBe('comp desc');
  });
});

describe('findCaseInsensitiveFile', () => {
  let tmp = '';
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'fcif-ut-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('matches exact case', () => {
    writeFileSync(join(tmp, 'Architecture.md'), 'x');
    expect(findCaseInsensitiveFile(tmp, 'Architecture.md')).toBe(join(tmp, 'Architecture.md'));
  });
  it('matches case-insensitively', () => {
    writeFileSync(join(tmp, 'Architecture.md'), 'x');
    expect(findCaseInsensitiveFile(tmp, 'architecture.md')).toBe(join(tmp, 'Architecture.md'));
    expect(findCaseInsensitiveFile(tmp, 'ARCHITECTURE.MD')).toBe(join(tmp, 'Architecture.md'));
  });
  it('returns null when not found', () => {
    expect(findCaseInsensitiveFile(tmp, 'Architecture.md')).toBeNull();
  });
  it('returns null for null dir or filename', () => {
    expect(findCaseInsensitiveFile(null, 'x.md')).toBeNull();
    expect(findCaseInsensitiveFile(tmp, null)).toBeNull();
  });
});

describe('getMarkdownFiles', () => {
  let tmp = '';
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), 'gmf-ut-')); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it('lists *.md files with case-insensitive ext', () => {
    writeFileSync(join(tmp, 'a.md'), 'x');
    writeFileSync(join(tmp, 'B.MD'), 'y');
    writeFileSync(join(tmp, 'c.txt'), 'z');
    const result = getMarkdownFiles(tmp).sort();
    expect(result).toEqual([join(tmp, 'B.MD'), join(tmp, 'a.md')].sort());
  });
  it('returns empty array for missing dir', () => {
    expect(getMarkdownFiles(join(tmp, 'nope'))).toEqual([]);
  });
  it('returns empty array for null input', () => {
    expect(getMarkdownFiles(null)).toEqual([]);
  });
});

describe('formatProjectAnalysis', () => {
  let project: { root: string; cleanup: () => void };
  beforeEach(() => { project = makeTempProject(); });
  afterEach(() => { project.cleanup(); });

  it('returns null when .aet/project-analysis missing', () => {
    expect(formatProjectAnalysis(project.root)).toBeNull();
  });

  it('returns null for null/invalid root', () => {
    expect(formatProjectAnalysis(null)).toBeNull();
    expect(formatProjectAnalysis(42)).toBeNull();
    expect(formatProjectAnalysis({ other: 'x' })).toBeNull();
  });

  it('returns minimal envelope for empty existing folder', () => {
    ensureAnalysisDir(project.root);
    expect(formatProjectAnalysis(project.root)).toBe('<project-analysis>\n</project-analysis>');
  });

  it('emits architecture block with absolute path and untrimmed content', () => {
    const dir = ensureAnalysisDir(project.root);
    const archPath = join(dir, 'Architecture.md');
    writeFileSync(archPath, '# Architecture\n\nDetail line.\n');
    const out = formatProjectAnalysis(project.root);
    expect(out).toBe(
      '<project-analysis>\n' +
      '\n<architecture>\n' +
      `<path>${archPath}</path>\n` +
      `<content># Architecture\n\nDetail line.\n</content>\n` +
      '</architecture>\n' +
      '</project-analysis>'
    );
  });

  it('emits modules block', () => {
    const dir = ensureAnalysisDir(project.root);
    const modPath = join(dir, 'Modules.md');
    writeFileSync(modPath, '# Modules\n');
    const out = formatProjectAnalysis(project.root);
    expect(out).toContain('\n<modules>\n');
    expect(out).toContain(`<path>${modPath}</path>`);
    expect(out).toContain('<content># Modules\n</content>');
  });

  it('matches Architecture.md case-insensitively', () => {
    const dir = ensureAnalysisDir(project.root);
    writeFileSync(join(dir, 'architecture.md'), 'lowercase\n');
    const out = formatProjectAnalysis(project.root);
    expect(out).toContain('<path>' + join(dir, 'architecture.md') + '</path>');
    expect(out).toContain('<content>lowercase\n</content>');
  });

  it('emits components with description, skips items without description', () => {
    const dir = ensureAnalysisDir(project.root);
    const compDir = join(dir, 'components');
    mkdirSync(compDir, { recursive: true });
    writeFileSync(join(compDir, 'a.md'), '---\ndescription: A desc\n---\nbody');
    writeFileSync(join(compDir, 'b.md'), '---\nid: b-no-desc\n---\nbody'); // no description → skipped
    writeFileSync(join(compDir, 'c.md'), 'just body, no frontmatter'); // empty frontmatter → skipped
    const out = formatProjectAnalysis(project.root);
    const aPath = join(compDir, 'a.md');
    expect(out).toContain('\n<components>\n');
    expect(out).toContain(`<item>\n<path>${aPath}</path>\n<description>A desc</description>\n</item>\n`);
    expect(out).not.toContain('b-no-desc');
    expect(out).not.toContain(join(compDir, 'c.md'));
  });

  it('emits principles with description only', () => {
    const dir = ensureAnalysisDir(project.root);
    const prinDir = join(dir, 'principles');
    mkdirSync(prinDir, { recursive: true });
    writeFileSync(join(prinDir, 'p1.md'), '---\ndescription: P1\n---\nbody');
    const out = formatProjectAnalysis(project.root);
    const p1Path = join(prinDir, 'p1.md');
    expect(out).toContain('\n<principles>\n');
    expect(out).toContain(`<item>\n<path>${p1Path}</path>\n<description>P1</description>\n</item>\n`);
  });

  it('emits full assembly with all four sections', () => {
    const dir = ensureAnalysisDir(project.root);
    const archPath = join(dir, 'Architecture.md');
    const modPath = join(dir, 'Modules.md');
    const compDir = join(dir, 'components');
    const prinDir = join(dir, 'principles');
    mkdirSync(compDir, { recursive: true });
    mkdirSync(prinDir, { recursive: true });
    writeFileSync(archPath, '# Arch\n');
    writeFileSync(modPath, '# Mods\n');
    writeFileSync(join(compDir, 'a.md'), '---\ndescription: A\n---\n');
    writeFileSync(join(prinDir, 'p.md'), '---\ndescription: P\n---\n');
    const out = formatProjectAnalysis(project.root);
    expect(out).not.toBeNull();
    // Verify section ordering: architecture → modules → components → principles
    const archIdx = out!.indexOf('<architecture>');
    const modIdx = out!.indexOf('<modules>');
    const compIdx = out!.indexOf('<components>');
    const prinIdx = out!.indexOf('<principles>');
    const closeIdx = out!.indexOf('</project-analysis>');
    expect(archIdx).toBeGreaterThan(0);
    expect(modIdx).toBeGreaterThan(archIdx);
    expect(compIdx).toBeGreaterThan(modIdx);
    expect(prinIdx).toBeGreaterThan(compIdx);
    expect(closeIdx).toBeGreaterThan(prinIdx);
    expect(out!.endsWith('</project-analysis>')).toBe(true);
    expect(out!.endsWith('</project-analysis>\n')).toBe(false);
  });

  it('emits empty <components> block when items have frontmatter but no description', () => {
    // aet.js: section is emitted if ANY item has non-empty frontmatter; individual
    // items are only emitted if they have a description. This yields an empty
    // <components></components> block when all frontmatter-bearing items lack desc.
    const dir = ensureAnalysisDir(project.root);
    const compDir = join(dir, 'components');
    mkdirSync(compDir, { recursive: true });
    writeFileSync(join(compDir, 'b.md'), '---\nid: b\n---\n');
    const out = formatProjectAnalysis(project.root);
    expect(out).toContain('\n<components>\n');
    expect(out).toContain('</components>\n');
    expect(out).not.toContain('<item>');
    expect(out).toBe(
      '<project-analysis>\n' +
      '\n<components>\n' +
      '</components>\n' +
      '</project-analysis>'
    );
  });

  it('returns null when .aet/project-analysis is a file, not a directory (exception path)', () => {
    // Place a regular file where the analysis dir is expected → readdirSync throws ENOTDIR.
    const aetDir = join(project.root, '.aet');
    mkdirSync(aetDir, { recursive: true });
    writeFileSync(join(aetDir, 'project-analysis'), 'not a dir');
    expect(formatProjectAnalysis(project.root)).toBeNull();
  });

  it('logs error to stderr (with stack trace) on exception (Gap 3)', () => {
    // Gap 3 of testability audit: the catch { return null } path was only
    // tested for return value, not for stderr logging. This verifies the
    // error is logged with [project-analysis] prefix + stack trace so
    // debugging is possible when the plugin silently returns null.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const aetDir = join(project.root, '.aet');
      mkdirSync(aetDir, { recursive: true });
      writeFileSync(join(aetDir, 'project-analysis'), 'not a dir');

      expect(formatProjectAnalysis(project.root)).toBeNull();

      // Verify error was logged to stderr
      expect(errorSpy).toHaveBeenCalled();
      const logged = errorSpy.mock.calls
        .map((c) => c.join(' '))
        .join('\n');
      expect(logged).toContain('[project-analysis]');
      // Stack trace should be logged (Error objects have .stack)
      expect(logged.length).toBeGreaterThan(50); // stack trace is verbose
    } finally {
      errorSpy.mockRestore();
    }
  });
});
