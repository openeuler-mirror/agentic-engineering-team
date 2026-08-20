import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { runCli } from './index.js';
import { collectWriter, mkTempProject } from '../test/helpers.js';

/**
 * Build a CLI runner bound to ONE isolated project + global root, so sequential
 * calls within a test share the same workflow checkpoint state (Core is
 * stateful — it reads the active workflow from the on-disk checkpoint).
 */
function makeAet() {
  const projectRoot = mkTempProject();
  const globalRoot = mkTempProject(); // empty global config — no ambient leakage
  return async (argv: string[]): Promise<{ exit: number; stdout: string }> => {
    const acc = collectWriter();
    const exit = await runCli(argv, { projectRoot, globalRoot, writer: acc.writer });
    return { exit, stdout: acc.text };
  };
}

type Aet = ReturnType<typeof makeAet>;

function jsonOf(stdout: string): any {
  return JSON.parse(stdout);
}

describe('runCli — top-level', () => {
  it('prints help for empty argv (exit 0)', async () => {
    const aet = makeAet();
    const { exit, stdout } = await aet([]);
    expect(exit).toBe(0);
    expect(stdout).toContain('USAGE');
    expect(stdout).toContain('workflow init');
  });

  it('prints help for --help', async () => {
    const aet = makeAet();
    const { exit, stdout } = await aet(['--help']);
    expect(exit).toBe(0);
    expect(stdout).toContain('aet — Agentic Engineering Team CLI');
  });

  it('prints version for --version', async () => {
    const aet = makeAet();
    const { exit, stdout } = await aet(['--version']);
    expect(exit).toBe(0);
    expect(stdout).toContain('aet 0.');
  });

  it('errors on an unknown command', async () => {
    const aet = makeAet();
    const { exit, stdout } = await aet(['bogus', 'sub']);
    expect(exit).toBe(1);
    expect(jsonOf(stdout).error?.code).toBe('UNKNOWN_COMMAND');
  });
});

describe('runCli — workflow lifecycle (json mode)', () => {
  it('init → handover → status → handover to completion', async () => {
    const aet = makeAet();
    // init
    const init = await aet(['workflow', 'init', '--name', 'design', '--output', 'json']);
    expect(init.exit).toBe(0);
    expect(jsonOf(init.stdout).data.status).toBe('workflow_started');

    // handover into step 1
    const h1 = await aet(['workflow', 'handover', '--output', 'json']);
    expect(jsonOf(h1.stdout).data.status).toBe('step_advanced');
    expect(jsonOf(h1.stdout).data.currentStep).toBe('requirements_analysis');
    expect(jsonOf(h1.stdout).prompt).toContain('requirements_analysis');

    // status shows active
    const st = await aet(['workflow', 'status', '--output', 'json']);
    expect(jsonOf(st.stdout).data.status).toBe('active');

    // continue re-emits the current step without advancing
    const cont = await aet(['workflow', 'continue', '--output', 'json']);
    expect(jsonOf(cont.stdout).data.status).toBe('step_resumed');
    expect(jsonOf(cont.stdout).data.currentStep).toBe('requirements_analysis');

    // advance to step 2
    const h2 = await aet(['workflow', 'handover', '--output', 'json']);
    expect(jsonOf(h2.stdout).data.currentStep).toBe('requirements_design');

    // final handover completes the 2-step workflow
    const done = await aet(['workflow', 'handover', '--output', 'json']);
    expect(jsonOf(done.stdout).data.status).toBe('workflow_complete');
  });

  it('init surfaces intervention_required when a workflow is already active', async () => {
    const aet = makeAet();
    await aet(['workflow', 'init', '--name', 'design', '--output', 'json']);
    const second = await aet(['workflow', 'init', '--name', 'implement', '--output', 'json']);
    expect(second.exit).toBe(0);
    expect(jsonOf(second.stdout).data.status).toBe('intervention_required');
  });

  it('abort terminates the active workflow and frees the root', async () => {
    const aet = makeAet();
    await aet(['workflow', 'init', '--name', 'design', '--output', 'json']);
    await aet(['workflow', 'handover', '--output', 'json']);
    const ab = await aet(['workflow', 'abort', '--reason', 'done here', '--output', 'json']);
    expect(ab.exit).toBe(0);
    expect(jsonOf(ab.stdout).data.status).toBe('workflow_aborted');
    const st = await aet(['workflow', 'status', '--output', 'json']);
    expect(jsonOf(st.stdout).data.status).toBe('no_active');
  });

  it('lists workflows + commands from the merged config', async () => {
    const aet = makeAet();
    const list = await aet(['workflow', 'list', '--output', 'json']);
    expect(jsonOf(list.stdout).data.status).toBe('list');
    expect(jsonOf(list.stdout).data.workflows.some((w: any) => w.id === 'design')).toBe(true);
    expect(jsonOf(list.stdout).data.commands).toEqual([]);
  });

  it('command-init creates + enters step 1 in one call', async () => {
    const aet = makeAet();
    const r = await aet(['workflow', 'command-init', '--name', 'design', '--output', 'json']);
    expect(r.exit).toBe(0);
    expect(jsonOf(r.stdout).data.status).toBe('step_advanced');
    expect(jsonOf(r.stdout).prompt).toContain('AET 工作流已启动');
  });
});

