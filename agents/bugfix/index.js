/**
 * AET Bugfix Agent - Handles bug diagnosis, fix planning, implementation, and delivery
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const bugfixDefinition = {
  name: "aet-bugfix",
  description: "Bugfix Agent - responsible for bug diagnosis, fix planning, implementation, validation, and PR submission",
  mode: "primary",
  hidden: true,
  permission: {
    "workflow_*": "deny",
    "checkpoint_*": "allow",
    "agent_handover": "allow",
    "step_handover": "allow",
  },
  prompt: readFileSync(join(__dirname, "prompts", "main.md"), "utf-8"),
};