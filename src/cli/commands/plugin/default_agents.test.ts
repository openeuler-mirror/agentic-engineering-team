import { describe, expect, it } from 'vitest';
import { DEFAULT_AGENTS } from './default_agents.js';

describe('DEFAULT_AGENTS', () => {
  it('ships claude-code / opencode / omp / codeagent3 / codex', () => {
    expect(Object.keys(DEFAULT_AGENTS.agents).sort()).toEqual(['claude-code', 'codeagent3', 'codex', 'omp', 'opencode']);
  });

  it('CC adapter: hasPlugin true, markdown-flat, .claude destDir', () => {
    const cc = DEFAULT_AGENTS.agents['claude-code'];
    expect(cc.hasPlugin).toBe(true);
    expect(cc.format).toBe('markdown-flat');
    expect(cc.destDir).toBe('.claude/commands/aet');
    expect(cc.filename).toBe('{{id}}.md');
  });

  it('codeagent3 mirrors CC but writes to .cac', () => {
    const c3 = DEFAULT_AGENTS.agents.codeagent3;
    expect(c3.format).toBe('markdown-flat');
    expect(c3.hasPlugin).toBe(true);
    expect(c3.destDir).toBe('.cac/commands/aet');
  });

  it('opencode adapter: plugin-driven commands, markdown-flat, .opencode/commands destDir', () => {
    const oc = DEFAULT_AGENTS.agents.opencode;
    expect(oc.hasPlugin).toBe(true);
    expect(oc.format).toBe('markdown-flat');
    expect(oc.destDir).toBe('.opencode/commands');
    expect(oc.filename).toBe('{{id}}.md');
  });

  it('omp adapter: markdown-flat, .omp/commands destDir, hasPlugin false (init via command body)', () => {
    const omp = DEFAULT_AGENTS.agents.omp;
    expect(omp.hasPlugin).toBe(false);
    expect(omp.format).toBe('markdown-flat');
    expect(omp.destDir).toBe('.omp/commands');
    expect(omp.filename).toBe('{{id}}.md');
  });

  it('codex adapter: skills-based (spec-kit layout), no plugin, .agents destDir', () => {
    const cx = DEFAULT_AGENTS.agents.codex;
    expect(cx.hasPlugin).toBe(false);
    expect(cx.format).toBe('markdown-skill');
    expect(cx.destDir).toBe('.agents/skills');
    expect(cx.filename).toBe('{{id}}/SKILL.md');
  });

  it('every agent carries frontmatter + body templates', () => {
    for (const agent of Object.values(DEFAULT_AGENTS.agents)) {
      expect(agent.frontmatter).toBeDefined();
      expect(agent.body).toBeDefined();
      expect(agent.commandFrontmatter).toBeDefined();
      expect(agent.commandBody).toBeDefined();
    }
  });
});