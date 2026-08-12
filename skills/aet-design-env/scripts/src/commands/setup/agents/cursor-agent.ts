/**
 * Cursor IDE agent — separate-file rule (.mdc with alwaysApply frontmatter)
 * + .cursor/cli.json native permission denies.
 *
 * Architecture (mirrors Spec Kit's CursorAgentIntegration):
 *   - Key is `cursor-agent` (CLI executable name when shipped as a CLI; for
 *     IDE-only use the canonical identifier — Spec Kit uses cursor-agent
 *     since Cursor's CLI ships as `cursor-agent`)
 *   - .mdc rules need `alwaysApply: true` frontmatter to auto-load
 *   - Uses Cursor CLI's native `permissions.deny` in .cursor/cli.json
 *     (Read/Write tool entries with glob patterns)
 *
 * Rule file : .cursor/rules/aet-design-env.mdc (separate_file, mdc frontmatter)
 * Perms     : .cursor/cli.json (cursor_settings — native deny array)
 */
import { BaseAgent, PermissionsTarget } from '../base-agent';

export default class CursorAgent extends BaseAgent {
  readonly key = 'cursor-agent';
  readonly name = 'Cursor IDE';
  readonly aliases = ['cursor', 'cursor-agent'];

  readonly ruleInjectStrategy = 'separate_file' as const;
  readonly ruleFile = '.cursor/rules/aet-design-env.mdc';
  readonly ensureMdcAlwaysApply = true;
  readonly permissionsTargets: PermissionsTarget[] = [
    { file: '.cursor/cli.json', format: 'cursor_settings' },
  ];
}
