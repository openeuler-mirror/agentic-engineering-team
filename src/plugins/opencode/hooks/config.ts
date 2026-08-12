/**
 * @file src/plugins/opencode/hooks/config.ts
 *
 * `config` hook — makes the OpenCode plugin package SELF-CONTAINING: it
 * registers the bundled `skills/` and `commands/` directories with OpenCode
 * at load time, so the plugin is fully functional from a single install
 * point (`plugin` array in opencode.json, or a copy under
 * `~/.config/opencode/plugin/`) with NO manual symlinks and NO hardcoded
 * machine paths.
 *
 * Path resolution is RELATIVE to this file's runtime location
 * (`import.meta.url` → the bundled `dist/plugins/opencode/bin/aet_handler.js`),
 * so `../skills` / `../commands` resolve to the sibling dirs inside the
 * package wherever it happens to be installed. Mirrors the Superpowers
 * plugin's `config`-hook pattern (superpowers/.opencode/plugins/superpowers.js).
 *
 * Two registrations, per OpenCode's config shape:
 *   1. `config.skills.paths` — OpenCode's Skills service iterates these and
 *      globs each path for SKILL.md files. Must be an ABSOLUTE filesystem
 *      path (the service skips non-absolute entries), hence `fileURLToPath`.
 *      `skills` is a runtime-supported extension NOT present in the SDK
 *      Config type — the `// @ts-expect-error`-guarded cast is the same
 *      approach superpowers uses.
 *   2. `config.command[name]` — OpenCode's Commands service merges these with
 *      file-based commands. Each shipped `commands/*.md` becomes one template
 *      command (frontmatter `description` + body `template`).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PluginContext } from '../types.js';

/** Shape of a `config.command` entry in OpenCode's config. */
export interface CommandConfig {
  template: string;
  description?: string;
  agent?: string;
  model?: string;
  subtask?: boolean;
  [key: string]: unknown;
}

/** The subset of OpenCode's Config object the plugin mutates. */
interface ConfigLike {
  skills?: { paths?: string[]; urls?: string[] };
  command?: Record<string, CommandConfig>;
  [key: string]: unknown;
}

/**
 * Parse a markdown command file into a `config.command` entry.
 * Frontmatter `description` (if any) + body as the `template`.
 *
 * Tolerates both LF (`\n`) and CRLF (`\r\n`) line endings — Windows editors
 * often save `.md` files as CRLF, and the original LF-only regex would fail
 * to match the frontmatter fence and return the raw text (including the
 * `---` delimiters) as the body, corrupting the rendered command template.
 * Exported for direct unit testing.
 */
export function parseMarkdownCommand(raw: string): { description?: string; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return { body: raw.trim() };

  let description: string | undefined;
  // Split on \r?\n so a CRLF frontmatter yields clean `key: value` lines
  // without a trailing \r (which would break the `description` key match).
  for (const line of m[1].split(/\r?\n/)) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0 && line.slice(0, colonIdx).trim() === 'description') {
      description = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
      break;
    }
  }
  return { description, body: m[2].trim() };
}

/**
 * Collect all `*.md` files under `commandsDir` into a `config.command` map,
 * keyed by filename without the extension. Best-effort — a missing or
 * unreadable file is skipped, never throws. Exported for direct unit testing.
 */
export function collectCommandEntries(commandsDir: string): Record<string, CommandConfig> {
  const entries: Record<string, CommandConfig> = {};
  try {
    for (const file of readdirSync(commandsDir)) {
      if (!file.endsWith('.md')) continue;
      const raw = readFileSync(join(commandsDir, file), 'utf8');
      const { description, body } = parseMarkdownCommand(raw);
      entries[file.slice(0, -3)] = { description, template: body };
    }
  } catch {
    // Commands dir absent/unreadable — skills still register; never fail the hook.
  }
  return entries;
}

/**
 * Build the `config` hook handler.
 *
 * `pluginDir` defaults to the bundled file's directory; injectable for tests
 * (pass a temp dir containing `bin/` + `skills/` + `commands/`). Returns the
 * handler so the plugin entry can return its hooks object (the OpenCode
 * Plugin API contract — the plugin RETURNS { config, ... } rather than
 * mutating the context).
 */
export function registerConfigHook(
  ctx: PluginContext,
  opts: { pluginDir?: string } = {},
): (rawConfig: unknown) => Promise<void> {
  const pluginDir = opts.pluginDir ?? dirname(fileURLToPath(import.meta.url));
  const skillsDir = join(pluginDir, '..', 'skills');
  const commandsDir = join(pluginDir, '..', 'commands');

  return async (rawConfig: unknown): Promise<void> => {
    const config = rawConfig as ConfigLike;

    // 1. Skills — absolute path required by OpenCode's Skills service. OpenCode
    //    does not type `skills` in its Config type, but it is runtime-supported
    //    (the same extension superpowers relies on).
    const skills = (config.skills ??= {});
    const skillsPaths = (skills.paths ??= []);
    if (!skillsPaths.includes(skillsDir)) skillsPaths.push(skillsDir);

    // 2. Commands — merge shipped markdown commands into config.command.
    config.command = config.command ?? {};
    for (const [name, cmd] of Object.entries(collectCommandEntries(commandsDir))) {
      config.command[name] = cmd;
    }

    // No host call needed — mutation of the live merged config is the contract.
  };
}
