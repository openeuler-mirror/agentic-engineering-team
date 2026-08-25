/**
 * SeparateFileRuleStrategy — writes the rule as a standalone file and links
 * it into the agent's context file via an @import line.
 *
 * Ported from base-agent.ts setup() separate_file branch (was lines 551-600)
 * + ensureMdcFrontmatter helper (was lines 150-161). Behavior preserved
 * byte-for-byte; the strategy now owns its own manifest recording.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RuleStrategy, RuleStrategyContext, RuleStrategyResult } from '../rule-strategy';
import { SetupManifest, sha256 } from '../../manifest';
import { assertSafeRelativePath } from '../../path-safe';
import { readFileText, writeFileText } from '../../../../util';
import { ensureParentDir } from '../shared';

export class SeparateFileRuleStrategy implements RuleStrategy {
  readonly key = 'separate_file' as const;

  apply(ctx: RuleStrategyContext, manifest: SetupManifest): RuleStrategyResult {
    const result: RuleStrategyResult = { rule: 'skipped', config: 'skipped' };
    if (!ctx.ruleFile) return result;

    assertSafeRelativePath(ctx.ruleFile, ctx.cwd);
    const ruleFile = join(ctx.cwd, ctx.ruleFile);
    const cfgFile = ctx.ruleConfigPath
      ? (assertSafeRelativePath(ctx.ruleConfigPath, ctx.cwd), join(ctx.cwd, ctx.ruleConfigPath))
      : undefined;

    const newRuleContent = ctx.ensureMdcAlwaysApply
      ? ensureMdcFrontmatter(ctx.ruleContent)
      : ctx.ruleContent;

    if (existsSync(ruleFile)) {
      const tracked = manifest.files[ctx.ruleFile];
      const onDisk = sha256(readFileSync(ruleFile));
      if (!tracked || tracked !== onDisk) {
        manifest.recordExisting(ctx.ruleFile, true);
        result.rule = 'recovered';
      } else {
        manifest.recordExisting(ctx.ruleFile, false);
        result.rule = 'unchanged';
      }
    } else {
      ensureParentDir(ruleFile);
      writeFileText(ruleFile, newRuleContent);
      manifest.recordFile(ctx.ruleFile, newRuleContent);
      result.rule = 'written';
    }
    result.ruleFile = ruleFile;

    if (cfgFile && ctx.ruleConfigInject) {
      const injectLine = ctx.ruleConfigInject.replace('{rule_file}', ctx.ruleFile);
      const existingCfg = readFileText(cfgFile);
      if (existingCfg.includes(injectLine)) {
        result.config = 'linked';
      } else {
        const newCfg = existingCfg
          ? existingCfg.replace(/\s*$/, '\n') + injectLine + '\n'
          : injectLine + '\n';
        ensureParentDir(cfgFile);
        writeFileText(cfgFile, newCfg);
        result.config = 'updated';
      }
      if (existsSync(cfgFile) && !manifest.isRecovered(ctx.ruleConfigPath!)) {
        manifest.recordExisting(ctx.ruleConfigPath!, true);
      }
      result.configPath = cfgFile;
    }

    return result;
  }
}

/** Ensure a .mdc (Cursor rule file) has YAML frontmatter with alwaysApply:true. */
function ensureMdcFrontmatter(content: string): string {
  const fmRegex = /^---\n([\s\S]*?)\n---\n?/;
  const match = content.match(fmRegex);
  if (!match) {
    return `---\nalwaysApply: true\n---\n\n${content.replace(/^\n+/, '')}`;
  }
  const rawFm = match[1];
  if (/^alwaysApply:\s*true\s*$/m.test(rawFm)) {
    return content;
  }
  return `---\nalwaysApply: true\n${rawFm}\n---\n${content.slice(match[0].length)}`;
}
