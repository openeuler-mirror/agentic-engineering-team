/**
 * @file src/cli/index.ts
 *
 * Layer 3 — `aet` CLI main entry.
 *
 * Routes `aet <resource> <action> [flags]` to a registered CommandSpec.
 * Unknown / not-yet-registered commands yield a helpful error — never
 * throws, never silently no-ops (per 新方案.md §1.3 "降级一致").
 *
 * This iteration ships eight commands:
 *   - `aet workflow init --name …`
 *   - `aet workflow handover [--step …]`
 *   - `aet workflow continue`              (state recovery; re-emit current step)
 *   - `aet workflow status`
 *   - `aet workflow abort [--reason …]`
 *   - `aet workflow list`                   (read-only list of all workflows + commands)
 *   - `aet context [plugin-name ...] [--root …]`
 *   - `aet plugin init [--agent …]`        (generate agent command/skill files)
 *
 * Plus one INTERNAL (plugin-only, hidden from --help) dispatcher:
 *   - `aet event <name>`                    (dispatch a non-workflow event,
 *                                            e.g. `aet event ca-stop`)
 *
 * Stateful Core contract: the CLI is a thin transformer. Core owns the
 * active-workflow + current-step state in `<projectRoot>/.aet/core-checkpoint/`;
 * the caller never re-states it. One active workflow per project root is
 * the supported model. The CLI is agent-agnostic: it accepts no `--agent`
 * flag. The caller declares its desired encoding via `--output json|prompt`
 * (default `prompt`). In-process plugins (opencode / claude-code) spawn the
 * CLI with `--output json`; bare bash / fallback agents use the default.
 *
 * Adding a new command is a 3-step patch:
 *   1. implement `cli/commands/<name>.ts` exporting a `CommandSpec`
 *   2. import it here
 *   3. add a row to `COMMANDS` below
 */

import { createEventBus } from '../core/event_bus.js';
import type { EventBus } from '../core/event_bus.js';

import { parseArgs } from './args.js';
import { encodeJson } from './encoder/json_encoder.js';
import { err } from '../definitions/events.js';
import { workflowInitSpec } from './commands/workflow/init.js';
import { workflowHandoverSpec } from './commands/workflow/handover.js';
import { workflowContinueSpec } from './commands/workflow/continue.js';
import { workflowStatusSpec } from './commands/workflow/status.js';
import { workflowAbortSpec } from './commands/workflow/abort.js';
import { workflowListSpec } from './commands/workflow/list.js';
import { workflowContextSpec } from './commands/context/run.js';
import { workflowCommandInitSpec } from './commands/workflow/command_init.js';
import { pluginInitSpec } from './commands/plugin/init.js';
import { eventDispatchSpec } from './commands/event/dispatch.js';
import type { CommandOutput, CommandSpec } from './commands/base.js';

// ---------------------------------------------------------------------------
// Command registry
// ---------------------------------------------------------------------------

/**
 * Keyed by `<resource>.<action>` (e.g. `workflow.init`) and also by
 * `<resource> <action>`. The `context` spec is a special case: its id
 * is the bare resource (`context`), so any `aet context <plugin-name>`
 * invocation falls through to it via the resource-only fallback in
 * {@link findCommand} — the dispatcher handles dynamic action values
 * (plugin names like `aet-tools`) internally.
 */
const COMMANDS: CommandSpec[] = [
  workflowInitSpec,
  workflowHandoverSpec,
  workflowContinueSpec,
  workflowStatusSpec,
  workflowAbortSpec,
  workflowListSpec,
  workflowContextSpec,
  pluginInitSpec,
  workflowCommandInitSpec,
  eventDispatchSpec,
];

/**
 * Resolve a CommandSpec from the parsed `resource` and `action`.
 *
 * Matching order:
 *   1. Exact `<resource>.<action>` (e.g. `workflow.init`)
 *   2. Exact `<resource> <action>` (e.g. `workflow init`)
 *   3. Bare `<resource>` (e.g. `context`) — used by dispatcher-style
 *      specs whose second positional is a dynamic value (plugin name),
 *      not a fixed action word.
 */
