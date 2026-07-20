---
description: Release管理入口 - 处理所有release相关操作（创建/删除/查询/上传/下载/完整发布流程）
agent: aet-release
---

Invoke the aet-release agent to handle all release-related operations.

The agent will analyze user input and route to appropriate operation:

## Atomic Operations (Direct Execution)
- **Create Release**: "创建release v1.0.0", "create release v1.2.0"
- **Delete Release**: "删除release v1.1.0", "delete release 123"
- **Query Release**: "查询release v1.0.0", "get release", "latest release"
- **List Releases**: "列出所有release", "list releases"
- **Upload Asset**: "上传附件", "get upload url"
- **Download Asset**: "下载附件", "download asset"

## Full Release Workflow (Guided Process)
When user wants to publish a new version without specifying details:
- Keywords: "发布新版本", "我要发布", "release新版本"
- The agent will guide through: Change Detection → Version Generation → Release Notes → Create Release

Simply describe what you want to do, the agent will understand and execute.