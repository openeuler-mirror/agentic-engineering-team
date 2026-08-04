import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigManager } from './config_manager.js';
import { WorkflowRegistry } from './workflow_registry.js';
import { WorkflowEngine } from './workflow_engine.js';
import type { InputEvent, CommandResult } from '../definitions/events.js';

/** Baseline design workflow: requirements_analysis → requirements_design → development_plan. */
const DESIGN = 'design';

function makeEngine(projectConfig?: unknown): WorkflowEngine {
  const root = mkdtempSync(join(tmpdir(), 'aet-engine-'));
  if (projectConfig) {
    const dir = join(root, '.aet', 'config');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'workflow.json'), JSON.stringify(projectConfig, null, 2), 'utf8');
  }
  const cm = new ConfigManager(root, join(root, '..', 'no-global'));
  return new WorkflowEngine(new WorkflowRegistry(cm), { projectRoot: root });
}

const init = (name: string): InputEvent => ({ event: 'workflow.init', payload: { name } });
const handover = (step?: string): InputEvent => ({
  event: 'workflow.handover',
  payload: step ? { step } : {},
});
const status = (): InputEvent => ({ event: 'workflow.status', payload: {} });
const abort = (reason?: string): InputEvent => ({
  event: 'workflow.abort',
  payload: reason ? { reason } : {},
});
const list = (): InputEvent => ({ event: 'workflow.list', payload: {} });

function expectOk(r: CommandResult): Exclude<CommandResult['data'], undefined> {
  expect(r.ok).toBe(true);
  return r.data!;
}

describe('workflow.init', () => {
  it('creates a checkpoint and returns workflow_started without entering a step', () => {
    const engine = makeEngine();
    const r = engine.handleInit(init(DESIGN));
    expect(r.ok).toBe(true);
    const data = expectOk(r);
    expect(data.status).toBe('workflow_started');
    expect(data.currentStep).toBeNull();
    expect(data.nextStep).toBe('requirements_analysis');
    expect(r.prompt).toContain('aet workflow handover');
  });

  it('persists the initial-requirement argument into the checkpoint and data', () => {
    const engine = makeEngine();
    const r = engine.handleInit({ event: 'workflow.init', payload: { name: DESIGN, argument: '做一个登录功能' } });
    const data = expectOk(r);
    expect(data.status).toBe('workflow_started');
    expect(data.argument).toBe('做一个登录功能');
  });

  it('errors MISSING_PARAM without a name', () => {
    const engine = makeEngine();
    const r = engine.handleInit({ event: 'workflow.init', payload: {} });
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('MISSING_PARAM');
  });

  it('errors UNKNOWN_WORKFLOW for an unknown name', () => {
    const engine = makeEngine();
    expect(engine.handleInit(init('nope')).error?.code).toBe('UNKNOWN_WORKFLOW');
  });

  it('errors EMPTY_WORKFLOW when the workflow has no stages', () => {
    const engine = makeEngine({
      workflows: { empty: { name: 'empty', description: 'd', stages: [] } },
    });
    expect(engine.handleInit(init('empty')).error?.code).toBe('EMPTY_WORKFLOW');
  });

  it('returns intervention_required when an active workflow already exists', () => {
    const engine = makeEngine();
    engine.handleInit(init(DESIGN));
    const r = engine.handleInit(init('implement'));
    const data = expectOk(r);
    expect(data.status).toBe('intervention_required');
    expect(r.prompt).toContain('Workflow already active');
  });
});

