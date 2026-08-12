/**
 * context [--root <path>] [plugin-name...]
 *
 * Pluggable context metadata collector. Each plugin reads a specific
 * artifact from the project and emits XML-tagged metadata suitable for
 * consumption by coding agents.
 *
 * With no args        -> run all plugins, print all non-null results.
 * With plugin names   -> run only the named plugins (multiple allowed).
 * With --root <path>  -> override the project root (default: current working
 *                        directory). `--root=/abs/path` (= form) is also
 *                        accepted; `--root /abs/path` (space form) is the
 *                        canonical form. `--root` must point to an EXISTING
 *                        DIRECTORY — a missing path or non-directory is a
 *                        hard error (fail fast, no silent cwd fallback).
 *
 * Argument separation:
 *   `--root` (and `--root=...`) are the ONLY args that affect the project
 *   root. Every OTHER positional arg is treated as a plugin name — even if
 *   it happens to be an existing directory. This eliminates the previous
 *   ambiguity where `context scenario-lib` could be misread as "project
 *   root = ./scenario-lib" when such a subdirectory existed. Use `--root`
 *   explicitly to override the root.
 *
 * Plugin mechanism:
 *   Plugins live as individual files under `scripts/src/context/` and are
 *   registered via the barrel `scripts/src/context/index.ts`. See
 *   `scripts/src/context/types.ts` for the Plugin contract. To add a new
 *   plugin, drop a file and add one line to the barrel — no dispatcher
 *   changes required.
 *
 * Currently registered:
 *   - project-analysis   : .aet/project-analysis/{Architecture,Modules,components,principles}
 *                          (byte-identical port of aet.js formatProjectAnalysis, 107-193)
 *   - scenario-lib       : probes .aet/scenario_library.yml, emits <scenario-library>
 *                          with exists/path/instruction (use library subcommand to browse)
 *   - function-lib       : probes .aet/function_library.yml, emits <function-library>
 *                          with exists/path/instruction (use library subcommand to browse)
 *   - sdr-lib            : probes .aet/sdr_library.yml AND .aet/sec_func_specs.yml,
 *                          emits <sdr> wrapping <sdr-library> + <sec-func-specs>
 *                          sub-blocks, each with exists/path/instruction.
 *                          Joint degradation: the two files form ONE
 *                          composite library — if EITHER is missing, BOTH
 *                          sub-blocks report exists=false (no <path>).
 *   - fmea-lib           : probes .aet/fmea_library.yml, emits <fmea-library>
 *                          with exists/path/instruction (use library subcommand
 *                          to browse the fault-mode library).
 *
 * Stream convention (see index.ts): stdout = XML metadata (data, STs compare
 * this); stderr = warnings ("no data found", "Unknown plugins", listPlugins).
 */
import { existsSync, statSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { projectRoot } from '../../util';
import { plugins } from './index';

function listPlugins(): void {
  console.error('Available context plugins:');
  for (const p of plugins) {
    console.error(`  ${p.name} - ${p.description}`);
  }
}

export function runContext(argv: string[]): void {
  // Parse args: `--root <path>` (or `--root=<path>`) sets the project root;
  // every other positional arg is a plugin name. `--root` with no following
  // value, or pointing at a non-existent path or a non-directory, is a hard
  // error (fail fast: the user's intent is explicit, so an invalid root
  // should not silently fall back to cwd). Defaults to cwd when no `--root`
  // is supplied.
  let rootOverride: string | null = null;
  const pluginArgs: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') {
      const v = argv[i + 1];
      if (v === undefined) {
        console.error('--root requires a value: --root <path>');
        listPlugins();
        process.exit(1);
      }
      rootOverride = v;
      i++; // consume the value
      continue;
    }
    if (a.startsWith('--root=')) {
      rootOverride = a.slice('--root='.length);
      continue;
    }
    pluginArgs.push(a);
  }
  // Fail fast: --root must point to an existing directory. A non-existent
  // path or a non-directory is a hard error — silently falling back to cwd
  // would emit paths the user didn't intend.
  let root: string;
  if (rootOverride !== null) {
    let isDir = false;
    try { isDir = existsSync(rootOverride) && statSync(rootOverride).isDirectory(); } catch { isDir = false; }
    if (!isDir) {
      console.error(`--root must point to an existing directory: ${rootOverride}`);
      listPlugins();
      process.exit(1);
    }
    try { root = realpathSync(rootOverride); }
    catch { root = resolve(rootOverride); }
  } else {
    root = projectRoot();
  }

  if (pluginArgs.length === 0) {
    const outputs: string[] = [];
    const missing: string[] = [];
    for (const p of plugins) {
      const r = p.run(root);
      if (r) outputs.push(r);
      else missing.push(p.name);
    }
    if (outputs.length === 0) {
      console.error('No context metadata found in this project.');
      listPlugins();
      process.exit(1);
    }
    console.log(outputs.join('\n\n'));
    if (missing.length > 0) {
      console.error(`\n[skipped (no data): ${missing.join(', ')}]`);
    }
    return;
  }

  const selected = new Set(pluginArgs.map((s) => s.toLowerCase()));
  const outputs: string[] = [];
  const notFound: string[] = [];
  for (const name of selected) {
    const p = plugins.find((x) => x.name === name);
    if (!p) { notFound.push(name); continue; }
    const r = p.run(root);
    if (r) outputs.push(r);
    else console.error(`[${name}] no data found`);
  }
  if (notFound.length > 0) {
    console.error(`Unknown plugins: ${notFound.join(', ')}`);
    listPlugins();
  }
  if (outputs.length > 0) {
    console.log(outputs.join('\n\n'));
  }
}
