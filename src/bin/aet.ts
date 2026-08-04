/**
 * @file src/bin/aet.ts
 *
 * Layer 3 — bin/aet entry point.
 *
 * Thin executable wrapper that invokes `runCli(process.argv.slice(2))` and
 * exits with the returned code. The build script bundles this file into
 * `dist/bin/aet.js` (with a shebang prepended via esbuild banner) and
 * links it from `bin.aet` in package.json.
 */

import { runCli } from '../cli/index.js';

// Honour AET_PROJECT_ROOT / AET_GLOBAL_ROOT overrides if set.
const projectRoot = process.env['AET_PROJECT_ROOT'];
const globalRoot = process.env['AET_GLOBAL_ROOT'];

const exitCode = await runCli(process.argv.slice(2), {
  projectRoot,
  globalRoot,
});
process.exit(exitCode);