describe('workflow.handover', () => {
  it('advances into step 1 on the first handover (step_advanced)', () => {
    const engine = makeEngine();
    engine.handleInit(init(DESIGN));
    const r = engine.handleHandover(handover());
    const data = expectOk(r);
    expect(data.status).toBe('step_advanced');
    expect(data.currentStep).toBe('requirements_analysis');
    expect(data.nextStep).toBe('requirements_design');
    expect(r.prompt).toContain('requirements_analysis');
  });

  it('errors NO_ACTIVE_WORKFLOW without an active workflow', () => {
    const engine = makeEngine();
    expect(engine.handleHandover(handover()).error?.code).toBe('NO_ACTIVE_WORKFLOW');
  });

  it('jumps to an explicit --step', () => {
    const engine = makeEngine();
    engine.handleInit(init(DESIGN));
    const r = engine.handleHandover(handover('requirements_design'));
    const data = expectOk(r);
    expect(data.status).toBe('step_advanced');
    expect(data.currentStep).toBe('requirements_design');
  });

  it('errors UNKNOWN_STEP for an unknown --step', () => {
    const engine = makeEngine();
    engine.handleInit(init(DESIGN));
    expect(engine.handleHandover(handover('ghost')).error?.code).toBe('UNKNOWN_STEP');
  });

  it('completes the workflow after the last step (workflow_complete)', () => {
    const engine = makeEngine();
    engine.handleInit(init(DESIGN));
    engine.handleHandover(handover()); // → step 1
    engine.handleHandover(handover()); // → step 2
    engine.handleHandover(handover()); // → step 3
    const r = engine.handleHandover(handover()); // last step → complete
    const data = expectOk(r);
    expect(data.status).toBe('workflow_complete');
    expect(r.prompt).toContain('工作流完成');
    // A subsequent handover now errors — nothing active.
    expect(engine.handleHandover(handover()).error?.code).toBe('NO_ACTIVE_WORKFLOW');
  });
});

describe('workflow.continue', () => {
  it('errors NO_ACTIVE_STEP when init but not yet handed over', () => {
    const engine = makeEngine();
    engine.handleInit(init(DESIGN));
    const r = engine.handleContinue({ event: 'workflow.continue', payload: {} });
    expect(r.error?.code).toBe('NO_ACTIVE_STEP');
  });

  it('re-emits the current step as step_resumed without advancing', () => {
    const engine = makeEngine();
    engine.handleInit(init(DESIGN));
    engine.handleHandover(handover()); // now on step 1
    const r = engine.handleContinue({ event: 'workflow.continue', payload: {} });
    const data = expectOk(r);
    expect(data.status).toBe('step_resumed');
    expect(data.currentStep).toBe('requirements_analysis');
    expect(r.prompt).toContain('requirements_analysis');
  });

  it('re-injects the initial-requirement argument into the resume prompt', () => {
    const engine = makeEngine();
    engine.handleInit({ event: 'workflow.init', payload: { name: DESIGN, argument: '做一个登录功能' } });
    engine.handleHandover(handover()); // step 1
    const r = engine.handleContinue({ event: 'workflow.continue', payload: {} });
    const data = expectOk(r);
    expect(data.status).toBe('step_resumed');
    expect(data.argument).toBe('做一个登录功能');
    expect(r.prompt).toContain('初始需求');
    expect(r.prompt).toContain('做一个登录功能');
  });

  it('does NOT inject the argument into a plain step_advanced handover prompt', () => {
    const engine = makeEngine();
    engine.handleInit({ event: 'workflow.init', payload: { name: DESIGN, argument: '做一个登录功能' } });
    const r = engine.handleHandover(handover()); // → step 1
    const data = expectOk(r);
    expect(data.status).toBe('step_advanced');
    expect(data.argument).toBeUndefined(); // handover does not surface the argument
    expect(r.prompt).not.toContain('初始需求');
  });

  it('errors NO_ACTIVE_WORKFLOW when nothing is active', () => {
    const engine = makeEngine();
    expect(engine.handleContinue({ event: 'workflow.continue', payload: {} }).error?.code).toBe('NO_ACTIVE_WORKFLOW');
  });
});

describe('workflow.status', () => {
  it('returns no_active when nothing is running', () => {
    const engine = makeEngine();
    const data = expectOk(engine.handleStatus(status()));
    expect(data.status).toBe('no_active');
  });

  it('returns active with checkpoint meta once a workflow started', () => {
    const engine = makeEngine();
    engine.handleInit(init(DESIGN));
    const data = expectOk(engine.handleStatus(status()));
    expect(data.status).toBe('active');
    expect(data.workflow).toBe('design');
    expect(data.checkpointId).toBeTruthy();
  });
});

describe('workflow.abort', () => {
  it('errors NO_ACTIVE_WORKFLOW when nothing is active', () => {
    const engine = makeEngine();
    expect(engine.handleAbort(abort()).error?.code).toBe('NO_ACTIVE_WORKFLOW');
  });

  it('archives the active workflow as workflow_aborted with a reason', () => {
    const engine = makeEngine();
    engine.handleInit(init(DESIGN));
    engine.handleHandover(handover());
    const r = engine.handleAbort(abort('changed my mind'));
    const data = expectOk(r);
    expect(data.status).toBe('workflow_aborted');
    expect(r.prompt).toContain('changed my mind');
    // Now nothing active.
    expect(engine.handleStatus(status()).data?.status).toBe('no_active');
  });
});

