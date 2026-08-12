/**
 * @file src/cli/commands/context/run.ts
 *
 * Layer 3 — `aet context` command (dispatcher).
 *
 * Pluggable context metadata collector. Each plugin reads a specific
 * artifact from the project and emits XML-tagged metadata suitable for
 * consumption by coding agents.
 *
 * Usage:
 *   aet context                       # run all plugins, print all non-null
 *   aet context aet-tools             # run only the named plugin(s)
 *   aet context aet-tools scenario-lib # multiple plugins allowed
 *   aet context --root /path/to/proj  # override project root (must be an
 *                                     # existing directory; fail fast)
 *
 * Argument separation:
 *   `--root` (and `--root=...`) are the ONLY args that affect the
 *   project root. Every OTHER positional arg is treated as a plugin
 *   name — even if it happens to be an existing directory. Use `--root`
 *   explicitly to override the root.
 *
 * Plugin mechanism:
 *   Plugins live as individual files in this directory and are registered
 *   via the barrel `index.ts` (`./index.js`). See `./types.ts` for the
 *   Plugin contract. To add a new plugin, drop a file and add one line to
 *   the barrel — no dispatcher changes required.
 *
 * Stream convention (mirrors aet-design-env/scripts/src/context.ts):
 *   stdout  = XML metadata (data, agents read this)
 *   stderr  = warnings ("no data found", "Unknown plugins",
 *             listPlugins) — best-effort, never blocks stdout
 *   exit 0  = at least one plugin emitted data
 *   exit 1  = no data / unknown plugin combos / bad --root
 *
 * Design note: context commands are READ-ONLY metadata probes. They do
 * NOT invoke the EventBus / WorkflowEngine / Core — they are orthogonal
 * to the workflow lifecycle. The `bus` parameter on `run()` is therefore
 * unused; the CommandSpec signature is preserved for routing uniformity
 * with the lifecycle commands.
 */
import { existsSync, statSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';

import type { EventBus } from '../../../core/event_bus.js';
import type { CommandSpec } from '../base.js';
import { plugins } from './index.js';

export const workflowContextSpec: CommandSpec = {
  id: 'context',
  helpName: 'context [plugin...]',
  description: 'Probe project metadata; emit XML for agents to read.\nWith no plugin args, runs all registered plugins.',
  run: runContext,
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

async function runContext(_bus: EventBus, argv: string[]): Promise<{ stdout: string; exitCode: number }> {
  // Parse args: `--root <path>` (or `--root=<path>`) sets the project
  // root; every other positional arg is a plugin name. `--root` with no
  // following value, or pointing at a non-existent path or a non-directory,
  // is a hard error (fail fast: the user's intent is explicit, so an
  // invalid root should not silently fall back to cwd). Defaults to cwd
  // when no `--root` is supplied.
  let rootOverride: string | null = null;
  const pluginArgs: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') {
      const v = argv[i + 1];
      if (v === undefined) {
        process.stderr.write('--root requires a value: --root <path>\n');
        emitPluginList();
        return { stdout: '', exitCode: 1 };
      }
      rootOverride = v;
      i++;
      continue;
    }
    if (a.startsWith('--root=')) {
      rootOverride = a.slice('--root='.length);
      continue;
    }
    // Unknown flag — surface as a hard error rather than silently
    // treating it as a plugin name (which would then be "unknown").
    if (a.startsWith('--')) {
      process.stderr.write(`Unknown flag: ${a}\n`);
      emitPluginList();
      return { stdout: '', exitCode: 1 };
    }
    pluginArgs.push(a);
  }

  // Fail fast: --root must point to an existing directory. A non-existent
  // path or a non-directory is a hard error — silently falling back to
  // cwd would emit paths the user didn't intend.
  let root: string;
  if (rootOverride !== null) {
    let isDir = false;
    try { isDir = existsSync(rootOverride) && statSync(rootOverride).isDirectory(); } catch { isDir = false; }
    if (!isDir) {
      process.stderr.write(`--root must point to an existing directory: ${rootOverride}\n`);
      emitPluginList();
      return { stdout: '', exitCode: 1 };
    }
    try { root = realpathSync(rootOverride); } catch { root = resolve(rootOverride); }
  } else {
    root = process.cwd();
  }

  // Run plugins.
  const outputs: string[] = [];

  if (pluginArgs.length === 0) {
    // No plugin args: run all registered plugins, print all non-null
    // results. If none produced data, exit 1 with a helpful stderr.
    const missing: string[] = [];
    for (const p of plugins) {
      const r = p.run(root);
      if (r) outputs.push(r);
      else missing.push(p.name);
    }
    if (outputs.length === 0) {
      process.stderr.write('No context metadata found in this project.\n');
      emitPluginList();
      return { stdout: '', exitCode: 1 };
    }
    if (missing.length > 0) {
      process.stderr.write(`\n[skipped (no data): ${missing.join(', ')}]\n`);
    }
    return { stdout: outputs.join('\n\n'), exitCode: 0 };
  }

  // Named plugins: run only the selected set (case-insensitive match).
  // Unknown names are warned on stderr but do NOT block other valid
  // plugins from emitting their data.
  const selected = new Set(pluginArgs.map((s) => s.toLowerCase()));
  const notFound: string[] = [];
  for (const name of selected) {
    const p = plugins.find((x) => x.name === name);
    if (!p) { notFound.push(name); continue; }
    const r = p.run(root);
    if (r) outputs.push(r);
    else process.stderr.write(`[${name}] no data found\n`);
  }
  if (notFound.length > 0) {
    process.stderr.write(`Unknown plugins: ${notFound.join(', ')}\n`);
    emitPluginList();
  }
  if (outputs.length === 0) {
    return { stdout: '', exitCode: 1 };
  }
  return { stdout: outputs.join('\n\n'), exitCode: 0 };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Write the available plugin list to stderr (best-effort guidance). */
function emitPluginList(): void {
  process.stderr.write('Available context plugins:\n');
  for (const p of plugins) {
    process.stderr.write(`  ${p.name} - ${p.description}\n`);
  }
}
