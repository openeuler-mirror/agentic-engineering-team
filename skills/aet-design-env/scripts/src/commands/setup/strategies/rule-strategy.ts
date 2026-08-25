/**
 * RuleStrategy — pluggable rule-injection strategy interface.
 *
 * A strategy owns: (1) writing the rule file, (2) linking the rule into the
 * agent's context file (if applicable), and (3) recording all touched files
 * in the manifest (non-uniform: separate_file records ruleFile as
 * PRODUCED/RECOVERED via hash compare + configPath as RECOVERED; inline_tag
 * records targetFile as RECOVERED).
 *
 * The orchestrator (BaseAgent.setup) just looks up the strategy by
 * `ruleInjectStrategy` key and calls apply(); it does not perform any
 * manifest recording for rules — that is the strategy's responsibility.
 */
import type { RuleInjectStrategy } from '../base-agent';
import type { SetupManifest } from '../manifest';

export interface RuleStrategyContext {
  cwd: string;
  /** Full rule text from agents.json (config.rule.content). */
  ruleContent: string;
  /** Relative path to the rule file (separate_file only). */
  ruleFile?: string;
  /** Relative path to the user-owned context file (separate_file only). */
  ruleConfigPath?: string;
  /** Import-line template with `{rule_file}` placeholder (separate_file only). */
  ruleConfigInject?: string;
  /** Ensure .mdc frontmatter has alwaysApply:true (Cursor, separate_file only). */
  ensureMdcAlwaysApply?: boolean;
  /** Relative path to the target file (inline_tag only). */
  targetFile?: string;
  /** XML tag name for inline_tag wrapping (inline_tag only). */
  tag?: string;
}

export interface RuleStrategyResult {
  rule: 'written' | 'unchanged' | 'recovered' | 'skipped';
  /** Absolute path of the rule/target file (for display). */
  ruleFile?: string;
  config: 'updated' | 'linked' | 'skipped' | 'unchanged';
  /** Absolute path of the context/config file (for display). */
  configPath?: string;
}

export interface RuleStrategy {
  readonly key: RuleInjectStrategy;
  apply(ctx: RuleStrategyContext, manifest: SetupManifest): RuleStrategyResult;
}
