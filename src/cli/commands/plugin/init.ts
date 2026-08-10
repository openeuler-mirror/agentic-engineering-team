/**
 * @file src/cli/commands/plugin/init.ts
 *
 * Layer 3 — `aet plugin init` command.
 *
 * Generates coding-agent command/skill files from the merged workflow config.
 * Unlike the `workflow.*` family, this is a pure file-generation utility: it
 * does NOT dispatch through the EventBus/Core workflow lifecycle. It reads
 * the merged workflow config + the three-layer agents config, then writes
 * per-agent artifacts (CC `.claude/commands/*.md`, OpenCode
 * `.opencode/commands/*.md`) via the generator.
 *
 * Usage:
 *   aet plugin init                          # generate for all configured agents
 *   aet plugin init --agent claude-code      # generate for one agent only
 *   aet plugin init --agent opencode --output json
 *   aet plugin init -g                       # install into the global (~) root
 *   aet plugin init --root /path/to/project
 *
 * Roots resolution (mirrors runCli / the handler's runAet spawn):
 *   projectRoot = --root ?? env.AET_PROJECT_ROOT ?? process.cwd()
 *   globalRoot  = env.AET_GLOBAL_ROOT ?? os.homedir()
 * The SessionStart hook sets env.AET_PROJECT_ROOT=cwd when it spawns this
 * command, so generation lands in the active project. With `-g`, relative
 * destDirs (the default per-project `.claude/commands/aet` etc.) instead
 * resolve against globalRoot, so commands/skills install user-globally.
 */

import { homedir } from 'node:os';

import type { EventBus } from '../../../core/event_bus.js';
import type { OutputMode } from '../../../definitions/events.js';
import { ok } from '../../../definitions/events.js';

import { optionalFlag, parseArgs, requireOutputMode, UsageError } from '../../args.js';
import { ConfigManager } from '../../../core/config_manager.js';
import { loadAgentsConfig, getAgentEntry } from './agents_config.js';
import { generateAll } from './generator.js';

import {
  cliError,
  encodeResult,
  type CommandSpec,
  type CommandOutput,
} from '../base.js';

// ---------------------------------------------------------------------------
// Command spec (consumed by cli/index.ts)
// ---------------------------------------------------------------------------

export const pluginInitSpec: CommandSpec = {
  id: 'plugin.init',
  description:
    'Generate coding-agent command/skill files from the merged workflow config.',
  visibility: 'public',
  run: runPluginInit,
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

async function runPluginInit(_bus: EventBus, argv: string[]): Promise<CommandOutput> {
  const parsed = parseArgs(argv);

  let agent: string | undefined;
  let root: string | undefined;
  let global: boolean;
  let output: OutputMode;

  try {
    agent = optionalFlag(parsed, 'agent');
    root = optionalFlag(parsed, 'root');
    global = parsed.flags.g === true || parsed.flags.global === true;
    output = requireOutputMode(parsed);
  } catch (e) {
    if (e instanceof UsageError) {
      return cliError(e.message, 'USAGE_ERROR');
    }
    throw e;
  }

  // Roots: --root overrides; otherwise the same env vars runCli / the handler
  // use. Resolved here (not read off the bus) because ConfigManager's
  // projectRoot/globalRoot are private — and plugin init is a file-gen
  // utility that has no business touching the workflow lifecycle.
  const projectRoot = root ?? process.env.AET_PROJECT_ROOT ?? process.cwd();
  const globalRoot = process.env.AET_GLOBAL_ROOT ?? homedir();

  const agentsConfig = loadAgentsConfig(projectRoot, globalRoot);

  // Validate an explicit --agent before doing any work; an unknown id is a
  // usage error, not a silent no-op.
  if (agent !== undefined) {
    const entry = getAgentEntry(agentsConfig, agent);
    if (!entry) {
      const known = Object.keys(agentsConfig.agents).join(', ');
      return cliError(
        `Unknown agent "${agent}". Known agents: ${known}.`,
        'UNKNOWN_AGENT',
      );
    }
  }

  const config = new ConfigManager(projectRoot, globalRoot).getConfig();

  const { results } = await generateAll(
    agentsConfig,
    config,
    projectRoot,
    globalRoot,
    agent,
    global,
  );

  return encodeResult(ok(summarize(results)), output);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

function summarize(results: { agent: string; generated: string[]; removed: string[]; skipped: string[] }[]): string {
  const lines: string[] = ['aet plugin init: generation complete'];
  if (results.length === 0) {
    lines.push('  (no agents configured)');
    return lines.join('\n');
  }
  for (const r of results) {
    lines.push(
      `  ${r.agent}: ${r.generated.length} generated, ${r.removed.length} removed` +
        (r.skipped.length ? `, ${r.skipped.length} skipped` : ''),
    );
  }
  return lines.join('\n');
}
