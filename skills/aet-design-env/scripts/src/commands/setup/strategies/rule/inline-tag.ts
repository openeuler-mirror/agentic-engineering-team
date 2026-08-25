/**
 * InlineTagRuleStrategy — injects the rule into the target file wrapped in
 * <tag>...</tag> markers. Idempotent via 4-way marker logic.
 *
 * Ported from base-agent.ts setup() inline_tag branch (was lines 601-617)
 * + stitchTaggedSection helper (was lines 89-130) + injectRuleInlineTag
 * (was lines 133-144). Behavior preserved byte-for-byte; the strategy now
 * owns its own manifest recording (target file always RECOVERED).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { RuleStrategy, RuleStrategyContext, RuleStrategyResult } from '../rule-strategy';
import { SetupManifest } from '../../manifest';
import { assertSafeRelativePath } from '../../path-safe';
import { readFileText, writeFileText } from '../../../../util';
import { ensureParentDir } from '../shared';

export class InlineTagRuleStrategy implements RuleStrategy {
  readonly key = 'inline_tag' as const;

  apply(ctx: RuleStrategyContext, manifest: SetupManifest): RuleStrategyResult {
    const result: RuleStrategyResult = { rule: 'skipped', config: 'skipped' };
    if (!ctx.targetFile || !ctx.tag) return result;

    assertSafeRelativePath(ctx.targetFile, ctx.cwd);
    const target = join(ctx.cwd, ctx.targetFile);

    const r = injectRuleInlineTag(target, ctx.tag, ctx.ruleContent);
    result.rule = r;
    result.ruleFile = target;
    if (existsSync(target) && !manifest.isRecovered(ctx.targetFile)) {
      manifest.recordExisting(ctx.targetFile, true);
    }

    return result;
  }
}

/** Inject rule into targetPath using <tag>...</tag> wrapping. Idempotent. */
function injectRuleInlineTag(
  targetPath: string,
  tag: string,
  content: string,
): 'written' | 'unchanged' {
  const existing = readFileText(targetPath);
  const { content: newContent, changed } = stitchTaggedSection(existing, tag, content);
  if (!changed) return 'unchanged';
  ensureParentDir(targetPath);
  writeFileText(targetPath, newContent);
  return 'written';
}

/**
 * Marker-based 4-way idempotent replace. Wraps `content` in <tag>...</tag>
 * and stitches it into `existing` per Spec Kit's update-agent-context.sh
 * 4-way logic (adapted to XML tags instead of HTML comments):
 *   - both open and close found (close > open): replace from open through
 *     end-of-close with the new section
 *   - only open found: truncate after open, append section
 *   - only close found: prepend section, skip past close marker
 *   - neither found: append section with separator
 *
 * Safety note: all tag matching uses `String.indexOf` (substring search),
 * NOT regex. So regex metacharacters in the tag name (`.` `+` `*` etc.)
 * have no special meaning and cannot cause undefined behavior. The tag
 * comes from config/agents.json (`rule.tag = "aet-design-env-rule"`),
 * which is a safe identifier, but even if a user supplied a tag like
 * `foo.bar+baz`, indexOf would match it literally.
 */
function stitchTaggedSection(
  existing: string,
  tag: string,
  section: string,
): { content: string; changed: boolean } {
  const openTag = `<${tag}>`;
  const closeTag = `</${tag}>`;
  const wrapped = `${openTag}\n${section}\n${closeTag}`;

  if (!existing) {
    return { content: `${wrapped}\n`, changed: true };
  }

  const text = existing.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const openIdx = text.indexOf(openTag);
  const closeIdx = openIdx === -1 ? -1 : text.indexOf(closeTag, openIdx + openTag.length);
  const orphanCloseIdx = openIdx === -1 ? text.indexOf(closeTag) : -1;

  if (openIdx !== -1 && closeIdx !== -1 && closeIdx > openIdx) {
    const before = text.slice(0, openIdx);
    const after = text.slice(closeIdx + closeTag.length);
    const newContent = `${before}${wrapped}${after}`;
    return { content: newContent, changed: newContent !== existing };
  }

  if (openIdx !== -1 && closeIdx === -1) {
    const before = text.slice(0, openIdx);
    return { content: `${before}${wrapped}\n`, changed: true };
  }

  if (openIdx === -1 && orphanCloseIdx !== -1) {
    const after = text.slice(orphanCloseIdx + closeTag.length);
    return { content: `${wrapped}\n${after.replace(/^\n+/, '')}`, changed: true };
  }

  const sep = text.endsWith('\n') ? '\n' : '\n\n';
  return { content: `${text}${sep}${wrapped}\n`, changed: true };
}
