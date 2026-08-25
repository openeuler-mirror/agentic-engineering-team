/**
 * Plugin: project-analysis
 *
 * Assembles the <project-analysis> XML block from
 * `{root}/.aet/project-analysis/{Architecture.md, Modules.md, components/, principles/}`.
 *
 * This is a faithful TypeScript port of `formatProjectAnalysis()` in
 * `.opencode/plugins/aet.js` (lines 107-193), including the inlined helper
 * functions (lines 22-105). Output is byte-identical to that reference:
 *   - Returns null if .aet/project-analysis/ does not exist.
 *   - Returns null on any read/parse exception.
 *   - Otherwise returns a string (may be `<project-analysis>\n</project-analysis>`
 *     when the folder exists but no usable content is found).
 *   - architecture/modules: absolute path + full untrimmed content.
 *   - components/principles: a section is emitted when ANY item has non-empty
 *     frontmatter; individual items are emitted only when they have a
 *     description field. This can yield an empty `<components></components>` block.
 *   - extractDescriptionFromFrontmatter regex `^description:` is line-anchored,
 *     so leading whitespace on the key line prevents a match (matches aet.js).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from './types';

// ============================================
// Helpers (ported from aet.js, lines 22-105)
// ============================================

/** Accept a string or {path: string} object and return the string form. */
export function ensureStringPath(input: unknown): string | null {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object' && typeof (input as { path?: unknown }).path === 'string') {
    return (input as { path: string }).path;
  }
  return null;
}

/** Extract the raw frontmatter block (between --- markers, exclusive). */
export function extractFrontmatter(content: string | null | undefined): string {
  if (!content || typeof content !== 'string') {
    return '';
  }
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  return match ? match[1] : '';
}

/** Read a markdown file; return null if missing or unreadable. */
export function readMarkdownFile(filePath: string | null | undefined): string | null {
  if (!filePath) return null;
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, 'utf-8');
}

/** Read a markdown file and return only its frontmatter block (or null). */
export function readMarkdownMetadata(filePath: string | null | undefined): string | null {
  const content = readMarkdownFile(filePath);
  if (!content) return null;
  const metadata = extractFrontmatter(content);
  return metadata || null;
}

/** Extract the description field from a frontmatter block. Supports quoted values. */
export function extractDescriptionFromFrontmatter(frontmatter: string | null | undefined): string | null {
  if (!frontmatter || typeof frontmatter !== 'string') return null;
  const match = frontmatter.match(/^description:\s*(?:["'](.+?)["']|(.+))$/m);
  return match ? (match[1] || match[2]).trim() : null;
}

/** Find a file in dirPath matching filename case-insensitively. */
export function findCaseInsensitiveFile(dirPath: string | null, filename: string | null): string | null {
  if (!dirPath || !filename) return null;
  if (!existsSync(dirPath)) return null;
  const lowerTarget = filename.toLowerCase();
  const files = readdirSync(dirPath);
  const match = files.find((f) => f.toLowerCase() === lowerTarget);
  return match ? join(dirPath, match) : null;
}

/** List all *.md files (case-insensitive ext) under dirPath as absolute paths. */
export function getMarkdownFiles(dirPath: string | null | undefined): string[] {
  if (!dirPath) return [];
  if (!existsSync(dirPath)) return [];
  const files = readdirSync(dirPath);
  return files.filter((f) => f && f.toLowerCase().endsWith('.md')).map((f) => join(dirPath, f));
}

// ============================================
// Core: formatProjectAnalysis (aet.js 107-193)
// ============================================

/**
 * Assemble the <project-analysis> XML block from .aet/project-analysis/.
 * See module docstring for the byte-alignment contract with aet.js.
 */
export function formatProjectAnalysis(projectRootInput: unknown): string | null {
  try {
    const root = ensureStringPath(projectRootInput);
    if (!root) return null;

    const analysisDir = join(root, '.aet', 'project-analysis');
    if (!existsSync(analysisDir)) return null;

    const architecturePath = findCaseInsensitiveFile(analysisDir, 'Architecture.md');
    const modulesPath = findCaseInsensitiveFile(analysisDir, 'Modules.md');
    const componentsDir = join(analysisDir, 'components');
    const principlesDir = join(analysisDir, 'principles');

    let output = '<project-analysis>\n';

    const architectureContent = architecturePath ? readMarkdownFile(architecturePath) : null;
    if (architectureContent) {
      output += '\n<architecture>\n';
      output += `<path>${architecturePath}</path>\n`;
      output += `<content>${architectureContent}</content>\n`;
      output += '</architecture>\n';
    }

    const modulesContent = modulesPath ? readMarkdownFile(modulesPath) : null;
    if (modulesContent) {
      output += '\n<modules>\n';
      output += `<path>${modulesPath}</path>\n`;
      output += `<content>${modulesContent}</content>\n`;
      output += '</modules>\n';
    }

    const componentFiles = getMarkdownFiles(componentsDir);
    const validComponents: Array<{ filePath: string; description: string | null }> = [];
    for (const filePath of componentFiles) {
      const metadata = readMarkdownMetadata(filePath);
      if (metadata && metadata.trim().length > 0) {
        const description = extractDescriptionFromFrontmatter(metadata);
        validComponents.push({ filePath, description });
      }
    }
    if (validComponents.length > 0) {
      output += '\n<components>\n';
      for (const item of validComponents) {
        if (item.description) {
          output += '<item>\n';
          output += `<path>${item.filePath}</path>\n`;
          output += `<description>${item.description}</description>\n`;
          output += '</item>\n';
        }
      }
      output += '</components>\n';
    }

    const principleFiles = getMarkdownFiles(principlesDir);
    const validPrinciples: Array<{ filePath: string; description: string | null }> = [];
    for (const filePath of principleFiles) {
      const metadata = readMarkdownMetadata(filePath);
      if (metadata && metadata.trim().length > 0) {
        const description = extractDescriptionFromFrontmatter(metadata);
        validPrinciples.push({ filePath, description });
      }
    }
    if (validPrinciples.length > 0) {
      output += '\n<principles>\n';
      for (const item of validPrinciples) {
        if (item.description) {
          output += '<item>\n';
          output += `<path>${item.filePath}</path>\n`;
          output += `<description>${item.description}</description>\n`;
          output += '</item>\n';
        }
      }
      output += '</principles>\n';
    }

    output += '</project-analysis>';
    return output;
  } catch (err) {
    // Log the full error (including stack trace) to stderr so debugging is
    // possible. Return null to signal "no project-analysis data" — this
    // is a faithful port of aet.js's contract: the plugin is best-effort,
    // and a malformed/missing project-analysis directory should not crash
    // the context assembly. The caller (context.ts) treats null as "skip
    // this plugin" and continues with other plugins.
    const e = err as Error;
    console.error('[project-analysis] formatProjectAnalysis error:', e.message);
    if (e.stack) console.error(e.stack);
    return null;
  }
}

// ============================================
// Plugin export
// ============================================

export const plugin: Plugin = {
  name: 'project-analysis',
  description: '读取 .aet/project-analysis/ 目录，组装 architecture/modules/components/principles',
  run: (root: string): string | null => formatProjectAnalysis(root),
};
