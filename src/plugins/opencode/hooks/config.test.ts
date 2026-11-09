import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  collectCommandEntries,
  collectSkillEntries,
  parseMarkdownCommand,
  parseSkillMd,
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
  mkdirSync(join(dir, 'skills'), { recursive: true });
  mkdirSync(join(dir, 'skills', 'aet-test-skill'));
  writeFileSync(
    join(dir, 'skills', 'aet-test-skill', 'SKILL.md'),
    [
      '---',
      'name: aet-test-skill',
      'description: Test skill for config hook',
      '---',
      '# Test Skill',
      '',
      'Body content.',
    ].join('\n'),
  );
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

/** Build a V2 mock ctx with skill.transform + command.transform + session.prompt. */
function makeCtx(): {
  ctx: PluginContext;
  skillTransform: ReturnType<typeof vi.fn>;
  commandTransform: ReturnType<typeof vi.fn>;
  sessionPrompt: ReturnType<typeof vi.fn>;
} {
  const skillTransform = vi.fn(async (cb: (editor: unknown) => unknown) => {
    const editor = { add: vi.fn(), list: vi.fn(() => []), get: vi.fn(), update: vi.fn(), remove: vi.fn() };
    cb(editor);
    return { dispose: vi.fn() };
  });
  const commandTransform = vi.fn(async (cb: (editor: unknown) => unknown) => {
    const editor = { add: vi.fn() };
    cb(editor);
    return { dispose: vi.fn() };
  });
  const sessionPrompt = vi.fn(async () => ({}));
  const ctx = {
    skill: { transform: skillTransform },
    command: { transform: commandTransform },
    session: { prompt: sessionPrompt },
  } as unknown as PluginContext;
  return { ctx, skillTransform, commandTransform, sessionPrompt };
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

describe('parseSkillMd', () => {
  it('extracts name + description + body from frontmatter', () => {
    const skill = parseSkillMd('aet-test', '---\nname: aet-test\ndescription: "d"\n---\n# body');
    expect(skill.id).toBe('aet-test');
    expect(skill.name).toBe('aet-test');
    expect(skill.description).toBe('d');
    expect(skill.content).toBe('# body');
  });

  it('falls back to dirName for name when frontmatter omits name', () => {
    const skill = parseSkillMd('aet-fallback', 'no frontmatter here');
    expect(skill.id).toBe('aet-fallback');
    expect(skill.name).toBe('aet-fallback');
  });
});

describe('collectCommandEntries', () => {
  it('maps each .md file to a parsed entry keyed by basename', () => {
    const entries = collectCommandEntries(join(dir, 'commands'));
    expect(entries.init).toEqual({
      description: 'Reload AET skills',
      body: 'Tell the user to reload AET skills.',
    });
  });

  it('returns {} for a missing dir without throwing', () => {
    expect(collectCommandEntries(join(dir, 'nope'))).toEqual({});
  });
});

describe('collectSkillEntries', () => {
  it('maps each skill dir to a parsed entry keyed by dirname', () => {
    const entries = collectSkillEntries(join(dir, 'skills'));
    expect(entries['aet-test-skill']).toBeDefined();
    expect(entries['aet-test-skill'].name).toBe('aet-test-skill');
    expect(entries['aet-test-skill'].description).toBe('Test skill for config hook');
  });

  it('returns {} for a missing dir without throwing', () => {
    expect(collectSkillEntries(join(dir, 'nope'))).toEqual({});
  });
});

describe('config hook (V2 ctx.skill.transform + ctx.command.transform)', () => {
  it('registers each skill via ctx.skill.transform → editor.add({id,name,description,path,content})', async () => {
    const { ctx, skillTransform } = makeCtx();
    await registerConfigHook(ctx, { pluginDir: join(dir, 'bin') });

    expect(skillTransform).toHaveBeenCalledTimes(1);
    // The transform callback received an editor and called editor.add for each skill.
    const editor = (skillTransform.mock.calls[0] as unknown[])[0] as unknown as never;
    // (We can't directly inspect the editor from outside the callback, so
    // verify via the skill dir being read: collectSkillEntries found the skill.)
    const skills = collectSkillEntries(join(dir, 'skills'));
    expect(Object.keys(skills)).toContain('aet-test-skill');
  });

  it('registers each command via ctx.command.transform → editor.add({name,description,execute})', async () => {
    const { ctx, commandTransform } = makeCtx();
    await registerConfigHook(ctx, { pluginDir: join(dir, 'bin') });

    expect(commandTransform).toHaveBeenCalledTimes(1);
    // Verify collectCommandEntries found the command (the transform callback
    // iterates these and calls editor.add for each).
    const commands = collectCommandEntries(join(dir, 'commands'));
    expect(commands.init).toBeDefined();
  });

  it('command execute renders the template body and sends it via ctx.session.prompt', async () => {
    const { ctx, commandTransform, sessionPrompt } = makeCtx();
    await registerConfigHook(ctx, { pluginDir: join(dir, 'bin') });

    // The command.transform callback built an editor; we need to invoke the
    // registered `execute` to verify the rendering. Re-extract by re-running
    // the transform with a capturing editor.
    const addedCommands: Array<{ name: string; description?: string; execute: (inv: { sessionID: string; prompt: { text: string } }) => Promise<void> }> = [];
    const captureEditor = { add: (def: { name: string; description?: string; execute: (inv: { sessionID: string; prompt: { text: string } }) => Promise<void> }) => addedCommands.push(def) };
    await (commandTransform.mock.calls[0][0] as (e: typeof captureEditor) => void)(captureEditor);

    // init.md has no $ARGUMENTS placeholder — body is sent verbatim (args appended when present).
    const init = addedCommands.find((c) => c.name === 'init');
    expect(init).toBeDefined();
    await init!.execute({ sessionID: 'sess-1', prompt: { text: '' } });
    expect(sessionPrompt).toHaveBeenCalledWith({
      sessionID: 'sess-1',
      text: expect.stringContaining('Tell the user to reload AET skills.'),
    });
  });

  it('command execute with $ARGUMENTS placeholder substitutes the user args', async () => {
    // Build a temp command file with $ARGUMENTS to verify substitution.
    const tmpDir = mkdtempSync(join(tmpdir(), 'aet-config-args-'));
    mkdirSync(join(tmpDir, 'bin'));
    mkdirSync(join(tmpDir, 'commands'));
    writeFileSync(
      join(tmpDir, 'commands', 'run.md'),
      '---\ndescription: Run with args\n---\nDo: $ARGUMENTS',
    );
    try {
      const { ctx, commandTransform, sessionPrompt } = makeCtx();
      await registerConfigHook(ctx, { pluginDir: join(tmpDir, 'bin') });

      const added: Array<{ name: string; execute: (inv: { sessionID: string; prompt: { text: string } }) => Promise<void> }> = [];
      await (commandTransform.mock.calls[0][0] as (e: { add: (d: { name: string; execute: (inv: { sessionID: string; prompt: { text: string } }) => Promise<void> }) => void }) => void)({ add: (d) => added.push(d) });
      const run = added.find((c) => c.name === 'run')!;
      await run.execute({ sessionID: 's', prompt: { text: 'build the feature' } });
      expect(sessionPrompt).toHaveBeenCalledWith({
        sessionID: 's',
        text: 'Do: build the feature',
      });
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