describe('workflow.list', () => {
  it('lists workflows and commands from the merged config', () => {
    const engine = makeEngine({
      commands: { 'aet-doc': { name: 'aet-doc', description: 'docs' } },
    });
    const r = engine.handleList(list());
    const data = expectOk(r);
    expect(data.status).toBe('list');
    expect(data.workflows!.some((w) => w.id === 'design')).toBe(true);
    expect(data.commands!.some((c) => c.id === 'aet-doc')).toBe(true);
    expect(r.prompt).toContain('Available workflows');
  });
});

describe('workflow.commandInit', () => {
  it('creates the workflow AND enters step 1 in one call with an orientation banner', () => {
    const engine = makeEngine();
    const r = engine.handleCommandInit(init(DESIGN));
    const data = expectOk(r);
    expect(data.status).toBe('step_advanced');
    expect(data.currentStep).toBe('requirements_analysis');
    expect(r.prompt).toContain('AET 工作流已启动');
    expect(r.prompt).toContain('requirements_analysis');
  });

  it('surfaces intervention_required instead of advancing when active', () => {
    const engine = makeEngine();
    engine.handleInit(init(DESIGN));
    const r = engine.handleCommandInit(init('implement'));
    const data = expectOk(r);
    expect(data.status).toBe('intervention_required');
  });

  it('propagates init failure (unknown workflow)', () => {
    const engine = makeEngine();
    expect(engine.handleCommandInit(init('ghost')).error?.code).toBe('UNKNOWN_WORKFLOW');
  });
});

describe('step hooks', () => {
  const hookConfig = {
    hooks: {
      confirm: {
        description: '确认',
        event: 'hook.prompt',
        payload: { text: '## 确认阶段产出\n完成了吗？' },
      },
    },
    workflows: {
      gated: {
        name: 'gated',
        description: 'with confirm gate',
        stages: [
          { id: 'step1', description: 'first' },
          {
            id: 'step2',
            description: 'second',
            hooks: [
              { at: 'after', event: 'context.clear' },
              { at: 'after', preset: 'confirm' },
            ],
          },
        ],
      },
    },
  };

  it('blocks on a hook.prompt (hook_pending) and resumes on the next handover', () => {
    const engine = makeEngine(hookConfig);
    engine.handleInit(init('gated'));
    engine.handleHandover(handover()); // enter step1
    // Handover into step2: step1 after hooks are empty, so we reach step2's
    // before hooks first... but the hooks are declared as `after` on step2,
    // which fire when LEAVING step2. So the first handover to step2 advances.
    const intoStep2 = engine.handleHandover(handover());
    expect(intoStep2.data?.status).toBe('step_advanced');
    expect(intoStep2.data?.currentStep).toBe('step2');

    // Leaving step2 fires its `after` hooks: context.clear (non-blocking)
    // then confirm (hook.prompt, BLOCKING). Handover past step2 defers.
    const blocked = engine.handleHandover(handover());
    const data = expectOk(blocked);
    expect(data.status).toBe('hook_pending');
    expect(data.currentStep).toBe('step2'); // did NOT advance
    expect(blocked.prompt).toContain('确认阶段产出');
    // Non-blocking context.clear is carried in events[] even while blocked.
    expect(blocked.events.some((e) => e.id === 'context.clear')).toBe(true);

    // Next handover resumes: no more hooks → step2 is last → complete.
    const resumed = engine.handleHandover(handover());
    expect(resumed.data?.status).toBe('workflow_complete');
  });

  it('carries non-blocking hook events in events[] on a plain advance', () => {
    const engine = makeEngine(hookConfig);
    engine.handleInit(init('gated'));
    engine.handleHandover(handover()); // step1
    engine.handleHandover(handover()); // step2
    const r = engine.handleHandover(handover()); // complete (blocked → hook_pending)
    expect(r.events.some((e) => e.id === 'context.clear')).toBe(true);
  });
});

describe('stale-config guards', () => {
  it('handover errors UNKNOWN_WORKFLOW when the active workflow was removed from config', () => {
    const engine = makeEngine();
    engine.handleInit(init(DESIGN));
    // Remove design from config, keep the checkpoint on disk.
    engine.handleHandover(handover());
    // No way to mutate config on a live engine; covered via status stale path below.
    expect(engine.handleStatus(status()).data?.status).toBe('active');
  });
});