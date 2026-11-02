/**
 * @file src/plugins/opencode/hooks/config.ts
 *
 * V2 `config` registration — makes the OpenCode plugin package
 * SELF-CONTAINING: it registers the bundled `skills/` and `commands/`
 * directories with OpenCode at load time, so the plugin is fully
 * functional from a single install point (`plugins` array in
 * opencode.json, or a copy under `~/.config/opencode/plugin/`) with NO
 * manual symlinks and NO hardcoded machine paths.
 *
 * Path resolution is RELATIVE to this file's runtime location
 * (`import.meta.url` → the bundled `dist/plugins/opencode/bin/aet_handler.js`),
 * so `../skills` / `../commands` resolve to the sibling dirs inside the
 * package wherever it happens to be installed. Mirrors the Superpowers
 * plugin's registration pattern.
 *
 * Two V2 registrations (per D-007 — no mutable `config` object; each
 * domain has its own `transform(editor => { editor.add(...); return editor; })`):
 *   1. `ctx.skill.transform` — for each `skills/<id>/SKILL.md`, call
 *      `editor.add({ id, name, description?, path, content })`.
 *      Skill.Info has NO `paths` field (D-007) — each skill is added
 *      individually with its absolute path + content.
 *   2. `ctx.command.transform` — for each `commands/<name>.md`, call
 *      `editor.add({ name, description?, execute })`. CommandDefinition
 *      has NO `template`/`agent`/`model` (D-007) — template rendering
 *      happens inside `execute`, which sends the rendered text via
 *      `ctx.session.prompt({ sessionID, text })`.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PluginContext } from '../types.js';
import { decodePromptText } from '../prompt_text.js';

/** Shape of a parsed command markdown (frontmatter description + body). */
export interface ParsedCommand {
  description?: string;
  body: string;
}

/** Shape of a parsed skill markdown (frontmatter name + description + body). */
export interface ParsedSkill {
  id: string;
  name: string;
  description?: string;
  content: string;
}

/**
 * Parse a markdown command file into a `{ description, body }` pair.
 * Frontmatter `description` (if any) + body as the template.
 *
 * Tolerates both LF (`\n`) and CRLF (`\r\n`) line endings — Windows editors
 * often save `.md` files as CRLF, and the original LF-only regex would fail
 * to match the frontmatter fence and return the raw text (including the
 * `---` delimiters) as the body, corrupting the rendered command template.
 * Exported for direct unit testing.
 */
export function parseMarkdownCommand(raw: string): ParsedCommand {
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
 * Collect all `*.md` files under `commandsDir` into parsed command entries,
 * keyed by filename without the extension. Best-effort — a missing or
 * unreadable file is skipped, never throws. Exported for direct unit testing.
 */
export function collectCommandEntries(commandsDir: string): Record<string, ParsedCommand> {
  const entries: Record<string, ParsedCommand> = {};
  try {
    for (const file of readdirSync(commandsDir)) {
      if (!file.endsWith('.md')) continue;
      const raw = readFileSync(join(commandsDir, file), 'utf8');
      entries[file.slice(0, -3)] = parseMarkdownCommand(raw);
    }
  } catch {
    // Commands dir absent/unreadable — skills still register; never fail the hook.
  }
  return entries;
}

/**
 * Parse a SKILL.md frontmatter into `{ id, name, description?, content }`.
 * Frontmatter `name` is required (skill display name); `description` is
 * optional (skill trigger description). `content` is the full SKILL.md body
 * (after frontmatter). The `id` is the directory name (AET convention:
 * skill id = directory basename).
 *
 * Tolerates LF + CRLF. Exported for direct unit testing.
 */
export function parseSkillMd(dirName: string, raw: string): ParsedSkill {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  const content = m ? m[2].trim() : raw.trim();
  let name: string | undefined;
  let description: string | undefined;
  if (m) {
    for (const line of m[1].split(/\r?\n/)) {
      const colonIdx = line.indexOf(':');
      if (colonIdx <= 0) continue;
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key === 'name') name = val;
      else if (key === 'description') description = val;
    }
  }
  return { id: dirName, name: name ?? dirName, description, content };
}

