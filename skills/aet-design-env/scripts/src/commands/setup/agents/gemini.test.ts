import { runBaseAgentTests } from '../base-agent-tests';
import GeminiAgent from './gemini';

runBaseAgentTests(() => new GeminiAgent());
