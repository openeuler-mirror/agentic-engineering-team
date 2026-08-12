/**
 * Strategy registry — single source of truth for rule-injection strategies
 * and permission writers. Mirrors the AGENT_REGISTRY pattern in registry.ts:
 *   - registerBuiltinStrategies() instantiates each class once at module load.
 *   - _resetStrategiesForTest() clears for test isolation.
 *   - Adding a new rule strategy = 1 file + 1 registerRuleStrategy() call.
 *   - Adding a new permission writer = 1 file + 1 registerPermissionWriter().
 */
import type { RuleInjectStrategy, PermissionsFormat } from '../base-agent';
import type { RuleStrategy } from './rule-strategy';
import type { PermissionWriter } from './permission-writer';
import { SeparateFileRuleStrategy } from './rule/separate-file';
import { InlineTagRuleStrategy } from './rule/inline-tag';
import { ClaudeSettingsWriter } from './permission/claude-settings';
import { CursorSettingsWriter } from './permission/cursor-settings';
import { OpencodeJsonWriter } from './permission/opencode-json';
import { CursorIgnoreWriter } from './permission/text-ignore';
import { CodexHooksWriter } from './permission/codex-hooks';
import { TraeHooksWriter } from './permission/trae-hooks';
import { GeminiHooksWriter } from './permission/gemini-hooks';
import { OmpHooksWriter } from './permission/omp-hooks';
import { NoneWriter } from './permission/none';

export { type RuleStrategy, type RuleStrategyContext, type RuleStrategyResult } from './rule-strategy';
export { type PermissionWriter, type PermissionWriterContext, type PermissionWriterResult } from './permission-writer';
export { ensureParentDir } from './shared';

export const RULE_STRATEGY_REGISTRY = new Map<RuleInjectStrategy, RuleStrategy>();
export const PERMISSION_WRITER_REGISTRY = new Map<PermissionsFormat, PermissionWriter>();

// ⚠️ MODULE-LEVEL MUTABLE STATE (test discipline required)
// `_builtinsRegistered` is a singleton guard that ensures built-in rule
// strategies + permission writers are registered at most once per process.
// Tests that re-run setup (or swap strategies) MUST call
// `_resetStrategiesForTest()` in beforeEach to clear both registries +
// reset this flag. base-agent-tests.ts:60 already does this.
let _builtinsRegistered = false;

export function registerRuleStrategy(strategy: RuleStrategy): void {
  if (!strategy.key) throw new Error('RuleStrategy key must be non-empty');
  if (RULE_STRATEGY_REGISTRY.has(strategy.key)) {
    throw new Error(`RuleStrategy '${strategy.key}' already registered`);
  }
  RULE_STRATEGY_REGISTRY.set(strategy.key, strategy);
}

export function registerPermissionWriter(writer: PermissionWriter): void {
  if (!writer.format) throw new Error('PermissionWriter format must be non-empty');
  if (PERMISSION_WRITER_REGISTRY.has(writer.format)) {
    throw new Error(`PermissionWriter '${writer.format}' already registered`);
  }
  PERMISSION_WRITER_REGISTRY.set(writer.format, writer);
}

export function registerBuiltinStrategies(): void {
  if (_builtinsRegistered) return;
  registerRuleStrategy(new SeparateFileRuleStrategy());
  registerRuleStrategy(new InlineTagRuleStrategy());
  registerPermissionWriter(new ClaudeSettingsWriter());
  registerPermissionWriter(new CursorSettingsWriter());
  registerPermissionWriter(new OpencodeJsonWriter());
  registerPermissionWriter(new CursorIgnoreWriter());
  registerPermissionWriter(new CodexHooksWriter());
  registerPermissionWriter(new TraeHooksWriter());
  registerPermissionWriter(new GeminiHooksWriter());
  registerPermissionWriter(new OmpHooksWriter());
  registerPermissionWriter(new NoneWriter());
  _builtinsRegistered = true;
}

export function _resetStrategiesForTest(): void {
  RULE_STRATEGY_REGISTRY.clear();
  PERMISSION_WRITER_REGISTRY.clear();
  _builtinsRegistered = false;
}

registerBuiltinStrategies();
