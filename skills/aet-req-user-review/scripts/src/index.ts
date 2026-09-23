/**
 * interactive-revision — single-entry CLI.
 *
 * Usage:
 *   node revision.mjs prepare   --source <file> [--source <file2> ...] [--max-size <bytes>] [--ttl <hours>]
 *   node revision.mjs finalize  --source <file> [--source <file2> ...]
 *
 * Output: JSON on stdout. Exit codes:
 *   0 — handled outcomes (including lock contention),
 *   1 — environment failure (Node < 20 — see the gate below),
 *   2 — usage errors (missing/unknown command, missing --source, bad flags).
 */

import { prepare, setPrepareOptions } from './prepare';
import { finalize } from './finalize';

/**
 * Hard runtime gate: the pipeline (and SKILL.md policy) requires Node >= 20.
 * An older Node may parse this bundle but must never proceed — there is no
 * fallback mechanism, so report clearly and halt before any operation.
 */
const NODE_MAJOR = Number.parseInt(process.versions.node, 10);
if (Number.isNaN(NODE_MAJOR) || NODE_MAJOR < 20) {
  console.error(
    `interactive-revision requires Node.js >= 20 (current: ${process.versions.node}). ` +
      'The scripts have no fallback mechanism — halting.',
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const [command, ...rest] = argv;

  if (!command) {
    console.error(usage());
    process.exit(2);
  }

  const args = parseArgs(rest);
  const sourcesRaw = args.source ?? [];
  const sources: string[] = Array.isArray(sourcesRaw) ? sourcesRaw : [sourcesRaw];

  if (sources.length === 0) {
    console.error(usage());
    console.error('Missing required argument: --source <sourcePath> (specify at least one)');
    process.exit(2);
  }

  if (command === 'prepare') {
    const maxSizeRaw = asString(args['max-size']);
    const ttlRaw = asString(args.ttl);
    const maxSize = maxSizeRaw !== undefined ? parsePositiveInt(maxSizeRaw) : undefined;
    const ttl = ttlRaw !== undefined ? parsePositiveInt(ttlRaw) : undefined;
    if (maxSize !== undefined && Number.isNaN(maxSize)) {
      console.error('Invalid --max-size (expected a positive integer)');
      process.exit(2);
    }
    if (ttl !== undefined && Number.isNaN(ttl)) {
      console.error('Invalid --ttl (expected a positive integer)');
      process.exit(2);
    }
    setPrepareOptions({ maxSize, ttl });
    const result = await prepare(sources);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'finalize') {
    const result = await finalize(sources);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.error(usage());
  console.error(`Unknown command: ${command}`);
  process.exit(2);
}

function usage(): string {
  return [
    'Usage: node revision.mjs <prepare|finalize> --source <path> [--source <path2> ...]',
    '',
    '  prepare   --source <path> [--source <path> ...] [--max-size <bytes>] [--ttl <hours>]',
    '  finalize  --source <path> [--source <path> ...]',
  ].join('\n');
}

type ParsedArgs = Record<string, string[] | string | undefined>;

function asString(v: string[] | string | undefined): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    if (!raw.startsWith('--')) continue;
    let key = raw.slice(2);
    let value: string | undefined;
    const eq = raw.indexOf('=');
    if (eq !== -1) {
      key = raw.slice(2, eq);
      value = raw.slice(eq + 1);
    } else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) {
      value = argv[i + 1];
      i++;
    }
    if (key === 'source') {
      if (value && value.length > 0) {
        const list = (out.source as string[] | undefined) ?? [];
        list.push(value);
        out.source = list;
      }
    } else {
      out[key] = value ?? '';
    }
  }
  return out;
}

function parsePositiveInt(s: string): number {
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : Number.NaN;
}

await main();