/**
 * OpenCode agent — separate-file rule + AGENTS.md @import + opencode.json perms.
 *
 * Architecture (mirrors Spec Kit's opencode integration):
 *   - MarkdownIntegration subclass, requires_cli: False (IDE-based)
 *   - AGENTS.md is opencode's native context file (no bridge needed)
 *
 * Rule file : .opencode/agents/aet-design-env.md (separate_file)
 * Config    : AGENTS.md (append `@<rule_file>` import line — opencode's
 *             native import syntax)
 * Perms     : opencode.json permission.read/edit/grep (per-pattern "deny";
 */
import { BaseAgent } from '../base-agent';

export default class OpenCodeAgent extends BaseAgent {
  readonly key = 'opencode';
  readonly name = 'OpenCode';
  readonly aliases = ['opencode'];

  readonly ruleInjectStrategy = 'separate_file' as const;
  readonly ruleFile = '.opencode/agents/aet-design-env.md';
  readonly ruleConfigPath = 'AGENTS.md';
  readonly ruleConfigInject = '@{rule_file}';
  readonly permissionsTargets = [
    { file: 'opencode.json', format: 'opencode_json' as const },
  ];
}
