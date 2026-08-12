/**
 * @file src/cli/commands/context/index.ts
 *
 * Context plugin registry (barrel).
 *
 * To register a new plugin:
 *   1. Create `src/cli/commands/context/<your-plugin>.ts` exporting
 *      `plugin: Plugin`.
 *   2. Add an import line below and append it to the `plugins` array.
 *   3. Rebuild (`npm run build`).
 *
 * The dispatcher in `./run.ts` imports `plugins` from
 * here. esbuild bundles all plugin files statically into the single
 * `dist/bin/aet.js` output, so runtime discovery is not needed — adding
 * a plugin is a rebuild, not a runtime config change.
 *
 * Currently registered:
 *   - aet-tools   : AET CLI invocation surface (commands, workflows,
 *                   status semantics, invocation modes)
 */
import type { Plugin } from './types.js';
import { plugin as aetTools } from './aet-tools.js';

export const plugins: Plugin[] = [
  aetTools,
];

export type { Plugin } from './types.js';
