import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  collectCommandEntries,
  parseMarkdownCommand,
  registerConfigHook,
} from './config.js';
import type { PluginContext } from '../types.js';

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'aet-config-'));
  // Mirror the package layout: pluginDir is the `bin/` dir; `skills/` and
  // `commands/` are its siblings (resolved as bin/../skills, bin/../commands).
  mkdirSync(join(dir, 'bin'));
  mkdirSync(join(dir, 'commands'));
  writeFileSync(
    join(dir, 'commands', 'init.md'),
    [
      '---',
      'description: Reload AET skills',
      '---',
      'Tell the user to reload AET skills.',
    ].join('\n'),
  );
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function getHook(): (rawConfig: unknown) => Promise<void> {
  return registerConfigHook({} as PluginContext, { pluginDir: join(dir, 'bin') });
}

describe('parseMarkdownCommand', () => {
  it('extracts description + body from frontmatter', () => {
    const { description, body } = parseMarkdownCommand(
      '---\ndescription: "Do a thing"\n---\nDo the thing now.',
    );
    expect(description).toBe('Do a thing');
    expect(body).toBe('Do the thing now.');
  });

  it('returns the full body when there is no frontmatter', () => {
    const { description, body } = parseMarkdownCommand('just a body');
    expect(description).toBeUndefined();
    expect(body).toBe('just a body');
  });

  it('parses frontmatter correctly under CRLF line endings (Windows)', () => {
    // Windows editors often save .md as CRLF; the LF-only regex used to miss
    // the fence and return the raw text (including the --- delimiters) as the
    // body, corrupting the rendered command template.
    const { description, body } = parseMarkdownCommand(
      '---\r\ndescription: "Do a thing"\r\n---\r\nDo the thing now.',
    );
    expect(description).toBe('Do a thing');
    expect(body).toBe('Do the thing now.');
  });
});

describe('collectCommandEntries', () => {
  it('maps each .md file to a config.command entry keyed by basename', () => {
    const entries = collectCommandEntries(join(dir, 'commands'));
    expect(entries.init).toEqual({
      description: 'Reload AET skills',
      template: 'Tell the user to reload AET skills.',
    });
  });

  it('returns {} for a missing dir without throwing', () => {
    expect(collectCommandEntries(join(dir, 'nope'))).toEqual({});
  });
});

describe('config hook', () => {
  it('registers the absolute skills path and the command entry', () => {
    const config = { skills: {}, command: {} } as unknown as { skills: { paths?: string[] }; [k: string]: unknown };
    getHook()(config);
    const skills = config as unknown as { skills: { paths: string[] }; command: Record<string, unknown> };
    expect(skills.skills.paths).toContain(join(dir, 'skills'));
    expect(skills.command.init).toBeDefined();
  });

  it('is idempotent — does not double-add the skills path', () => {
    const config = { skills: { paths: [] }, command: {} } as unknown as Record<string, unknown>;
    const hook = getHook();
    hook(config);
    hook(config);
    const paths = (config as unknown as { skills: { paths: string[] } }).skills.paths;
    expect(paths.filter((p) => p === join(dir, 'skills'))).toHaveLength(1);
  });
});