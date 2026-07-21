/**
 * AET Doc - Entry point for document generation workflows
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const docDefinition = {
  name: "aet-doc",
  description: "文档生成统一路由入口 - 智能识别用户需求并路由到对应的文档生成 skill",
  mode: "primary",
  hidden: true,
  color: "#F59E0B",
  permission: {
    "workflow_*": "deny",
    "checkpoint_*": "deny",
    "skill": "allow",
    "question": "allow",
    "step_handover": "deny",
    "agent_handover": "deny",
  },
  prompt: readFileSync(join(__dirname, "prompts", "main.md"), "utf-8"),
};