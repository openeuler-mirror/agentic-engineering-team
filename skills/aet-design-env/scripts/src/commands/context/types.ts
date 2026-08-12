/**
 * Plugin contract for the `context` command.
 *
 * Each plugin lives in its own file under `scripts/src/context/` and exports a
 * `plugin: Plugin` value. The barrel `scripts/src/context/index.ts` collects
 * all plugins into a single `plugins` array consumed by the dispatcher in
 * `scripts/src/context.ts`.
 *
 * To add a new plugin:
 *   1. Create `scripts/src/context/<your-plugin>.ts` exporting `plugin: Plugin`.
 *   2. Add one import + one array entry to `scripts/src/context/index.ts`.
 *   3. Rebuild (`node build.mjs`).
 *
 * Plugins receive the resolved project root (either cwd or a path arg supplied
 * by the caller) and return an XML-tagged string, or null when no data is
 * available for this project.
 */
export interface Plugin {
  /** Lowercase identifier used on the CLI: `context <name>`. */
  name: string;
  /** Short human-readable description shown in `--help` / plugin listing. */
  description: string;
  /**
   * Collect context metadata for this plugin from the given project root.
   * Return the XML string to emit, or null when there is nothing to report
   * (the dispatcher skips null results).
   */
  run(root: string): string | null;
}
