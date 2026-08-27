/**
 * @file build.mjs
 *
 * Bundles `src/index.ts` → `../revision.mjs` as a single zero-dependency ESM
 * executable (esbuild, `platform: 'node'`).
 *
 * Mirrors the repository convention in `src/scripts/build.mjs`:
 *   - `node:*` builtins stay external; everything else is inlined.
 *   - The produced bundle is scanned for any non-Node-builtin import/require
 *     and the build FAILS if one is found — keeping `revision.mjs` a truly
 *     zero-dependency artifact that ports cleanly into any AET host
 *     (Claude Code / OpenCode / omp) without a node_modules tree.
 */

import { build } from 'esbuild';
import { chmod } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'revision.mjs');

// Node builtins (drive `findExternalDeps`, below). Includes the `node:`-prefixed
// era across Node 20–24.
const NODE_BUILTINS = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console', 'constants',
  'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain', 'events', 'fs', 'fs/promises',
  'http', 'http2', 'https', 'module', 'net', 'os', 'path', 'path/posix', 'path/win32',
  'perf_hooks', 'process', 'punycode', 'querystring', 'readline', 'repl', 'stream',
  'stream/consumers', 'stream/promises', 'stream/web', 'string_decoder', 'timers',
  'timers/promises', 'tls', 'trace_events', 'tty', 'url', 'util', 'util/types', 'v8',
  'vm', 'wasi', 'worker_threads', 'zlib',
]);

async function findExternalDeps(code) {
  const violations = new Set();
  for (const m of code.matchAll(/require\(\s*["']([^.][^"']*)["']\s*\)/g)) {
    const p = m[1].replace(/^node:/, '');
    if (!NODE_BUILTINS.has(p)) violations.add(p);
  }
  for (const m of code.matchAll(/from\s+["']([^.][^"']*)["']/g)) {
    const p = m[1].replace(/^node:/, '');
    if (!NODE_BUILTINS.has(p)) violations.add(p);
  }
  for (const m of code.matchAll(/(^|\n)\s*import\s+["']([^.][^"']*)["']/g)) {
    const p = m[2].replace(/^node:/, '');
    if (!NODE_BUILTINS.has(p)) violations.add(p);
  }
  return [...violations];
}

await build({
  entryPoints: [join(__dirname, 'index.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: OUT,
  banner: { js: '#!/usr/bin/env node' },
  minify: false,
  sourcemap: false,
  treeShaking: true,
  legalComments: 'none',
  logLevel: 'warning',
});

const code = await readFile(OUT, 'utf8');
const external = await findExternalDeps(code);
if (external.length > 0) {
  throw new Error(
    `[revision:build] bundle violates zero-dependency invariant. ` +
    `External deps found: ${external.join(', ')}`
  );
}

await chmod(OUT, 0o755);
console.log(`[revision:build] ${join('..', 'revision.mjs')} (esm, zero-dep) built.`);