function findCommand(resource: string, action: string): CommandSpec | undefined {
  const compositeDot = `${resource}.${action}`;
  const compositeSpace = `${resource} ${action}`;
  return COMMANDS.find(
    (c) => c.id === compositeDot || c.id === compositeSpace || c.id === resource,
  );
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export interface CliRunOptions {
  /** Defaults to process.cwd(). */
  projectRoot?: string;
  /** Defaults to os.homedir(). */
  globalRoot?: string;
  /** Override stdout writer (defaults to console.log). */
  writer?: (text: string) => void;
}

/**
 * Run the CLI with the given argv (i.e. `process.argv.slice(2)`).
 *
 * Returns the exit code; the encoded output is written via `writer`
 * (default: `console.log`).
 */
export async function runCli(argv: string[], opts: CliRunOptions = {}): Promise<number> {
  const writer = opts.writer ?? ((t: string) => console.log(t));

  // Top-level flags handled before command dispatch.
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    writer(HELP_TEXT);
    return 0;
  }
  if (argv.includes('--version') || argv.includes('-v')) {
    writer(VERSION_TEXT);
    return 0;
  }

  const parsed = parseArgs(argv);
  if (parsed.positionals.length === 0) {
    writer(formatError('USAGE_ERROR', 'Expected form: aet <resource> <action> [flags]. Run `aet --help` for usage.'));
    return 1;
  }

  // Positionals[0] is the resource; [1] (if present) is the action.
  // Dispatcher-style specs (e.g. `context`) may run with zero actions
  // (`aet context` runs all plugins), so a single positional is valid
  // when it matches a resource-only spec id.
  const [resource, action = ''] = parsed.positionals;
  const remaining = parsed.positionals.slice(2);

  const spec = findCommand(resource, action);
  if (!spec) {
    writer(
      formatError(
        'UNKNOWN_COMMAND',
        parsed.positionals.length === 1
          ? `No command "aet ${resource}" is registered. Run "aet --help" for available commands.`
          : `No command "aet ${resource} ${action}" is registered. Run "aet --help" for available commands.`,
      ),
    );
    return 1;
  }

  // Build the argv the command will re-parse. For composite-id specs
  // (e.g. `workflow.init`), drop the resource AND action — the command
  // owns flag parsing only. For dispatcher-style specs (id === resource,
  // e.g. `context`), drop ONLY the resource — the action (e.g. plugin
  // name) is a positional the dispatcher consumes itself, and may be
  // followed by more positionals (`aet context aet-tools scenario-lib`).
  const isDispatcherStyle = spec.id === resource;
  const cmdArgv = isDispatcherStyle
    ? [...parsed.positionals.slice(1), ...flattenFlags(parsed.flags)]
    : [...remaining, ...flattenFlags(parsed.flags)];
  if (parsed.raw !== undefined) cmdArgv.push('--', parsed.raw);

  const bus: EventBus = createEventBus({ projectRoot: opts.projectRoot, globalRoot: opts.globalRoot });

  let out: CommandOutput;
  try {
    out = await spec.run(bus, cmdArgv);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const errorResult = err('INTERNAL', msg);
    out = {
      stdout: encodeJson(errorResult),
      exitCode: 1,
    };
  }

  writer(out.stdout);
  return out.exitCode;
}

// ---------------------------------------------------------------------------
// Help / version
// ---------------------------------------------------------------------------

// The version is baked in at build time by esbuild `define __AET_VERSION__`
// (see src/scripts/build.mjs CLI bundle). Falling back to 0.0.0-dev keeps the
// unbundled/test contexts working (`aet 0.` prefix match in index.test.ts).
declare const __AET_VERSION__: string | undefined;
const VERSION_TEXT = `aet ${typeof __AET_VERSION__ !== 'undefined' ? __AET_VERSION__ : '0.0.0-dev'}`;

