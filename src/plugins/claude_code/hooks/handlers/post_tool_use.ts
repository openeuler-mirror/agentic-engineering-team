/**
 * @file src/plugins/claude_code/hooks/handlers/post_tool_use.ts
 *
 * PASSIVE MODE (post) — PostToolUse hook. After a `aet workflow <...>`
 * Bash call, parse the JSON stdout and REPLACE the tool result's stdout
 * with `result.prompt` via `updatedToolOutput` (calls
 * `resultToCcPostToolOutput(result)`). The agent reads clean prompt text
 * directly in the tool result — it never sees the raw JSON. `omit_prompt`
 * in events[] skips the replacement (degrade — let original pass). Also
 * handles `aet plugin init` by signalling CC to re-scan commands.
 */

import type { CommandResult } from '../../../../definitions/events.js';
import type { CcHookInput } from '../../types.js';
import { resultToCcPostToolOutput } from '../../json_to_cc.js';
import { DIALECT_ID, resolveDialect } from '../../../dialect.js';
import { AET_PLUGIN_INIT_RE, AET_WORKFLOW_RE, debugLog, emit, emitError } from './shared.js';

const dialect = resolveDialect(DIALECT_ID);

export function handlePostToolUse(input: CcHookInput): void {
  if (input.tool_name !== 'Bash') {
    debugLog({ event: 'PostToolUse', action: 'skip_not_bash', toolName: input.tool_name });
    emit(null);
    return;
  }
  const toolInput = input.tool_input ?? {};
  const toolResp = input.tool_response ?? {};
  const command = String(toolInput['command'] ?? '').trim();
  if (AET_PLUGIN_INIT_RE.test(command)) {
    // `aet plugin init` generated slash command files into the project's
    // commands dir. Signal CC to re-scan (reloadSkills) and inject a hint
    // telling the user to run `/reload-skills`, since CC may not honor
    // reloadSkills on PostToolUse (historically SessionStart-only).
    debugLog({ event: 'PostToolUse', action: 'plugin_init_reload', command: command.slice(0, 200) });
    emit({
      hookSpecificOutput: {
        hookEventName: dialect.toHostEvent('PostToolUse'),
        reloadSkills: true,
        additionalContext: 'Tell the user to run /reload-skills so that the AET commands are available in the current session.',
      },
    });
    return;
  }

  if (!AET_WORKFLOW_RE.test(command)) {
    debugLog({ event: 'PostToolUse', action: 'skip_not_aet_workflow', command: command.slice(0, 200) });
    emit(null);
    return;
  }

  // Parse the tool's stdout as a CommandResult JSON. If parsing fails
  // (e.g. the CLI printed non-JSON for some reason — version, help, an
  // uncaught crash), surface a synthetic error so the agent isn't left
  // guessing. R9: errors are never silenced.
  const stdout = String(toolResp['stdout'] ?? '').trim();
  if (!stdout) {
    debugLog({ event: 'PostToolUse', action: 'empty_stdout', command: command.slice(0, 200) });
    emitError('PostToolUse', 'PLUGIN_EMPTY_STDOUT',
      `aet: '${command}' produced no stdout to parse. If this was \`aet --help\` or \`aet --version\`, the handler should not have matched (regex bug).`);
    return;
  }

  let result: CommandResult;
  try {
    result = JSON.parse(stdout) as CommandResult;
  } catch {
    debugLog({ event: 'PostToolUse', action: 'parse_failed', command: command.slice(0, 200), stdoutPreview: stdout.slice(0, 200) });
    emitError('PostToolUse', 'PLUGIN_PARSE_FAILED',
      `aet: failed to parse stdout as JSON for '${command}'. First 200 chars: ${stdout.slice(0, 200)}`);
    return;
  }

  debugLog({ event: 'PostToolUse', action: 'parsed', ok: result.ok, status: result.data?.status, currentStep: result.data?.currentStep, nextStep: result.data?.nextStep });

  // Replace the tool result's stdout with the agent-visible `prompt` text
  // via `updatedToolOutput`. Under the dual-channel design, `result.prompt`
  // is the COMPLETE agent-visible text (Core's err() factory puts errors
  // into prompt; buildCommandInitPrompt wraps the banner into prompt;
  // buildStepPrompt carries the step task text). So the agent reads clean
  // prompt text directly in the tool result — it never sees the raw JSON,
  // and we do NOT also inject additionalContext (would duplicate).
  //
  // Returns null when `omit_prompt` is in events[] (active-injection
  // pattern wants stdout suppressed; CC can't truly suppress — degrade by
  // not replacing, letting the original JSON stdout pass through untouched)
  // or when there's no prompt and no error to synthesize. In either case
  // we emit `{}` so CC leaves the tool result as-is.
  const ccOutput = resultToCcPostToolOutput(result);
  debugLog({ event: 'PostToolUse', action: 'emit', hasOutput: ccOutput !== null, replacedStdout: typeof ccOutput?.hookSpecificOutput?.updatedToolOutput?.stdout === 'string' });
  emit(ccOutput);
}
