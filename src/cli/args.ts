/**
 * @file src/cli/args.ts
 *
 * Layer 3 — CLI argument parsing.
 *
 * Tiny hand-rolled parser — no external deps. Handles:
 *   - long flags: `--name`, `--name value`, `--name=value`
 *   - short flags: `-n`, `-n value`, `-n=value`  (kept for future use)
 *   - positional args: bare strings appear in `positionals[]`
 *   - `--` separator: everything after is positional (verbatim)
 *
 * Mirrors the spec in 新方案.md §2.1: the CLI is agent-agnostic — it
 * accepts no `--agent` flag. The command shape is
 * `aet <resource> <action> [flags]` (e.g.
 * `aet workflow init --name feature --context "..."`).
 */

import type { OutputMode } from '../definitions/events.js';

export interface ParsedArgs {
  /** Bare positional strings, in order. */
  positionals: string[];
  /** Map of flag name (without `--`) to its value (`true` for valueless flags). */
  flags: Record<string, string | true>;
  /** Anything after `--`, as a single joined string. */
  raw?: string;
}

/**
 * Parse `process.argv` (or any string array) into a ParsedArgs object.
 *
 * The first 2 elements of `process.argv` (node binary + script path) are
 * stripped automatically — callers can pass `process.argv.slice(2)` to
 * ignore this convenience.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | true> = {};
  let raw: string | undefined;

  // Parse one flag token (`--name`, `--name=value`, `--name value`, or the
  // short forms). Returns the next loop index (consumes a following value
  // arg when present).
  const parseFlag = (arg: string, i: number, prefixLen: number): number => {
    const eq = arg.indexOf('=');
    if (eq >= 0) {
      flags[arg.slice(prefixLen, eq)] = arg.slice(eq + 1);
      return i;
    }
    const name = arg.slice(prefixLen);
    // Peek ahead: next arg is the value if it's not a flag and not `--`.
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('-') && next !== '--') {
      flags[name] = next;
      return i + 1;
    }
    flags[name] = true;
    return i;
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    // `--` separator: everything after becomes positional, verbatim.
    if (arg === '--') {
      raw = argv.slice(i + 1).join(' ');
      break;
    }

    // Long flag: --name, --name=value, --name value
    if (arg.startsWith('--')) {
      i = parseFlag(arg, i, 2);
    } else if (arg.startsWith('-') && arg.length > 1) {
      // Short flag: -n, -n=value, -n value
      i = parseFlag(arg, i, 1);
    } else {
      // Bare positional.
      positionals.push(arg);
    }

    i += 1;
  }

  const result: ParsedArgs = { positionals, flags };
  if (raw !== undefined) result.raw = raw;
  return result;
}

/**
 * Convenience: fetch a flag's value or throw a UsageError if missing.
 * Boolean flags (set without a value) are treated as missing.
 */
export function requireFlag(parsed: ParsedArgs, name: string, label: string): string {
  const v = parsed.flags[name];
  if (v === undefined || v === true) {
    const err = new UsageError(`Missing required flag --${name} (${label}).`);
    throw err;
  }
  return v;
}

/**
 * Convenience: fetch an optional flag's value, returning `undefined` if not set.
 */
export function optionalFlag(parsed: ParsedArgs, name: string): string | undefined {
  const v = parsed.flags[name];
  if (v === true) return undefined;
  return v;
}

/**
 * Resolve the `--output` flag, defaulting to `'prompt'` and validating the
 * value. Throws a `UsageError` for an unrecognized value so a caller's
 * existing try/catch → `cliError` path handles it like any usage error.
 */
export function requireOutputMode(parsed: ParsedArgs): OutputMode {
  const out = optionalFlag(parsed, 'output');
  if (out !== undefined && out !== 'json' && out !== 'prompt') {
    throw new UsageError(`Invalid --output value "${out}"; expected "json" or "prompt".`);
  }
  return out === 'json' ? 'json' : 'prompt';
}

/** Error thrown by `requireFlag`. Subclass of Error for easy `instanceof`. */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}