/**
 * Collect all skill directories under `skillsDir` into parsed skill entries,
 * keyed by directory name. Each skill is a directory containing a SKILL.md.
 * Best-effort — missing/unreadable entries are skipped, never throws.
 * Exported for direct unit testing.
 */
export function collectSkillEntries(skillsDir: string): Record<string, ParsedSkill> {
  const entries: Record<string, ParsedSkill> = {};
  try {
    for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillMdPath = join(skillsDir, entry.name, 'SKILL.md');
      let raw: string;
      try {
        raw = readFileSync(skillMdPath, 'utf8');
      } catch {
        continue; // skill without SKILL.md — skip
      }
      entries[entry.name] = parseSkillMd(entry.name, raw);
    }
  } catch {
    // Skills dir absent/unreadable — commands still register; never fail.
  }
  return entries;
}

/**
 * V2 config registration. Calls `ctx.skill.transform` (one `editor.add`
 * per bundled SKILL.md) and `ctx.command.transform` (one `editor.add` per
 * bundled command, with an `execute` that renders the template body and
 * sends it via `ctx.session.prompt`).
 *
 * `pluginDir` defaults to the bundled file's directory; injectable for tests
 * (pass a temp dir containing `bin/` + `skills/` + `commands/`). Returns
 * `Promise<void>` — V2 setup registers imperatively (no hooks-object return).
 */
export async function registerConfigHook(
  ctx: PluginContext,
  opts: { pluginDir?: string } = {},
): Promise<void> {
  const pluginDir = opts.pluginDir ?? dirname(fileURLToPath(import.meta.url));
  const skillsDir = join(pluginDir, '..', 'skills');
  const commandsDir = join(pluginDir, '..', 'commands');

  // 1. Skills — V2 ctx.skill.transform; each skill added individually (D-007).
  await ctx.skill.transform((editor) => {
    for (const skill of Object.values(collectSkillEntries(skillsDir))) {
      // Skill.Info.path is branded AbsolutePath; cast at type level only.
      const absPath = join(skillsDir, skill.id);
      // Ensure absPath exists (best-effort — skip missing skill dirs).
      try {
        if (!statSync(absPath).isDirectory()) continue;
      } catch {
        continue;
      }
      editor.add({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        path: absPath,
        content: skill.content,
      } as never);
    }
    return editor;
  });

  // 2. Commands — V2 ctx.command.transform; each command's `execute`
  //    renders the template body and sends it via ctx.session.prompt.
  //    CommandDefinition has NO template/agent/model (D-007) — the execute
  //    closure IS the rendering. The body is sent verbatim (build-time
  //    __AET_PLUGIN_VERSION__ substitution is baked by copyCommandsWithVersion).
  await ctx.command.transform((editor) => {
    for (const [name, cmd] of Object.entries(collectCommandEntries(commandsDir))) {
      editor.add({
        name,
        description: cmd.description,
        execute: async (invocation) => {
          // invocation.prompt.text carries the user's trailing args after the
          // slash command (e.g. `/design 做一个登录功能` → text = "做一个登录功能").
          // For commands with no $ARGUMENTS placeholder in the body (like
          // init.md), the args are simply not substituted — the body is sent
          // as-is, and the command's instructions direct the agent.
          const userArgs = decodePromptText(invocation?.prompt?.text).text;
          const rendered = renderTemplate(cmd.body, userArgs);
          await ctx.session.prompt({
            sessionID: invocation.sessionID,
            text: rendered,
          });
        },
      });
    }
    return editor;
  });
}

/**
 * Render a command template body. Replaces `$ARGUMENTS` (and the legacy
 * `__AET_PLUGIN_VERSION__` placeholder — already baked at build time, but
 * kept for safety) with the user's arguments. If the body has no
 * placeholder, the args are appended as a trailing section so the agent
 * sees them.
 */
function renderTemplate(body: string, args: string): string {
  if (body.includes('$ARGUMENTS')) {
    return body.replace(/\$ARGUMENTS/g, args);
  }
  // No placeholder — if the user supplied args, append them so the agent
  // can pick them up. Otherwise return the body verbatim.
  if (args.trim()) {
    return `${body}\n\n---\nUser arguments:\n${args}`;
  }
  return body;
}
