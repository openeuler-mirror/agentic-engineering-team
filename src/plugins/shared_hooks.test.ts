import { describe, expect, it } from 'vitest';
import {
  AET_PLUGIN_INIT_RE,
  AET_WORKFLOW_RE,
  SLASH_CMD_RE,
  hasFlag,
  isSingleCommand,
  parseSlash,
  parseSlashArgs,
  rewriteAddFlag,
} from './shared_hooks.js';

describe('parseSlash', () => {
  it('captures prefixed / bare / namespaced slash ids', () => {
    expect(parseSlash('/aet-design')).toBe('aet-design');
    expect(parseSlash('/design')).toBe('design');
    expect(parseSlash('/aet:aet-design')).toBe('aet-design');
  });

  it('returns null for non-slash prompts', () => {
    expect(parseSlash('what is 2+2')).toBeNull();
  });
});

describe('parseSlashArgs', () => {
  it('captures the trailing args after the id', () => {
    expect(parseSlashArgs('/aet-design 做一个登录功能')).toBe('做一个登录功能');
    expect(parseSlashArgs('/design foo bar baz')).toBe('foo bar baz');
  });

  it('returns null for a slash command with no trailing args', () => {
    expect(parseSlashArgs('/aet-design')).toBeNull();
    expect(parseSlashArgs('/aet-design   ')).toBeNull();
  });

  it('returns null for non-slash prompts', () => {
    expect(parseSlashArgs('what is 2+2')).toBeNull();
  });

  it('only consumes the first line (a trailing newline stops capture)', () => {
    expect(parseSlashArgs('/aet-design one two\nsecond line')).toBe('one two');
  });
});

describe('AET_WORKFLOW_RE / AET_PLUGIN_INIT_RE', () => {
  it('matches aet workflow bash invocations', () => {
    expect(AET_WORKFLOW_RE.test('aet workflow handover')).toBe(true);
    expect(AET_WORKFLOW_RE.test('aet plugin init')).toBe(false);
  });

  it('matches aet plugin init invocations', () => {
    expect(AET_PLUGIN_INIT_RE.test('aet plugin init')).toBe(true);
    expect(AET_PLUGIN_INIT_RE.test('aet plugin init --agent x')).toBe(true);
    expect(AET_PLUGIN_INIT_RE.test('aet workflow handover')).toBe(false);
  });

  it('matches prefixed / chained aet workflow commands (not anchored to ^)', () => {
    // An agent often emits `cd <path> && aet workflow ...` or `sudo aet ...`;
    // the matcher must still fire so --output json gets appended and the
    // post-hook can replace stdout. Pre-fix the regex was anchored to ^aet
    // and silently missed these, leaking raw JSON into the tool result.
    expect(AET_WORKFLOW_RE.test('cd /proj && aet workflow init --name x')).toBe(true);
    expect(AET_WORKFLOW_RE.test('sudo aet workflow handover')).toBe(true);
    expect(AET_WORKFLOW_RE.test('aet workflow handover && echo done')).toBe(true);
    expect(AET_PLUGIN_INIT_RE.test('cd /proj && aet plugin init')).toBe(true);
  });

  it('does not match ordinary non-AET commands', () => {
    expect(AET_WORKFLOW_RE.test('git status')).toBe(false);
    expect(AET_WORKFLOW_RE.test('ls -la /tmp')).toBe(false);
    expect(AET_PLUGIN_INIT_RE.test('git status')).toBe(false);
  });
});

describe('SLASH_CMD_RE', () => {
  it('is anchored to the first line', () => {
    expect(SLASH_CMD_RE.test('/aet-design')).toBe(true);
    expect(SLASH_CMD_RE.test('not a slash\n/aet-design')).toBe(false);
  });
});

describe('hasFlag', () => {
  it('detects bare and =-form flags', () => {
    expect(hasFlag('aet workflow init --output json', ['--output', '-o'])).toBe(true);
    expect(hasFlag('aet workflow init --output=json', ['--output', '-o'])).toBe(true);
    expect(hasFlag('aet workflow init', ['--output', '-o'])).toBe(false);
  });
});

describe('rewriteAddFlag', () => {
  it('appends the flag when missing', () => {
    expect(rewriteAddFlag('aet workflow handover', ['--output', '-o'], 'json')).toBe(
      'aet workflow handover --output json',
    );
  });

  it('returns null when the flag is already present', () => {
    expect(rewriteAddFlag('aet workflow handover --output json', ['--output', '-o'], 'json')).toBeNull();
  });

  it('inserts the flag after the aet invocation, not at end-of-string (pipeline)', () => {
    // The flag must land on the `aet` call, not on the stage after `|` / `&&`.
    expect(rewriteAddFlag('aet workflow status | jq .workflow', ['--output', '-o'], 'json')).toBe(
      'aet workflow status --output json | jq .workflow',
    );
    expect(rewriteAddFlag('aet workflow status && echo done', ['--output', '-o'], 'json')).toBe(
      'aet workflow status --output json && echo done',
    );
  });

  it('inserts the flag mid-command for a prefixed/chained aet invocation', () => {
    expect(rewriteAddFlag('cd /proj && aet workflow init --name x', ['--output', '-o'], 'json')).toBe(
      'cd /proj && aet workflow init --output json --name x',
    );
  });

  it('appends --agent after `aet plugin init`', () => {
    expect(rewriteAddFlag('aet plugin init', ['--agent'], 'claude-code')).toBe(
      'aet plugin init --agent claude-code',
    );
  });

  it('preserves a trailing newline', () => {
    expect(rewriteAddFlag('aet workflow handover\n', ['--output', '-o'], 'json')).toBe(
      'aet workflow handover --output json\n',
    );
  });

  it('returns null for a command with no aet invocation', () => {
    expect(rewriteAddFlag('git status', ['--output', '-o'], 'json')).toBeNull();
  });
});

describe('isSingleCommand', () => {
  it('accepts a lone well-formed aet invocation', () => {
    expect(isSingleCommand('aet workflow handover')).toBe(true);
    expect(isSingleCommand('aet workflow status --output json')).toBe(true);
    expect(isSingleCommand('aet plugin init --agent opencode')).toBe(true);
  });

  it('rejects chained / piped / redirected commands', () => {
    expect(isSingleCommand('aet workflow status && echo done')).toBe(false);
    expect(isSingleCommand('aet workflow status | jq .workflow')).toBe(false);
    expect(isSingleCommand('aet workflow status; echo hi')).toBe(false);
    expect(isSingleCommand('aet workflow status > /tmp/x.json')).toBe(false);
    expect(isSingleCommand('aet workflow status $(cat x)')).toBe(false);
  });

  it('allows shell metacharacters inside quoted regions', () => {
    expect(isSingleCommand('aet workflow init --name design --argument "a | b && c"')).toBe(true);
    expect(isSingleCommand("aet workflow init --name design --argument 'x;y'")).toBe(true);
  });
});