const HELP_TEXT = `aet — Agentic Engineering Team CLI

USAGE
  aet <resource> <action> [flags]
  aet <resource> [positional...] [flags]   (dispatcher-style: context)

COMMANDS
${formatCommandsSection()}

FLAGS
  --output <mode>     Output encoding: json | prompt  (defaults to prompt).
                      In-process plugins inject --output json; bare
                      bash / fallback agents use the default.
                      NOTE: \`context\` does not honor --output — its output
                      is always XML (it bypasses the lifecycle channel).
  --help, -h          Show this help and exit.
  --version, -v       Show CLI version and exit.

workflow init
  --name <id>         Workflow name (e.g. "design", "implement").
                      (init binds NO session — a workflow spans stages; each
                       stage binds its session on entry via handover/continue)

workflow handover
  (no required flags — Core reads the active workflow + current step
   from its own checkpoint in <projectRoot>/.aet/core-checkpoint/)
  --step <id>         Optional. Explicit next step id (forward skip or
                       backward redo); otherwise advances to next step.
  --session-id <id>   Optional. Coding-agent session entering the next stage
                       (auto-appended by plugin hooks). Binds the CURRENT stage
                       so the ca.stop event verifies the stopping session owns it.

workflow continue
  (no required flags — re-emits the CURRENT step's task prompt (state
   recovery). Unlike handover, does NOT advance — currentStepId stays the
   same; Core re-fires the current step's before hooks and records a
   step_resumed audit entry. Errors NO_ACTIVE_STEP if the workflow was
   init'd but not yet handed over — run "aet workflow handover" first.)
  --session-id <id>   Optional. Coding-agent session resuming the current
                       stage (auto-appended by plugin hooks). Re-binds the
                       CURRENT stage so the ca.stop event verifies the stopping
                       session owns it.

workflow status
  (no flags — Core reads the active workflow from its own checkpoint.
   Returns data.status='active' or 'no_active'. Pure read, no side effects.)

workflow abort
  --reason <text>     Optional. Human-readable reason recorded in the
                      checkpoint history for auditability.

workflow list
  (no flags — reads every workflow AND command declared in the merged
   config. Returns data.status='list' with data.workflows[] /
   data.commands[] populated. Pure read, no side effects.)

context
  --root <path>       Optional. Override project root (default: cwd).
                      Must point to an existing directory — fail fast,
                      no silent cwd fallback. \`--root=<path>\` also accepted.
  [plugin...]         Zero or more plugin names (case-insensitive). With
                      no names, runs all registered plugins. With names,
                      runs only the named set. Unknown names are warned
                      on stderr but do not block other valid plugins.

plugin init
  --agent <id>        Optional. Generate for one agent only (e.g.
                       claude-code, opencode). Omit to generate for all
                       configured agents.
  --root <path>       Optional. Override project root (default: cwd /
                       AET_PROJECT_ROOT).
  (Reads the merged workflow config + the three-layer agents config and
   writes per-agent command/skill files. Idempotent — safe under the CC
   SessionStart hook that auto-runs it each session.)

EXAMPLES
  aet workflow init --name design
  aet workflow handover
  aet workflow handover --step requirements_design
  aet workflow continue                    # state recovery (re-emit current step)
  aet workflow status
  aet workflow abort --reason "wrong direction"
  aet workflow list                    # list all workflows + commands
  aet workflow list --output json      # structured (plugin mode)
  aet workflow init --name bugfix --output json
  aet context aet-tools
  aet context                       # run all plugins
  aet context --root /path/to/proj  # override project root
  aet plugin init                   # generate commands/skills for all agents
  aet plugin init --agent claude-code --output json

ENVIRONMENT
  AET_PROJECT_ROOT    Override project root (default: process.cwd()).
  AET_GLOBAL_ROOT     Override global root (default: os.homedir()).
`;

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function formatError(code: string, message: string): string {
  return encodeJson(err(code, message));
}

/**
 * Dynamically format the COMMANDS section of {@link HELP_TEXT} from the
 * {@link COMMANDS} registry. Filters out specs whose `visibility === 'internal'`
 * (those are documented in AGENTS.md § "Plugin-only 命令（internal）", not in
 * `aet --help`). Each visible spec is rendered as:
 *
 *   `  <helpName padded to NAME_WIDTH><description first line>`
 *
 * If `description` has multiple lines (separated by `\n`), continuation
 * lines are indented to align with the description column. `helpName`
 * defaults to `id.replace('.', ' ')` (e.g. `workflow.init` → `workflow init`)
 * when the spec doesn't override it.
 */
function formatCommandsSection(): string {
  const NAME_WIDTH = 21;
  const CONTINUE_PAD = ' '.repeat(NAME_WIDTH + 2);
  return COMMANDS
    .filter((c) => (c.visibility ?? 'public') === 'public')
    .map((c) => {
      const name = c.helpName ?? c.id.replace('.', ' ');
      const [firstLine, ...rest] = c.description.split('\n');
      const line = `  ${name.padEnd(NAME_WIDTH)}${firstLine}`;
      if (rest.length === 0) return line;
      return line + '\n' + rest.map((r) => CONTINUE_PAD + r).join('\n');
    })
    .join('\n');
}

/** Convert parsed flags back into a flat string[] so a command can re-parse. */
function flattenFlags(flags: Record<string, string | true>): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(flags)) {
    if (v === true) {
      out.push(`--${k}`);
    } else {
      out.push(`--${k}`, v);
    }
  }
  return out;
}
