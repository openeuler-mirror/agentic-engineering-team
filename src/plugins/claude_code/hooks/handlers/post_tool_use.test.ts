import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CcHookInput } from '../../types.js';
import type { CommandResult } from '../../../../definitions/events.js';

const { emit, emitError, debugLog } = vi.hoisted(() => ({
  emit: vi.fn(),
  emitError: vi.fn(),
  debugLog: vi.fn(),
}));

vi.mock('./shared.js', () => ({
  emit,
  emitError,
  debugLog,
  AET_PLUGIN_INIT_RE: /aet\s+plugin\s+init\b/,
  AET_WORKFLOW_RE: /aet\s+workflow\s+\S+/,
}));

import { handlePostToolUse } from './post_tool_use.js';

function bashInput(command: string, stdout: string): CcHookInput {
  return {
    tool_name: 'Bash',
    tool_input: { command },
    tool_response: { stdout },
  } as unknown as CcHookInput;
}

function resultJson(prompt: string): string {
  const r: CommandResult = { ok: true, prompt, events: [] };
  return JSON.stringify(r);
}

describe('handlePostToolUse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes through non-Bash tools', () => {
    handlePostToolUse({ tool_name: 'Read' } as unknown as CcHookInput);
    expect(emit).toHaveBeenCalledWith(null);
  });

  it('signals reloadSkills for aet plugin init', () => {
    handlePostToolUse(bashInput('aet plugin init', 'anything'));
    expect(emit).toHaveBeenCalledWith({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        reloadSkills: true,
        additionalContext: 'Tell the user to run /reload-skills so that the AET commands are available in the current session.',
      },
    });
  });

  it('passes through non-workflow AET-less commands', () => {
    handlePostToolUse(bashInput('ls -la', 'files'));
    expect(emit).toHaveBeenCalledWith(null);
  });

  it('emits a synthetic error on empty stdout', () => {
    handlePostToolUse(bashInput('aet workflow status', ''));
    expect(emitError).toHaveBeenCalledWith('PostToolUse', 'PLUGIN_EMPTY_STDOUT', expect.stringContaining('produced no stdout'));
  });

  it('emits a synthetic error on non-JSON stdout', () => {
    handlePostToolUse(bashInput('aet workflow status', 'not json at all'));
    expect(emitError).toHaveBeenCalledWith('PostToolUse', 'PLUGIN_PARSE_FAILED', expect.stringContaining('failed to parse'));
  });

  it('replaces the tool stdout with the clean prompt text', () => {
    handlePostToolUse(bashInput('aet workflow handover', resultJson('## Next step: implement')));
    expect(emit).toHaveBeenCalledWith({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        updatedToolOutput: { stdout: '## Next step: implement', stderr: '', interrupted: false },
      },
    });
  });

  it('emits {} (null) when omit_prompt is in events', () => {
    const r: CommandResult = {
      ok: true,
      prompt: 'should be suppressed',
      events: [{ id: 'omit_prompt' as never, payload: {} }],
    };
    handlePostToolUse(bashInput('aet workflow handover', JSON.stringify(r)));
    expect(emit).toHaveBeenCalledWith(null);
  });
});