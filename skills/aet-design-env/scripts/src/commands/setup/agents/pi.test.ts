import { runBaseAgentTests } from '../base-agent-tests';
import PiAgent from './pi';

runBaseAgentTests(() => new PiAgent());
