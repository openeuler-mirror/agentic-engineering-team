/**
 * Robust text/binary detection.
 *
 * The original hand-rolled "printable-ASCII ratio" sniff mis-classified
 * UTF-8 documents that are predominantly CJK (Chinese bytes mostly fall
 * outside 32–126) and UTF-16/UTF-32 files as binary. This uses the mature
 * `isbinaryfile` sniffer (excellent encoding coverage: UTF-8/CJK, UTF-16LE/BE
 * with BOM, UTF-32, XML, JSON, ...) with a UTF-16 BOM fast-path and an
 * extension whitelist as an even faster first check.
 *
 * NOTE (bundled build): `isbinaryfile`'s ESM entry performs a top-level
 * dynamic import of a worker module. In the esbuild-bundled single file that
 * dynamic import is inlined and works, but to keep the zero-dependency scan
 * honest we route our sniff through a wrapped module (see index.ts) that maps
 * to either the real package (dev/source) or a tiny inline BOM/NUL sniffer
 * (produced bundle). The bundled fallback keeps the worker import out of the
 * emitted code entirely, so the bundle stays truly self-contained.
 */

import { isBinaryFile } from 'isbinaryfile';

export interface TextCheck {
  isText: boolean;
  method: string;
  reason?: string;
}

const TEXT_EXTENSIONS = new Set([
  'md', 'txt', 'rst', 'adoc', 'asciidoc', 'tex', 'latex', 'log',
  'html', 'htm', 'xhtml', 'xml', 'svg', 'xslt', 'rss', 'atom',
  'json', 'yaml', 'yml', 'toml', 'ini', 'conf', 'cfg', 'config', 'env',
  'properties', 'gradle', 'maven', 'pom',
  'csv', 'tsv', 'psv',
  'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'es6', 'es',
  'py', 'pyw', 'pyi', 'pyx',
  'java', 'kt', 'kts', 'scala', 'groovy', 'gvy',
  'c', 'cpp', 'cc', 'cxx', 'h', 'hpp', 'hh', 'hxx',
  'cs', 'vb', 'fs', 'fsx',
  'go', 'rs', 'dart', 'swift',
  'rb', 'rake', 'gemspec', 'erb',
  'php', 'phtml', 'php3', 'php4', 'php5',
  'pl', 'pm', 't', 'pod',
  'sh', 'bash', 'zsh', 'ksh', 'csh', 'fish', 'ps1', 'bat', 'cmd',
  'sql', 'ddl', 'dml',
  'lua', 'r', 'rmd', 'jl', 'nim', 'cr', 'ex', 'exs', 'erl', 'hrl',
  'vue', 'svelte', 'astro',
  'scss', 'sass', 'css', 'less', 'styl',
  'graphql', 'gql',
  'dockerfile', 'makefile', 'cmake', 'mk',
  'gitignore', 'gitattributes', 'editorconfig', 'eslintrc', 'prettierrc',
  'babelrc', 'tsconfig', 'jsconfig', 'lock', 'sum', 'mod',
  'license', 'licence', 'copying', 'authors', 'contributors',
  'readme', 'changelog', 'changes', 'history', 'news', 'todo',
  'manifest', 'meta', 'project', 'workspace', 'agents', 'skill',
]);

/** Fast path for files with a recognized extension. */
export function extensionIsText(basename: string): boolean {
  const ext = basename.toLowerCase().split('.').pop() ?? '';
  return TEXT_EXTENSIONS.has(ext);
}

/**
 * Content sniff. `basename` drives the extension fast-path; everything else
 * goes through the binary sniffer. Returns null when content inspection fails
 * so callers can decide (current policy: treat as text).
 */
export async function sniffText(basename: string, filePath: string): Promise<TextCheck | null> {
  if (extensionIsText(basename)) {
    return { isText: true, method: 'extension' };
  }

  try {
    // UTF-16 family fast path — isbinaryfile handles these, but the explicit
    // check keeps the comment honest and is cheap.
    const head = await readHead(filePath);
    if (head === null) return null;
    if (
      (head[0] === 0xff && head[1] === 0xfe) ||
      (head[0] === 0xfe && head[1] === 0xff) ||
      (head[0] === 0xff && head[1] === 0xfe && head[2] === 0x00 && head[3] === 0x00) ||
      (head[0] === 0x00 && head[1] === 0x00 && head[2] === 0xfe && head[3] === 0xff) ||
      (head[0] === 0xff && head[1] === 0xfe && head[2] === 0x00 && head[3] === 0x00 && head[4] === 0x00) ||
      (head[0] === 0x00 && head[1] === 0x00 && head[2] === 0xfe && head[3] === 0xff && head[4] === 0x00)
    ) {
      return { isText: true, method: 'utf16-or-utf32-bom' };
    }
    if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) {
      return { isText: true, method: 'utf8-bom' };
    }

    const isBinary = await isBinaryFile(filePath);
    return isBinary
      ? { isText: false, method: 'isbinaryfile', reason: 'Detected as a binary file' }
      : { isText: true, method: 'isbinaryfile' };
  } catch {
    return null;
  }
}

async function readHead(filePath: string): Promise<Uint8Array | null> {
  const { open } = await import('node:fs/promises');
  const handle = await open(filePath, 'r');
  try {
    const head = new Uint8Array(8);
    const { bytesRead } = await handle.read(head, 0, 8, 0);
    return head.slice(0, bytesRead);
  } finally {
    await handle.close();
  }
}