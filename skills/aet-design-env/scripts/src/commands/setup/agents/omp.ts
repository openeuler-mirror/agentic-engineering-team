/**
 * Oh My Pi (omp) CLI agent — inline-tag rule on AGENTS.md, hook-based
 * permissions via .omp/hooks/pre/aet-design-env.ts.
 *
 * Architecture (mirrors Spec Kit's OmpIntegration):
 *   - MarkdownIntegration subclass, requires_cli: True
 *   - folder: .omp/, commands_subdir: commands (we don't ship commands here)
 *   - install_url: https://www.npmjs.com/package/@oh-my-pi/pi-coding-agent
 *   - AGENTS.md is omp's native context file (per Spec Kit's
 *     agent-context-defaults.json: "omp" → "AGENTS.md")
 *   - omp natively discovers .ts hooks from .omp/hooks/pre/*.ts
 *
 * Rule file : AGENTS.md (inline_tag — omp reads AGENTS.md natively alongside
 *             other agents like codex/pi, so we share the user-owned file
 *             via the 4-way stitch between <aet-design-env-rule>...</...>)
 * Perms     : .omp/hooks/pre/aet-design-env.ts (omp_hooks → pi.on("tool_call")
 *             returns { block: true, reason } on deny pattern match)
 */
import { BaseAgent } from '../base-agent';

export default class OmpAgent extends BaseAgent {
  readonly key = 'omp';
  readonly name = 'Oh My Pi';
  readonly aliases = ['omp'];

  readonly ruleInjectStrategy = 'inline_tag' as const;
  readonly targetFile = 'AGENTS.md';
  readonly tag = 'aet-design-env-rule';
  readonly permissionsTargets = [
    { file: '.omp/hooks/pre/aet-design-env.ts', format: 'omp_hooks' as const },
  ];
}
