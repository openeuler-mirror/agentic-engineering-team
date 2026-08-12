/**
 * Pi Coding Agent — inline-tag rule on AGENTS.md, no perms.
 *
 * Architecture (mirrors Spec Kit's PiIntegration):
 *   - MarkdownIntegration subclass, requires_cli: True
 *   - folder: .pi/, commands_subdir: prompts (we don't ship prompts here)
 *   - install_url: https://www.npmjs.com/package/@earendil-works/pi-coding-agent
 *   - AGENTS.md is pi's native context file (per Spec Kit's
 *     agent-context-defaults.json: "pi" → "AGENTS.md")
 *
 * Rule file : AGENTS.md (inline_tag — pi reads AGENTS.md natively alongside
 *             other agents like codex/omp, so we share the user-owned file
 *             via the 4-way stitch between <aet-design-env-rule>...</...>)
 * Perms     : none (Spec Kit declares no native deny mechanism for pi;
 *             permission granting happens via SPECKIT_INTEGRATION_PI_EXTRA_ARGS
 *             at CLI dispatch, not file/folder deny rules)
 */
import { BaseAgent } from '../base-agent';

export default class PiAgent extends BaseAgent {
  readonly key = 'pi';
  readonly name = 'Pi Coding Agent';
  readonly aliases = ['pi'];

  readonly ruleInjectStrategy = 'inline_tag' as const;
  readonly targetFile = 'AGENTS.md';
  readonly tag = 'aet-design-env-rule';
}
