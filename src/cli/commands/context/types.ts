/**
 * @file src/cli/commands/context/types.ts
 *
 * Layer 3 — Plugin contract for the `aet context` command.
 *
 * Each plugin lives in its own file under `src/cli/commands/context/` and
 * exports a `plugin: Plugin` value. The barrel `index.ts` collects all
 * plugins into a single `plugins` array consumed by the dispatcher in
 * `src/cli/commands/context/run.ts`.
 *
 * To add a new plugin:
 *   1. Create `src/cli/commands/context/<your-plugin>.ts` exporting
 *      `plugin: Plugin`.
 *   2. Add one import + one array entry to `index.ts`.
 *   3. Rebuild (`npm run build`).
 *
 * Plugins receive the resolved project root (cwd by default, or a path
 * supplied via `aet context --root <path> <plugin>`) and return an
 * XML-tagged string, or null when there is nothing to report for this
 * project (the dispatcher skips null results).
 *
 * Design note: context plugins are READ-ONLY metadata probes. They MUST
 * NOT mutate the project, write to `.aet/`, or invoke the EventBus /
 * WorkflowEngine. Their output is consumed directly by coding agents as
 * project-state hints — there is no CommandResult envelope, no events[]
 * channel, no data.status lifecycle semantics. This keeps context
 * queries orthogonal to the workflow lifecycle (init / handover /
 * status / abort).
 */
export interface Plugin {
  /** Lowercase identifier used on the CLI: `aet context <name>`. */
  name: string;
  /** Short human-readable description shown in `--help` / plugin listing. */
  description: string;
  /**
   * Collect context metadata for this plugin from the given project root.
   * Return the XML string to emit, or null when there is nothing to
   * report for this project (the dispatcher skips null results and
   * prints `[<name>] no data found` to stderr).
   */
  run(root: string): string | null;
}
