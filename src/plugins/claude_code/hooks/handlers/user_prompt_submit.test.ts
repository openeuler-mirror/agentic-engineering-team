import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CcHookInput } from '../../types.js';
import type { CommandResult } from '../../../../definitions/events.js';

const { runAet, resolveAetBin, emit, emitError, debugLog } = vi.hoisted(() => ({
  runAet: vi.fn(),
  resolveAetBin: vi.fn(() => 'aet'),
  emit: vi.fn(),
  emitError: vi.fn(),
  debugLog: vi.fn(),
}));

vi.mock('./shared.js', () => ({ runAet, resolveAetBin, emit, emitError, debugLog }));

import { handleUserPromptSubmit } from './user_prompt_submit.js';

function promptInput(prompt: string): CcHookInput {
  return { prompt } as unknown as CcHookInput;
}

function okStep1(): CommandResult {
  return {
    ok: true,
    prompt: '## banner\n---\nstep1 task',
    events: [],
    data: { status: 'step_advanced', workflow: 'aet-design', currentStep: 's1', nextStep: null },
  };
}

describe('handleUserPromptSubmit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runAet.mockResolvedValue(okStep1());
  });

  it('passes through prompts that are not slash commands', async () => {
    await handleUserPromptSubmit(promptInput('what is 2+2'));
    expect(runAet).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(null);
  });

  it('passes /init through (no bootstrap injection, native command expansion)', async () => {
    // /init is no longer intercepted: it flows to command-init → UNKNOWN_WORKFLOW
    // → native expansion surfaces init.md (which directs the agent to the
    // aet-install skill). No bootstrap path is injected.
    runAet.mockResolvedValue({
      ok: false,
      prompt: 'ERROR: UNKNOWN_WORKFLOW — no such workflow',
      events: [],
      error: { code: 'UNKNOWN_WORKFLOW', message: 'no such workflow' },
    });
    await handleUserPromptSubmit(promptInput('/init'));
    expect(runAet).toHaveBeenCalledWith(
      ['workflow', 'command-init', '--name', 'init', '--output', 'json'],
      undefined,
    );
    expect(emit).toHaveBeenCalledWith(null);
  });

  it('calls command-init and injects the prompt for a matched slash command', async () => {
    await handleUserPromptSubmit(promptInput('/aet-design'));
    expect(runAet).toHaveBeenCalledWith(
      ['workflow', 'command-init', '--name', 'aet-design', '--output', 'json'],
      undefined,
    );
    const arg = emit.mock.calls[0][0];
    expect(arg.hookSpecificOutput.additionalContext).toContain('step1 task');
  });

  it('forwards trailing slash-command args as --argument', async () => {
    await handleUserPromptSubmit(promptInput('/aet-design 做一个登录功能'));
    expect(runAet).toHaveBeenCalledWith(
      ['workflow', 'command-init', '--name', 'aet-design', '--output', 'json', '--argument', '做一个登录功能'],
      undefined,
    );
  });

  it('omits --argument when the slash command has no trailing args', async () => {
    await handleUserPromptSubmit(promptInput('/aet-design'));
    const call = runAet.mock.calls[0][0] as string[];
    expect(call).not.toContain('--argument');
  });

  it('emits null for a UNKNOWN_WORKFLOW (command pass-through)', async () => {
    runAet.mockResolvedValue({
      ok: false,
      prompt: 'ERROR: UNKNOWN_WORKFLOW — no such workflow "aet-doc"',
      events: [],
      error: { code: 'UNKNOWN_WORKFLOW', message: 'no such workflow' },
    });
    await handleUserPromptSubmit(promptInput('/aet-doc'));
    expect(emit).toHaveBeenCalledWith(null);
  });

  it('injects a spawn-failure synthetic error when runAet returns null', async () => {
    runAet.mockResolvedValue(null);
    await handleUserPromptSubmit(promptInput('/aet-design'));
    expect(emitError).toHaveBeenCalledWith('UserPromptSubmit', 'PLUGIN_SPAWN_FAILED', expect.stringContaining('failed to spawn'));
  });

  it('injects the intervention prompt on intervention_required', async () => {
    runAet.mockResolvedValue({
      ok: true,
      prompt: 'workflow already active',
      events: [],
      data: { status: 'intervention_required', currentStep: 's1', checkpointId: 'c1' },
    });
    await handleUserPromptSubmit(promptInput('/aet-design'));
    const arg = emit.mock.calls[0][0];
    expect(arg.hookSpecificOutput.additionalContext).toContain('workflow already active');
  });

  it('injects the hook prompt on hook_pending', async () => {
    runAet.mockResolvedValue({
      ok: true,
      prompt: 'confirm?',
      events: [],
      data: { status: 'hook_pending', currentStep: 's1', nextStep: null },
    });
    await handleUserPromptSubmit(promptInput('/aet-design'));
    expect(emit.mock.calls[0][0].hookSpecificOutput.additionalContext).toContain('confirm?');
  });

  it('injects the error prompt on a non-ok command-init failure', async () => {
    runAet.mockResolvedValue({
      ok: false,
      prompt: 'ERROR: NO_ACTIVE — nothing',
      events: [],
      error: { code: 'NO_ACTIVE', message: 'nothing' },
    });
    await handleUserPromptSubmit(promptInput('/aet-design'));
    expect(emit.mock.calls[0][0].hookSpecificOutput.additionalContext).toContain('ERROR: NO_ACTIVE');
  });

  it('falls back to injecting as-is on an unexpected status', async () => {
    runAet.mockResolvedValue({
      ok: true,
      prompt: 'unexpected text',
      events: [],
      data: { status: 'mystery_status' },
    });
    await handleUserPromptSubmit(promptInput('/aet-design'));
    expect(emit.mock.calls[0][0].hookSpecificOutput.additionalContext).toContain('unexpected text');
  });
});