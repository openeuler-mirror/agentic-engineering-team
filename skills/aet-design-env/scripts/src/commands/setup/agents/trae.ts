/**
 * Trae IDE agent — separate-file rule, PreToolUse hook-based permissions
 * via .trae/hooks.json (Trae natively supports the shared hooks format).
 *
 * Architecture (mirrors Spec Kit's trae integration):
 *   - MarkdownIntegration subclass, requires_cli: False (IDE-based)
 *   - .trae/rules/*.md is Trae's native rule file location; rules require
 *     `description` + `alwaysApply` frontmatter to be recognized (mirrors
 *     Cursor's .mdc frontmatter requirement)
 *   - .trae/hooks.json shares the Claude Code hooks format; PreToolUse
 *     is written by applyPermissions(format='trae_hooks') in base-agent.ts
 *
 * Rule file : .trae/rules/aet-design-env.md (separate_file)
 * Perms     : .trae/hooks.json (trae_hooks → PreToolUse exit 2 on deny match)
 */
import { BaseAgent } from '../base-agent';

export default class TraeAgent extends BaseAgent {
  readonly key = 'trae';
  readonly name = 'Trae IDE';
  readonly aliases = ['trae'];

  readonly ruleInjectStrategy = 'separate_file' as const;
  readonly ruleFile = '.trae/rules/aet-design-env.md';
  readonly ensureMdcAlwaysApply = true;

  readonly permissionsTargets = [
    { file: '.trae/hooks.json', format: 'trae_hooks' as const },
  ];
}