describe('runCli — error paths', () => {
  it('errors unknown workflow', async () => {
    const aet = makeAet();
    const r = await aet(['workflow', 'init', '--name', 'ghost', '--output', 'json']);
    expect(r.exit).toBe(1);
    expect(jsonOf(r.stdout).error?.code).toBe('UNKNOWN_WORKFLOW');
  });

  it('errors missing --name as a usage error', async () => {
    const aet = makeAet();
    const r = await aet(['workflow', 'init', '--output', 'json']);
    expect(r.exit).toBe(1);
    expect(jsonOf(r.stdout).error?.code).toBe('USAGE_ERROR');
  });

  it('errors invalid --output value', async () => {
    const aet = makeAet();
    const r = await aet(['workflow', 'status', '--output', 'bogus']);
    expect(r.exit).toBe(1);
    expect(jsonOf(r.stdout).error?.code).toBe('USAGE_ERROR');
  });

  it('errors handover with no active workflow', async () => {
    const aet = makeAet();
    const r = await aet(['workflow', 'handover', '--output', 'json']);
    expect(r.exit).toBe(1);
    expect(jsonOf(r.stdout).error?.code).toBe('NO_ACTIVE_WORKFLOW');
  });

  it('errors continue right after init (NO_ACTIVE_STEP)', async () => {
    const aet = makeAet();
    await aet(['workflow', 'init', '--name', 'design', '--output', 'json']);
    const r = await aet(['workflow', 'continue', '--output', 'json']);
    expect(jsonOf(r.stdout).error?.code).toBe('NO_ACTIVE_STEP');
  });

  it('errors abort with nothing active', async () => {
    const aet = makeAet();
    const r = await aet(['workflow', 'abort', '--output', 'json']);
    expect(jsonOf(r.stdout).error?.code).toBe('NO_ACTIVE_WORKFLOW');
  });
});

describe('runCli — prompt mode & internal visibility', () => {
  it('default --output prompt prints the prompt verbatim', async () => {
    const aet = makeAet();
    const r = await aet(['workflow', 'init', '--name', 'design']);
    expect(r.exit).toBe(0);
    expect(r.stdout).toContain('AET workflow started');
  });

  it('--help hides the internal command-init spec', async () => {
    const aet = makeAet();
    const { stdout } = await aet(['--help']);
    expect(stdout).not.toContain('command-init');
  });
});

describe('runCli — context', () => {
  it('emits aet-tools XML to stdout (exit 0)', async () => {
    const aet = makeAet();
    const r = await aet(['context', 'aet-tools']);
    expect(r.exit).toBe(0);
    expect(r.stdout).toContain('<aet-tools>');
    expect(r.stdout).toContain('aet-workflow-status');
  });

  it('errors when --root points at a nonexistent directory', async () => {
    const aet = makeAet();
    const r = await aet(['context', '--root', '/definitely/not/a/real/dir']);
    expect(r.exit).toBe(1);
  });

  it('exits 1 when all requested plugins are unknown (no data)', async () => {
    const aet = makeAet();
    const r = await aet(['context', 'ghost-plugin']);
    expect(r.exit).toBe(1);
  });
});

describe('runCli — plugin init', () => {
  it('runs the generator against the project root without crashing', async () => {
    const aet = makeAet();
    const r = await aet(['plugin', 'init', '--output', 'json']);
    expect(r.exit).toBe(0);
    expect(jsonOf(r.stdout).ok).toBe(true);
  });
});
