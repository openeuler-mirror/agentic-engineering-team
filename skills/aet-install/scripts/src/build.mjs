#!/usr/bin/env node
/**
 * Build script — bundles install.ts into the parent scripts/ dir as a
 * self-contained, zero-install .cjs bundle. esbuild transpiles TypeScript +
 * inlines all imported deps (cross-spawn) so the shipped install.cjs stays
 * zero-dependency at runtime (only `node:*` builtins). The built install.cjs
 * is COMMITTED to the repo (aet-design-env pattern) and carried into every
 * host dist by copySkills — the main build.mjs only verifies presence +
 * chmod + assembles cli/runtime around it.
 *
 * Usage: npm run build   (or: node build.mjs)
 */
import { build } from 'esbuild';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = __dirname;
const outDir = join(__dirname, '..');

const entryFiles = ['install.ts'];

if (entryFiles.length === 0) {
  console.error('No .ts entry files found in', srcDir);
  process.exit(1);
}

for (const file of entryFiles) {
  const src = join(srcDir, file);
  const outName = file.replace(/\.ts$/, '.cjs');
  const out = join(outDir, outName);
  await build({
    entryPoints: [src],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile: out,
    target: 'node18',
    banner: { js: '#!/usr/bin/env node' },
    legalComments: 'none',
    sourcemap: false,
    minify: false,
    treeShaking: true,
  });
  console.log(`built ${file} -> ../${outName}`);
}

console.log(`Built ${entryFiles.length} script(s).`);
