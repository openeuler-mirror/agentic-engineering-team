import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigManager } from './config_manager.js';
import { WorkflowRegistry } from './workflow_registry.js';

function makeRegistry(projectConfig?: unknown): WorkflowRegistry {
  const root = mkdtempSync(join(tmpdir(), 'aet-reg-'));
  if (projectConfig) {
    const dir = join(root, '.aet', 'config');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'workflow.json'), JSON.stringify(projectConfig, null, 2), 'utf8');
  }
  const cm = new ConfigManager(root, join(root, '..', 'no-global'));
  return new WorkflowRegistry(cm);
}

const ctx = { step: { id: 's1', description: 'step one' } };

describe('WorkflowRegistry read helpers', () => {
  it('lists workflows with id/name/description', () => {
    const reg = configRegistryWithConfig();
    const wfs = reg.listWorkflows();
    expect(wfs.find((w) => w.id === 'design')?.name).toBe('design');
    expect(wfs.find((w) => w.id === 'design')?.description.length).toBeGreaterThan(0);
  });

  it('getWorkflow returns the definition or null', () => {
    const reg = configRegistryWithConfig();
    expect(reg.getWorkflow('design')).toBeTruthy();
    expect(reg.getWorkflow('nope')).toBeNull();
  });

  it('lists commands and resolves a single command', () => {
    const reg = configRegistryWithConfig();
    const cmds = reg.listCommands();
    expect(cmds.find((c) => c.id === 'aet-doc')?.name).toBe('aet-doc');
    expect(reg.getCommand('aet-doc')?.description).toBe('generate docs');
    expect(reg.getCommand('nope')).toBeNull();
  });

  it('getHook returns a preset or null', () => {
    const reg = configRegistryWithConfig();
    expect(reg.getHook('confirm')?.event).toBe('hook.prompt');
    expect(reg.getHook('missing')).toBeNull();
  });
});

describe('resolveStepHook', () => {
  it('resolves an inline context.clear with a derived reason', () => {
    const reg = configRegistryWithConfig();
    const ev = reg.resolveStepHook({ at: 'after', event: 'context.clear' }, ctx);
    expect(ev).toEqual({ id: 'context.clear', payload: { reason: 'step.clear: s1' } });
  });

  it('resolves an inline prompt.inject', () => {
    const reg = configRegistryWithConfig();
    const ev = reg.resolveStepHook({ at: 'before', event: 'prompt.inject', payload: { text: 'hello', type: 'handover' } }, ctx);
    expect(ev).toEqual({ id: 'prompt.inject', payload: { text: 'hello', type: 'handover' } });
  });

  it('returns null for a prompt.inject without text', () => {
    const reg = configRegistryWithConfig();
    expect(reg.resolveStepHook({ at: 'before', event: 'prompt.inject', payload: {} }, ctx)).toBeNull();
  });

  it('resolves a hook.prompt (blocking)', () => {
    const reg = configRegistryWithConfig();
    const ev = reg.resolveStepHook({ at: 'before', event: 'hook.prompt', payload: { text: 'allow?' } }, ctx);
    expect(ev?.id).toBe('hook.prompt');
  });

  it('resolves a hook.preset reference merged with inline payload', () => {
    const reg = configRegistryWithConfig();
    const ev = reg.resolveStepHook({ at: 'after', preset: 'confirm' }, ctx);
    expect(ev?.id).toBe('hook.prompt');
    expect((ev?.payload as { text: string }).text).toContain('确认');
  });

  it('returns null for an unknown preset reference', () => {
    const reg = configRegistryWithConfig();
    expect(reg.resolveStepHook({ at: 'after', preset: 'ghost' }, ctx)).toBeNull();
  });

  it('resolves prompt.inject_system', () => {
    const reg = configRegistryWithConfig();
    const ev = reg.resolveStepHook({ at: 'before', event: 'prompt.inject_system', payload: { text: 'sys' } }, ctx);
    expect(ev?.id).toBe('prompt.inject_system');
  });

  it('interpolates ${step.id} / ${step.description} in hook.func args', () => {
    const reg = configRegistryWithConfig();
    const ev = reg.resolveStepHook(
      { at: 'before', event: 'hook.func', payload: { command: 'scripts/step.sh', args: ['${step.id}', '${step.description}'] } },
      ctx,
    );
    expect(ev?.id).toBe('hook.func');
    const payload = ev?.payload as { command: string; args: string[] };
    expect(payload.args).toEqual(['s1', 'step one']);
  });

  it('returns null for hook.func without a command', () => {
    const reg = configRegistryWithConfig();
    expect(reg.resolveStepHook({ at: 'before', event: 'hook.func', payload: {} }, ctx)).toBeNull();
  });
});

function configRegistryWithConfig(): WorkflowRegistry {
  return makeRegistry({
    hooks: {
      confirm: {
        description: '确认',
        event: 'hook.prompt',
        payload: { text: '## 阶段完成确认\n\n完成？' },
      },
    },
    workflows: {
      design: {
        name: 'design',
        description: '设计工作流',
        stages: [{ id: 'requirements_analysis', description: '需求分析' }],
      },
    },
    commands: {
      'aet-doc': { name: 'aet-doc', description: 'generate docs' },
    },
  });
}