/**
 * AET Design Agent Definition
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const designDefinition = {
  name: "aet-design",
  description: "Design phase Agent - responsible for requirements analysis and design document creation",
  mode: "primary",
  hidden: true,
  permission: {
    "workflow_*": "allow",
    "checkpoint_*": "allow",
    "agent_handover": "allow",
    "step_handover": "allow",
  },
  prompt: readFileSync(join(__dirname, "prompts", "main.md"), "utf-8"),
};
