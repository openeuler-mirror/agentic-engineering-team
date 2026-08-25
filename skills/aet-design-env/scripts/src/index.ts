/**
 * aet-design-env — unified entry point dispatching to 6 subcommands.
 *
 * Usage:
 *   node scripts/aet-design-env.mjs <command> [args...]
 *
 * Commands:
 *   setup <agent|all>           Inject rule + permissions into a coding agent
 *   context [--root <path>] [plugin-name...]
 *                              Collect context metadata (pluggable)
 *   template <template-set-path>
 *                              Assemble a document from a plugin chain
 *   checklist <checklist-set-path>
 *                              Assemble a checklist document from a plugin chain
 *   library <library.yml> [node-id...]
 *                               Browse a library YAML as a tree
 *   check [project-root]      Audit env config and plugin configs for issues
 *
 * Options:
 *   --version, -v               Print build identity (bundle path, mtime, sha256)
 *   --help, -h                  Show usage
 *
 * All commands dispatch through this single entry point. build.mjs emits
 * one bundle (aet-design-env.mjs); there are no per-command .mjs scripts.
 *
 * Stream convention (Unix):
 *   stdout = data / result (for pipelines & byte-comparison STs)
 *   stderr = diagnostics / warnings / errors (NOT for byte-comparison)
 * STs should compare stdout only; stderr may contain non-deterministic
 * content (stack traces, paths). This convention is enforced in all 6
 * subcommand files.
 */
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runSetup } from './commands/setup';
import { runContext } from './commands/context/context';
import { runTemplate } from './commands/template/template';
import { runChecklist } from './commands/checklist/checklist';
import { runLibrary } from './commands/library/library';
import { runCheck } from './commands/check/check';

const USAGE = `aet-design-env — AET design environment tool

Usage: aet-design-env <command> [args...]

Commands:
  setup <agent|all>          Inject rule + permissions into a coding agent
  context [--root <path>] [plugin-name...]
                               Collect context metadata (pluggable)
  template <template-set-path>
                               Assemble a document from a plugin chain
  checklist <checklist-set-path>
                               Assemble a checklist document from a plugin chain
  library <library.yml> [node-id...]
                               Browse a library YAML as a tree
  check [project-root]      Audit env config and plugin configs for issues

Options:
  --version, -v              Print build identity (bundle path, mtime, sha256)
  --help, -h                 Show this help

Agents (setup): claude code, opencode, codex, geminicli, cursor, trae, omp, pi, all`;

function printVersion(): void {
  // Derive build identity from the bundle file itself — no version constant
  // to maintain. The SHA-256 prefix uniquely identifies the build (like a
  // git short hash); the mtime tells when it was built. Together they let
  // a user verify "am I running the build I expect?" without git access.
  const bundlePath = fileURLToPath(import.meta.url);
  const stat = statSync(bundlePath);
  const content = readFileSync(bundlePath);
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 12);
  console.log(`aet-design-env`);
  console.log(`  bundle: ${bundlePath}`);
  console.log(`  built : ${stat.mtime.toISOString()}`);
  console.log(`  sha   : ${hash}`);
}

export function run(): void {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const rest = argv.slice(1);

  switch (cmd) {
    case 'setup': return runSetup(rest);
    case 'context': return runContext(rest);
    case 'template': return runTemplate(rest);
    case 'checklist': return runChecklist(rest);
    case 'library': return runLibrary(rest);
    case 'check': return runCheck(rest);
    case '--version':
    case '-v':
      printVersion();
      return;
    case '--help':
    case '-h':
    case undefined:
      console.log(USAGE);
      return;
    default:
      console.error(`Unknown command: ${cmd}`);
      console.error(USAGE);
      process.exit(1);
  }
}

run();
