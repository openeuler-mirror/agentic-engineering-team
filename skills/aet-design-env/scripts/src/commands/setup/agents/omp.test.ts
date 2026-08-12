import { runBaseAgentTests } from '../base-agent-tests';
import OmpAgent from './omp';

runBaseAgentTests(() => new OmpAgent());
