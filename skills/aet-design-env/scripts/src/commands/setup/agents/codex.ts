/**
 * Codex CLI agent — inline-tag rule (AGENTS.md) + .codex/hooks.json
 * PreToolUse hook for command-level blocking.
 *
 * Architecture (mirrors Spec Kit's CodexIntegration):
 *   - SkillsIntegration subclass, key matches CLI executable name (`codex`)
 *   - AGENTS.md is native context file for Codex (no bridge needed)
 *
 * Rule file : AGENTS.md (inline_tag — Codex owns AGENTS.md alongside
 *             other agents like opencode, so we share the user-owned file)
 * Perms     : .codex/hooks.json (PreToolUse hook: Bash|Edit|Write matcher,
 *             tool_input.command checked against deny patterns via python)
 */
import { BaseAgent } from '../base-agent';

export default class CodexAgent extends BaseAgent {
  readonly key = 'codex';
  readonly name = 'Codex CLI';
  readonly aliases = ['codex'];

  readonly ruleInjectStrategy = 'inline_tag' as const;
  readonly targetFile = 'AGENTS.md';
  readonly tag = 'aet-design-env-rule';
  readonly permissionsTargets = [
    { file: '.codex/hooks.json', format: 'codex_hooks' as const },
  ];
}
