/**
 * Claude Code agent — separate-file rule + .claude/settings.local.json perms.
 *
 * Architecture (mirrors Spec Kit's ClaudeIntegration):
 *   - SkillsIntegration subclass: skills installed under .claude/skills/
 *   - Minimal subclass: only class attrs, behavior inherited from base
 *
 * Rule file : .claude/rules/aet-design-env.md (separate_file)
 * Config    : CLAUDE.md (append `@<rule_file>` import line — Claude Code's
 *             native import syntax is `@path`, NOT `@import path`)
 * Perms     : .claude/settings.local.json permissions.deny[]
 */
import { BaseAgent } from '../base-agent';

export default class ClaudeAgent extends BaseAgent {
  readonly key = 'claude';
  readonly name = 'Claude Code';
  readonly aliases = ['claude code', 'claude'];

  readonly ruleInjectStrategy = 'separate_file' as const;
  readonly ruleFile = '.claude/rules/aet-design-env.md';
  readonly ruleConfigPath = 'CLAUDE.md';
  readonly ruleConfigInject = '@{rule_file}';
  readonly permissionsTargets = [
    { file: '.claude/settings.local.json', format: 'claude_settings' as const },
  ];
}
