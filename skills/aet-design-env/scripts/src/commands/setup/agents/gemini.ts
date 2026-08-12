/**
 * Gemini CLI agent — inline-tag rule (GEMINI.md), BeforeTool hook permissions.
 *
 * Architecture (mirrors Spec Kit's GeminiIntegration):
 *   - TomlIntegration subclass, requires_cli: True (key matches `gemini`)
 *   - GEMINI.md is Gemini's native context file (no bridge needed)
 *
 * Rule file : GEMINI.md (inline_tag — user-owned, never deleted)
 * Perms     : gemini_hooks → .gemini/settings.json (BeforeTool, exit 2)
 */
import { BaseAgent, PermissionsTarget } from '../base-agent';

export default class GeminiAgent extends BaseAgent {
  readonly key = 'gemini';
  readonly name = 'Gemini CLI';
  readonly aliases = ['geminicli', 'gemini'];

  readonly ruleInjectStrategy = 'inline_tag' as const;
  readonly targetFile = 'GEMINI.md';
  readonly tag = 'aet-design-env-rule';

  readonly permissionsTargets: PermissionsTarget[] = [
    { file: '.gemini/settings.json', format: 'gemini_hooks' },
  ];
}
