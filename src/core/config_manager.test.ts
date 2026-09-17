import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigManager, BASELINE_CONFIG } from './config_manager.js';

function tmpRoot(): string {
  return mkdtempSync(join(tmpdir(), 'aet-cfg-'));
}

function writeConfig(root: string, partial: unknown): void {
  const dir = join(root, '.aet', 'config');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'workflow.json'), JSON.stringify(partial, null, 2), 'utf8');
}

describe('ConfigManager', () => {
  it('falls back to the built-in baseline when no configs exist', () => {
    const root = tmpRoot();
    const cm = new ConfigManager(root, join(root, '..', 'no-global'));
    const cfg = cm.getConfig();
    expect(Object.keys(cfg.workflows).sort()).toEqual(['bugfix', 'design', 'implement']);
    expect(cfg.hooks).toEqual({});
    expect(cfg.commands).toEqual({});
  });

  it('merges global config on top of baseline', () => {
    const root = tmpRoot();
    const globalRoot = tmpRoot();
    writeConfig(globalRoot, {
      workflows: {
        design: {
          name: 'design',
          description: 'global override description',
          stages: [{ id: 's1', description: 'global step' }],
        },
      },
    });
    const cm = new ConfigManager(root, globalRoot);
    const cfg = cm.getConfig();
    expect(cfg.workflows.design.description).toBe('global override description');
    // implement untouched by global
    expect(cfg.workflows.implement).toBeDefined();
  });

  it('project config overrides global config', () => {
    const root = tmpRoot();
    const globalRoot = tmpRoot();
    writeConfig(globalRoot, {
      workflows: {
        design: { name: 'design', description: 'from global', stages: [{ id: 's1', description: 'g' }] },
      },
    });
    writeConfig(root, {
      workflows: {
        design: { name: 'design', description: 'from project', stages: [{ id: 's1', description: 'p' }] },
      },
    });
    const cm = new ConfigManager(root, globalRoot);
    expect(cm.getConfig().workflows.design.description).toBe('from project');
  });

  it('merges hooks and commands entries', () => {
    const root = tmpRoot();
    writeConfig(root, {
      hooks: { confirm: { description: 'x', event: 'hook.prompt', payload: { text: 'ok?' } } },
      commands: { 'aet-doc': { name: 'aet-doc', description: 'doc' } },
    });
    const cm = new ConfigManager(root, join(root, 'no-global'));
    const cfg = cm.getConfig();
    expect(cfg.hooks.confirm.event).toBe('hook.prompt');
    expect(cfg.commands['aet-doc'].description).toBe('doc');
  });

  it('normalizes legacy `workflow` array to `stages`', () => {
    const root = tmpRoot();
    writeConfig(root, {
      workflows: {
        legacy: { name: 'legacy', description: 'd', workflow: [{ step_id: 'old-step', description: 'legacy step' }] },
      },
    });
    const cm = new ConfigManager(root, join(root, 'no-global'));
    const wf = cm.getConfig().workflows.legacy;
    expect(Array.isArray(wf.stages)).toBe(true);
    expect(wf.stages[0].id).toBe('old-step'); // step_id → id
  });

  it('normalizes a string argument-hint into a single-element array', () => {
    const root = tmpRoot();
    writeConfig(root, {
      workflows: {
        w: { name: 'w', description: 'd', 'argument-hint': 'issue-number', stages: [{ id: 's', description: 'd' }] },
      },
    });
    expect(new ConfigManager(root, join(root, 'no')).getConfig().workflows.w['argument-hint']).toEqual(['issue-number']);
  });

  it('collapses internal whitespace in argument-hint names and drops empties', () => {
    const root = tmpRoot();
    writeConfig(root, {
      workflows: {
        w: {
          name: 'w',
          description: 'd',
          'argument-hint': ['bad name', '', 'ok'],
          stages: [{ id: 's', description: 'd' }],
        },
      },
    });
    const wf = new ConfigManager(root, join(root, 'no')).getConfig().workflows.w;
    expect(wf['argument-hint']).toEqual(['bad_name', 'ok']);
  });

  it('keeps an empty argument-hint list as-is when no other normalization applies', () => {
    const root = tmpRoot();
    writeConfig(root, {
      workflows: {
        w: { name: 'w', description: 'd', 'argument-hint': [], stages: [{ id: 's', description: 'd' }] },
      },
    });
    const wf = new ConfigManager(root, join(root, 'no')).getConfig().workflows.w;
    // normalizeWorkflowDefinition returns the raw entry unchanged when
    // `stages` already exists and argHint normalizes to undefined — so the
    // empty array survives. Documented actual behavior.
    expect(wf['argument-hint']).toEqual([]);
  });

  it('reload() re-reads config from disk', () => {
    const root = tmpRoot();
    const cm = new ConfigManager(root, join(root, 'no-global'));
    expect(cm.getConfig().workflows.design).toBeDefined();
    writeConfig(root, {
      workflows: {
        brandNew: { name: 'brandNew', description: 'n', stages: [{ id: 's', description: 'd' }] },
      },
    });
    const reloaded = cm.reload();
    expect(reloaded.workflows.brandNew).toBeDefined();
  });
});

describe('BASELINE_CONFIG', () => {
  it('ships the three baseline workflows with ordered stages', () => {
    expect(BASELINE_CONFIG.workflows.design.stages.map((s) => s.id)).toEqual([
      'requirements_analysis',
      'requirements_design',
    ]);
    expect(BASELINE_CONFIG.workflows.implement.stages.map((s) => s.id)).toEqual([
      'development_plan',
      'implement',
      'verify',
    ]);
    expect(BASELINE_CONFIG.workflows.bugfix.stages.map((s) => s.id)).toEqual([
      'diagnose',
      'fix',
    ]);
  });
});

describe('automation field', () => {
  it('loads automation: true from project config', () => {
    const root = tmpRoot();
    writeConfig(root, {
      workflows: {
        'design-auto': {
          name: 'design-auto',
          description: 'automation',
          automation: true,
          stages: [{ id: 'step1', description: 's1' }],
        },
      },
    });
    const cm = new ConfigManager(root, join(root, '..', 'no-global'));
    const def = cm.getConfig().workflows['design-auto'];
    expect(def?.automation).toBe(true);
  });

  it('defaults automation to undefined when not declared', () => {
    const root = tmpRoot();
    writeConfig(root, {
      workflows: {
        plain: {
          name: 'plain',
          description: 'no automation',
          stages: [{ id: 'step1', description: 's1' }],
        },
      },
    });
    const cm = new ConfigManager(root, join(root, '..', 'no-global'));
    const def = cm.getConfig().workflows['plain'];
    expect(def?.automation).toBeUndefined();
  });
});