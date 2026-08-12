import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getAgentEntry, loadAgentsConfig } from './agents_config.js';
import { DEFAULT_AGENTS } from './default_agents.js';

function tmpRoot(): string {
  return mkdtempSync(join(tmpdir(), 'aet-agents-'));
}

function writeAgents(root: string, partial: unknown): void {
  const dir = join(root, '.aet', 'config');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'agents.json'), JSON.stringify(partial, null, 2), 'utf8');
}

describe('loadAgentsConfig', () => {
  it('returns the built-in defaults when no config files exist', () => {
    const root = tmpRoot();
    const cfg = loadAgentsConfig(root, join(root, 'no-global'));
    expect(Object.keys(cfg.agents).sort()).toEqual(['claude-code', 'codeagent3', 'codex', 'omp', 'opencode']);
  });

  it('global config overrides a built-in agent per-id', () => {
    const root = tmpRoot();
    const globalRoot = tmpRoot();
    writeAgents(globalRoot, {
      agents: {
        'claude-code': { label: 'My CC', destDir: '~/custom', format: 'markdown-flat', filename: 'x.md', frontmatter: {}, body: 'b' },
      },
    });
    const cfg = loadAgentsConfig(root, globalRoot);
    expect(cfg.agents['claude-code'].label).toBe('My CC');
    expect(cfg.agents['claude-code'].destDir).toBe('~/custom');
  });

  it('project config overrides global', () => {
    const root = tmpRoot();
    const globalRoot = tmpRoot();
    writeAgents(globalRoot, {
      agents: { opencode: { label: 'global', destDir: 'g', format: 'markdown-skill', filename: 'f', frontmatter: {}, body: 'b' } },
    });
    writeAgents(root, {
      agents: { opencode: { label: 'project', destDir: 'p', format: 'markdown-skill', filename: 'f', frontmatter: {}, body: 'b' } },
    });
    expect(loadAgentsConfig(root, globalRoot).agents.opencode.label).toBe('project');
  });

  it('adds new agent ids from config', () => {
    const root = tmpRoot();
    writeAgents(root, {
      agents: { cursor: { label: 'Cursor', destDir: '.cursor', format: 'markdown-flat', filename: 'f', frontmatter: {}, body: 'b' } },
    });
    const cfg = loadAgentsConfig(root, join(root, 'no'));
    expect(cfg.agents.cursor.label).toBe('Cursor');
    expect(cfg.agents['claude-code']).toBeDefined(); // built-ins still present
  });

  it('does not mutate the exported DEFAULT_AGENTS across calls', () => {
    const root = tmpRoot();
    const globalRoot = tmpRoot();
    writeAgents(globalRoot, {
      agents: { 'claude-code': { label: 'overridden', destDir: 'x', format: 'markdown-flat', filename: 'f', frontmatter: {}, body: 'b' } },
    });
    loadAgentsConfig(root, globalRoot);
    // The exported constant is untouched by loadAgentsConfig's internal merge.
    expect(DEFAULT_AGENTS.agents['claude-code'].label).toBe('Claude Code');
  });
});

describe('getAgentEntry', () => {
  it('resolves an agent id case-insensitively', () => {
    const root = tmpRoot();
    const cfg = loadAgentsConfig(root, join(root, 'no'));
    expect(getAgentEntry(cfg, 'CLAUDE-CODE')?.label).toBe('Claude Code');
    expect(getAgentEntry(cfg, 'opencode')?.label).toBe('OpenCode');
  });

  it('returns null for an unknown agent', () => {
    const root = tmpRoot();
    const cfg = loadAgentsConfig(root, join(root, 'no'));
    expect(getAgentEntry(cfg, 'bogus')).toBeNull();
  });
});