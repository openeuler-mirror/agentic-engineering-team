import { defineConfig } from 'vitest/config';

// Local vitest config so the skill test run is SELF-CONTAINED and does NOT
// inherit the root repo's vitest.config.ts (whose `include: src/**/*.test.ts`
// resolves to a non-existent path under this cwd, causing "No test files
// found"). Scoping include to the cwd makes `*.test.ts` here resolve correctly.
export default defineConfig({
  test: {
    include: ['*.test.ts', '**/*.test.ts'],
    exclude: ['node_modules/**'],
  },
});
