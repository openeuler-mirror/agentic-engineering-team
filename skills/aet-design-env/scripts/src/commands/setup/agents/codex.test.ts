import { runBaseAgentTests } from '../base-agent-tests';
import CodexAgent from './codex';

runBaseAgentTests(() => new CodexAgent());
