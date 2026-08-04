import { defineConfig } from 'vitest/config';

// Vitest config for the AET `src/` test suite.
//
// Tests live colocated with source as src/**/*.test.ts (the suite covers only
// src/). The codebase imports sibling modules with ESM `.js` specifiers
// (`from './foo.js'`), which Vite/Vitest resolve to the `.ts` source by
// default — no extra config needed.
//
// The runtime is deliberately zero-dependency; Vitest is a dev-only test
// runner and never ships in the esbuild bundles.

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Guard against ambient environment leakage into tests that read
    // AET_PROJECT_ROOT / AET_GLOBAL_ROOT (see bin/aet.ts, plugin/init.ts).
    env: {
      AET_PROJECT_ROOT: '',
      AET_GLOBAL_ROOT: '',
    },
    // Tests use real tmp dirs for Core state; each test mkdtemps its own
    // isolated project root so parallel execution cannot race.
    fileParallelism: true,
  },
  coverage: {
    provider: 'v8',
    reporter: ['text', 'html', 'json-summary'],
    include: ['src/**/*.ts'],
    exclude: ['src/**/*.test.ts', 'src/bin/**', 'src/scripts/**', 'src/**/*.md'],
    // Fail the coverage run when thresholds are not met.
    thresholds: {
      lines: 70,
      functions: 60,
      branches: 50,
      statements: 70,
    },
  },
});