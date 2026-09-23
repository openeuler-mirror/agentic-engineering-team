/**
 * Context plugin registry (barrel).
 *
 * To register a new plugin:
 *   1. Create `<your-plugin>.ts` in this directory exporting `plugin: Plugin`.
 *   2. Add an import line below and append it to the `plugins` array.
 *   3. Rebuild (`node build.mjs`).
 *
 * The dispatcher in `../context.ts` imports `plugins` from here. esbuild
 * bundles all plugin files statically into the single `aet-design-env.mjs`
 * output, so runtime discovery is not needed.
 */
import type { Plugin } from './types';
import { plugin as projectAnalysis } from './project-analysis';
import { plugin as scenarioLibrary } from './scenario-library';
import { plugin as functionLibrary } from './function-library';
import { plugin as sdrLibrary } from './sdr-library';
import { plugin as fmeaLibrary } from './fmea-library';
import { plugin as architectureElementLibrary } from './architecture-element-library';

export const plugins: Plugin[] = [
  projectAnalysis,
  scenarioLibrary,
  functionLibrary,
  sdrLibrary,
  fmeaLibrary,
  architectureElementLibrary,
];

export type { Plugin } from './types';
