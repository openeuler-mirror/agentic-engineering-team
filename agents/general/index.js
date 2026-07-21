/**
 * AET General Agent Definition - Universal task executor
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const generalDefinition = {
  name: "aet-general",
  description: "General-purpose agent for executing various tasks like project analysis, configuration, and other utility workflows",
  mode: "all",
  hidden: true,
  permission: {
    "workflow_*": "deny",
    "checkpoint_*": "allow",
    "agent_handover": "allow",
    "step_handover": "allow",
  },
  prompt: readFileSync(join(__dirname, "prompts", "main.md"), "utf-8"),
};