/**
 * Per-agent test file — minimal, inherits all acceptance tests from
 * `runBaseAgentTests`. Adding a new agent = copy this file + change import.
 *
 * Architecture (mirrors Spec Kit's `tests/integrations/test_integration_<key>.py`,
 * which sets 4 class attrs then inherits from MarkdownIntegrationTests).
 */
import { runBaseAgentTests } from '../base-agent-tests';
import ClaudeAgent from './claude';

runBaseAgentTests(() => new ClaudeAgent());
