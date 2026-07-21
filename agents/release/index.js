/**
 * AET Release - Entry point for release management workflows
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const releaseDefinition = {
  name: "aet-release",
  description: "Release管理入口 - 处理所有release相关操作（创建/删除/查询/上传/下载/完整发布流程）",
  mode: "primary",
  hidden: true,
  color: "#10B981",
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