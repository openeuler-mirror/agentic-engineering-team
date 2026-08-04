import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateAll } from './generator.js';
import { DEFAULT_AGENTS } from './default_agents.js';
import type { AgentsConfig } from './agents_config.js';
import type { WorkflowConfig } from '../../../core/workflow_registry.js';

const config: WorkflowConfig = {
  version: '1.0',
  hooks: {},
  workflows: {
    'aet-design': {
      name: 'Aet-Design',
      description: '设计工作流',
      stages: [{ id: 'requirements_analysis', name: '需求分析', description: 'd' }],
    },
  },
  commands: {
    'aet-doc': { name: 'aet-doc', description: '生成文档' },
  },
};

const agents: AgentsConfig = { agents: { 'claude-code': DEFAULT_AGENTS.agents['claude-code'] } };

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'aet-gen-'));
}

describe('generateAll', () => {
  it('writes workflow + command files for the CC adapter', async () => {
    const root = tmp();
    const res = await generateAll(agents, config, root, join(root, 'no-global'));
    const r = res.results[0];
    expect(r.agent).toBe('claude-code');
    expect(r.generated).toEqual(expect.arrayContaining(['aet-design', 'aet-doc']));

    const wfFile = join(root, '.claude', 'commands', 'aet', 'aet-design.md');
    const cmdFile = join(root, '.claude', 'commands', 'aet', 'aet-doc.md');
    expect(existsSync(wfFile)).toBe(true);
    expect(existsSync(cmdFile)).toBe(true);

    const wf = readFileSync(wfFile, 'utf8');
    expect(wf).toContain('description: 设计工作流');
    expect(wf).toContain('1. 需求分析'); // steps list rendered
    expect(wf).toContain('/aet-design $ARGUMENTS'); // slash trigger

    const cmd = readFileSync(cmdFile, 'utf8');
    expect(cmd).toContain('description: 生成文档');
  });

  it('prunes stale aet-* files no longer in config', async () => {
    const root = tmp();
    const staleDir = join(root, '.claude', 'commands', 'aet');
    mkdirSync(staleDir, { recursive: true });
    writeFileSync(join(staleDir, 'aet-gone.md'), 'stale', 'utf8');
    writeFileSync(join(staleDir, 'keepme.txt'), 'not aet', 'utf8'); // untouched (no aet- prefix)

    const res = await generateAll(agents, config, root, join(root, 'no-global'));
    const r = res.results[0];
    expect(r.removed).toContain('aet-gone');
    expect(existsSync(join(staleDir, 'aet-gone.md'))).toBe(false);
    // Non-aet files survive the prune.
    expect(existsSync(join(staleDir, 'keepme.txt'))).toBe(true);
  });

  it('honors an agentFilter', async () => {
    const root = tmp();
    const both: AgentsConfig = { agents: { ...DEFAULT_AGENTS.agents } };
    const res = await generateAll(both, config, root, join(root, 'no-global'), 'opencode');
    expect(res.results.map((r) => r.agent)).toEqual(['opencode']);
    expect(existsSync(join(root, '.opencode', 'commands', 'aet-design.md'))).toBe(true);
  });

  it('skips commands for agents without a command template', async () => {
    const root = tmp();
    const noCmd = {
      agents: {
        bare: {
          label: 'bare',
          destDir: '.bare',
          format: 'markdown-flat' as const,
          filename: '{{id}}.md',
          frontmatter: {},
          body: '{{workflow.description}}',
          // no commandBody
        },
      },
    };
    const res = await generateAll(noCmd, config, root, join(root, 'no-global'));
    const r = res.results[0];
    expect(r.generated).toEqual(['aet-design']);
    expect(r.skipped).toEqual(['aet-doc']);
  });

  it('resolves a ~-prefixed destDir against the global root', async () => {
    const root = tmp();
    const globalRoot = tmp();
    const homeAgent = {
      agents: {
        home: {
          label: 'home',
          destDir: '~/aet-commands',
          format: 'markdown-flat' as const,
          filename: '{{id}}.md',
          frontmatter: {},
          body: 'x',
        },
      },
    };
    await generateAll(homeAgent, config, root, globalRoot);
    expect(existsSync(join(globalRoot, 'aet-commands', 'aet-design.md'))).toBe(true);
  });
});