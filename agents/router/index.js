/**
 * AET Router - Entry point that routes to appropriate workflow
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const routerDefinition = {
  name: "aet-router",
  description: "AET entry point - routes users to appropriate workflows based on intent",
  mode: "primary",
  color: "#10B981",
  hidden: true,
  permission: {
    "workflow_*": "allow",
    "checkpoint_*": "allow",
    "agent_handover": "deny",
    "step_handover": "deny",
  },
  prompt: readFileSync(join(__dirname, "prompts", "main.md"), "utf-8"),
};
