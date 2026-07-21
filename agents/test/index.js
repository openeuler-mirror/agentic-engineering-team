/**
 * AET Test Agent Definition
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const testDefinition = {
  name: "aet-test",
  description: "Test phase Agent - responsible for testing implementation meets design requirements",
  mode: "primary",
  hidden: true,
  permission: {
    "workflow_*": "deny",
    "checkpoint_*": "deny",
    "agent_handover": "allow",
    "step_handover": "allow",
  },
  prompt: readFileSync(join(__dirname, "prompts", "main.md"), "utf-8"),
};
