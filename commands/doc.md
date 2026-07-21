---
description: 文档生成统一入口 - 智能识别用户需求并路由到对应的文档生成 skill（README、用户手册、技术分析、幻灯片、信息图、实践案例）
agent: aet-doc
---

Start a document generation workflow by invoking the aet-doc agent.

The doc agent will analyze your intent and route to the appropriate document generation skill:

**Supported Document Types:**
- **README Documentation**: Generate comprehensive README.md and README_zh.md for the repository
- **User Manual**: Generate installation guides, feature usage tutorials, troubleshooting guides
- **Technical Analysis**: Generate in-depth technical analysis documents for key features
- **HTML Slides**: Create interactive HTML slides from documents
- **Tech Infographic**: Generate "One-picture to understand XXX" tech infographics
- **Practice Case**: Generate project examples, tutorials, and demo guides

**Usage Examples:**
- `/aet-doc 生成 README` - Generate README documentation
- `/aet-doc 生成用户手册` - Generate user manual
- `/aet-doc 生成技术分析` - Generate technical analysis document
- `/aet-doc 生成幻灯片` - Generate HTML slides
- `/aet-doc 生成信息图` - Generate tech infographic
- `/aet-doc 生成实践案例` - Generate practice case
- `/aet-doc 根据 https://atomgit.com/.../issues/123 生成手册` - Generate manual from Issue content
- `/aet-doc 生成 README 和用户手册` - Generate multiple documents

Simply describe what document you want to generate, and the agent will route to the appropriate skill.