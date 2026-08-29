# Q&A

> 文档版本：v1.0 | 更新日期：2026-08-20

本文档汇总 AET 常见问题，按平台概念、架构、安装、命令、核心机制、工作流、故障排查分类解答。

## 1. 平台概览与核心概念

### Q1. AET 是什么？它解决了 AI 辅助研发的哪些普遍问题？

AET (Agentic Engineering Team) 是全流程 AI 辅助研发底座/引擎，通过多个专用 AI 智能体有序协作覆盖软件研发全生命周期（规划、设计、编码、构建、测试、发布与部署、运维、资料）。它解决三个普遍问题：

1. **长程任务失败率高** — 超过 4–8 小时的 AI 研发任务失败率超过 50%，重试需从头开始，大量消耗计算资源。
2. **单智能体能力局限** — 现有 AI 编码工具大多服务于"单兵作战"，无法理解架构师、开发、测试、产品等角色的协作边界与工件传递要求。
3. **研发流程不兼容** — 开源项目开发流程各异，现有框架缺乏灵活的检查点和交付件模板配置。

AET 通过多智能体编排、断点恢复和可配置工作流解决上述问题。

### Q2. AET 提供了哪些核心功能特性？

8 项核心特性：

- **多智能体协作** — 8 个专用智能体（Router、Design、Implement、Test、Bugfix、Doc、Release、General）按序执行，覆盖从需求认领到 PR 提交的完整流程。
- **规格驱动开发 (SDD)** — 将功能树、DFx 设计、架构原则等最佳实践编码为不可篡改的基准上下文。
- **四层分层架构** — 命令层 → 编排 Skill 层 → Agent 层 → 原子 Skill 层，各层职责清晰。
- **围栏模块保护 (Fence)** — 文件划分为允许/禁止/条件修改三类，三个保护点反复校验。
- **可配置工作流** — JSON 三级配置（全局模板、项目模板、项目配置）支持团队适配不同流程。
- **断点恢复 (Checkpoint)** — 任务快照记录各阶段完整状态，长程任务中断后从最新断点恢复。
- **原子技能** — 模块化 Skill 体系（35+），采用渐进式披露模式按需展示复杂度。
- **自动化版本发布** — 检测上次 Release 后的代码变更，分析 commit 类型推断版本号（major/minor/patch）。

### Q3. AET 中的 Agent 和 Skill 有什么区别？

- **Agent（智能体）** — 专门负责开发流程特定阶段的 AI 助手。AET 预置 8 个 Agent：Router、PRD、Design、Implement、Test、Bugfix、Doc、Release，每个 Agent 有独立的系统提示词，针对其阶段优化。
- **Skill（技能）** — AET 的核心功能单元，分三个层级：
  - 命令 Skill — 用户入口，通过斜杠命令触发（如 `/aet-init`、`/aet-auto`、`/aet-bugfix`）
  - 编排 Skill — 协调子流程，组合多个 Skill（如 `aet-operating-pr`、`aet-reviewing-code`）
  - 原子 Skill — 执行单一职责，最小功能单元（如 `aet-analyzing-project`、`test-driven-development`）

一个 Agent 可调用多个 Skill。

### Q4. AET 支持哪些代码托管平台？通过什么机制统一接入？

AET 主运行平台为 **OpenCode**，通过插件 `.opencode/plugins/aet.js` 集成。代码仓库平台支持：**GitHub、GitLab、GitCode**，所有平台 API 操作通过统一的 `platform-api.js` 接口处理，一套代码支持多平台。具体平台类型在项目配置中通过 `codePlatform.platform.type` 字段指定。

### Q5. AET 的设计目标是什么？

5 个设计目标：

1. **极简协作** — 人与 AI 协作，极简完成从需求到实现的完整流程。
2. **结构化流程** — 通过精心设计的工作流，保证开发质量和可追溯性。
3. **断点恢复** — 基于 Checkpoint 快照机制，支持任务中断后继续执行。
4. **OpenCode 平台支持** — 作为插件集成到 OpenCode 运行时。
5. **多平台代码仓库支持** — 通过 `codePlatform` 配置，支持 GitCode、GitHub、GitLab、Gitee、AtomGit。

### Q6. AET 工作流中的 Scenario、Workflow、Hook、Step、Task 分别指什么？

- **Scenario（场景）** — 不同类型的开发流程，如 `feature`（功能开发）、`bugfix`（Bug 修复）、`release`（版本发布）。scenario 可声明 `automation: true` 启用无人值守模式。
- **Workflow（工作流）** — Agent 之间的协作流程定义，由多个 Agent 顺序执行，每个 Agent 前后可配置 Hook。
- **Hook（钩子）** — 控制 Agent 执行流程的机制。`auto` 自动进入下一阶段，`confirm` 需要用户确认。`automation: true` 模式下 `confirm` 自动短路为 `auto` 行为。
- **Step（步骤）** — Agent 内部的细粒度工作单元。每个 Agent 可包含多个 Step。
- **Task（任务）** — 实现计划中的细粒度开发工作任务。

---

## 2. 架构与智能体

### Q7. AET 采用什么样的分层架构？依赖方向是什么？

AET 采用四层分层架构，依赖方向**严格自上而下**：

1. **用户命令层** — 9 个斜杠命令（`/aet-init`、`/aet-auto`、`/aet-bugfix` 等）
2. **编排 Skill 层** — 协调子流程（如 `aet-operating-pr`、`aet-reviewing-code`）
3. **Agent 层** — 领域专用智能体（Router → Design → Implement → Test → Bugfix → Doc → Release）
4. **原子 Skill 层** — 单一职责的最小功能单元

各层职责清晰、可独立扩展。阶段产物（设计文档、开发计划、验证报告）以 Markdown 固化，直接作为下一阶段的输入上下文，消除角色间沟通成本。

### Q8. AET 预置了哪些 Agent？它们的职责分别是什么？

8 个预置 Agent：

- **Aet-Router** — 核心协调者，理解需求、认领 Feature、路由工作流、管理 Checkpoint
- **Aet-Design** — 设计智能体，需求分析 (RAS)、需求设计 (RDS)
- **Aet-Implement** — 实现智能体，开发计划 (DPS)、TDD 驱动开发、代码实现、功能验证
- **Aet-Test** — 测试智能体（待扩展），集成测试、性能测试
- **Aet-Bugfix** — 修复智能体，Bug 诊断、修复规划
- **Aet-Doc** — 文档生成（README、用户手册、技术分析等 12 种类型）
- **Aet-Release** — Release 管理，版本发布、Release Notes 生成
- **Aet-General** — 通用智能体，通用任务执行

Agent 定义文件位于 `agents/{agent-name}/index.js`，系统提示词位于 `agents/{agent-name}/prompts/main.md`。

### Q9. Aet-Router 在多 Agent 协作流程中的位置和职责是什么？

Aet-Router 是智能体开发团队的核心协调者，位于协作流程入口。功能包括：

- 理解用户需求，分析用户想要完成的任务
- 认领 Feature，创建特性分支，更新 Issue 状态
- 路由到合适的工作流（设计-实现、Bug 修复等）
- Checkpoint 检测和管理
- 协调多阶段开发工作流执行

工作流协调顺序为：设计阶段 → 实现阶段 → 验证阶段 → 完成阶段。当检测到 `.aet/checkpoint/` 中已有 Checkpoint 时，会询问用户继续还是重新开始。

### Q10. Aet-Design 智能体的执行步骤和产物是什么？

Aet-Design 负责将需求转化为详细设计文档，按 5 步顺序执行：

1. 需求分析 → 输出 RAS 文档（Requirements Analysis Specification，含需求背景、目标、范围、详细需求）
2. 需求评审（通过/不通过）
3. 需求设计 → 输出 RDS 文档（Requirements Design Specification，含模块划分、接口设计、DFX 策略、SR-AR 分解）
4. 需求设计评审（通过/不通过）
5. 提交文档（Git 提交）

两份核心文档：RAS 由 Aet-Design 在设计阶段生成；RDS 同样在设计阶段生成，用于指导实现阶段。

### Q11. Aet-Implement 智能体的执行流程是什么？TDD 铁律是什么？

Aet-Implement 按顺序执行 5 步：

1. 开发计划 → 输出 DPS 文档（含开发任务分解、围栏配置、具体实现步骤）
2. 计划评审（通过/不通过）
3. TDD 开发 → 测试代码 + 实现代码
4. 功能验证 → 验证报告
5. 提示提交 PR → 提示用户执行 `/aet-pr`

对每个任务执行 TDD 循环：编写失败测试 → 验证测试失败 → 编写最简代码通过测试 → 验证测试通过 → 提交代码。功能验证时检查所有必需功能是否已实现、验证接口是否符合设计、将每个需求映射到实现代码、生成验证报告。

**TDD 铁律**：`NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST`（没有失败测试就不写生产代码）。

### Q12. AET 的三个设计原则是什么？

1. **跨平台兼容性** — Agent 的 system prompt 存储在 Skill 的 references 中，通过自然语言指导模型使用子 Agent，不受限于特定平台规范，使 AET 可在 OpenCode 平台运行。
2. **渐进式披露** — Skill 描述简洁明了，从简单开始，需要时再增加复杂度。核心包含 "When to use" 和 "Workflow" 两部分。
3. **错误沉淀** — 平台 API 交互封装为脚本，遇到错误时总结经验并沉淀到脚本中，通过错误信息反馈给模型，减少模型上下文负担。

### Q13. Skill 分为哪三个层级？如何调用？

三层级：

- **命令 Skill** — 用户入口，通过斜杠命令触发（如 `/aet-init`、`/aet-auto`）
- **编排 Skill** — 协调子流程，组合多个 Skill（如 `aet-operating-pr`、`aet-reviewing-code`）
- **原子 Skill** — 执行单一职责，最小功能单元（如 `aet-analyzing-project`、`test-driven-development`）

调用方式有两种：

1. **通过命令调用** — 斜杠命令自动触发对应编排 Skill，如 `/aet-pr review` 触发 `aet-reviewing-pr` 编排 Skill。
2. **通过 Skill 工具直接调用** — 在 OpenCode 中直接使用 Skill 工具调用任意 Skill。

### Q14. Aet-Bugfix 智能体的修复流程是什么？输入 CVE 时如何分支？

执行 4 步流程：

1. 问题诊断（使用 `aet-diagnosing-bug` Skill）— 分析错误原因和影响范围
2. 修复规划（使用 `aet-implementing-requirement` Skill）— 生成修复方案
3. TDD 修复（使用 `test-driven-development` Skill）— 先写测试，再修复代码
4. 验证测试 — 确保修复有效

当输入 CVE 标识符（如 `CVE-2026-31431`）时，自动分支到 CVE 研究 + 本地仓库定位流程，产物输出到 `.aet/bugfix/{CVE-ID}/`。

---

## 3. 安装与配置

### Q15. AET 的安装方法有哪些？

3 种方法：

1. **一键安装（推荐）**
   - Linux/macOS: `curl -fsSL https://raw.atomgit.com/openeuler/agentic-engineering-team/raw/master/scripts/install.sh | bash`（或用 `wget`）
   - Windows PowerShell: `iex (irm "https://raw.atomgit.com/openeuler/agentic-engineering-team/raw/master/scripts/install.ps1")`
   - Windows CMD: `curl -fsSL --ssl-no-revoke https://raw.atomgit.com/openeuler/agentic-engineering-team/raw/master/scripts/install.cmd -o %TEMP%\install.cmd && %TEMP%\install.cmd`
2. **AI 助手安装** — 在 OpenCode 会话中告诉 AI「帮我安装 AET」，AI 自动执行一键安装脚本。
3. **源码安装（开发模式）** — `git clone https://atomgit.com/openeuler/agentic-engineering-team.git ~/.config/opencode/aet` 后手动创建符号链接；或在项目目录运行 `./scripts/install.sh --local`（`--local` / `-Local` / `/local` 使用符号链接而非复制，修改源码无需重装）。

### Q16. 一键安装脚本会自动完成哪些步骤？

8 个步骤：

1. 检查系统依赖（git、node、npm）
2. 克隆仓库到 `~/.config/opencode/aet`
3. 创建插件符号链接到 `~/.config/opencode/plugins/aet.js`
4. 复制 skills 到 `~/.config/opencode/skills/aet`
5. 创建命令符号链接到 `~/.config/opencode/commands/`
6. 安装 npm 依赖（`@opencode-ai/plugin`）
7. 安装 graphify（可选，项目分析工具）
8. 交互式配置平台 Token（可选）

Token 配置可选 — 未配置 Token 时，`/aet-pr` 和 `/aet-issue` 命令不可用，但核心功能不受影响，后续可通过重新运行安装脚本或编辑 `~/.aet/config.json` 添加。

### Q17. AET 对 Node.js 版本有什么要求？为什么文档和 package.json 不一致？

AET 有两个 Node 版本要求，对应不同运行模式：

- **插件运行环境** — Node.js **>= 14.0.0**，用于运行 AET OpenCode 插件。文档见 `docs/zh/installation.md` 依赖表与 `README.md` 顶部 badge。
- **CLI 运行环境** — Node.js **>= 18.0.0**，对应 `package.json` 的 `engines.node: ">=18.0.0"`。CLI 为 ESM 可执行脚本，零运行时 npm 依赖（见 `src/README.md`）。

如果只使用 OpenCode 插件功能，Node 14+ 即可；如果使用独立 CLI（`aet` 命令），需 Node 18+。

### Q18. AET 的两级配置文件分别是什么？存储什么内容？

两级配置：

- **全局配置 `~/.aet/config.json`** — 存储多平台 Token（GitCode/GitHub/GitLab），含 API 基础 URL，支持环境变量引用（如 `${GITHUB_TOKEN}`）。配置模板参考 `scripts/templates/global-config-template.json`。
- **项目配置 `.aet/config.json`** — 由 `/aet-init` 自动生成，顶层结构含 `version`、`codePlatform`（mode/platform/upstream/fork/codebaseSync）、`scenarios`、`hooks`、`agents` 字段。

Token 可选 — 未配置时 `/aet-pr` 和 `/aet-issue` 命令不可用，但核心功能不受影响。项目配置至少执行一次 `/aet-init`，否则依赖平台 API 的命令不可用。

### Q19. 如何升级和卸载 AET？升级会影响已有配置吗？

- **升级** — 重新运行一键安装脚本（`curl ... install.sh | bash`）会自动覆盖安装到最新版本。升级**不会**影响已有的全局配置 `~/.aet/config.json` 和项目配置 `.aet/config.json`。
- **卸载** — 手动删除以下文件：
  ```
  rm -rf ~/.config/opencode/aet
  rm -f ~/.config/opencode/plugins/aet.js
  rm -rf ~/.config/opencode/skills/aet
  rm -f ~/.config/opencode/commands/aet-*.md
  ```
  卸载**不会**删除全局配置 `~/.aet/config.json`，如需清理请手动删除。

### Q20. 如何验证 AET 是否正确安装？

3 条验证命令（检查插件、skills、命令符号链接是否就位）：

```bash
ls -la ~/.config/opencode/plugins/aet.js
ls -la ~/.config/opencode/skills/aet
ls -la ~/.config/opencode/commands/aet-*.md
```

验证通过后，在 OpenCode 中即可使用 AET 的所有命令。

### Q21. 如何在 xiaoO 平台使用 AET？

前置条件：xiaoO 已安装（`xiaoo-daemon` 命令可用）。安装时运行一键脚本，平台选择时输入 `2`（xiaoO）。脚本依次完成：

1. 创建符号链接 `~/.xiaoo/aet` → AET 源码目录
2. 注册 Hooker 插件到 `~/.config/xiaoo/config.toml`
3. 链接 9 个命令文件到 `~/.xiaoo/commands/`
4. 链接 12 个工具文件到 `~/.xiaoo/tools/`
5. 链接 3 个 xiaoO 专用 JS 文件
6. 链接 42 个 Skills 到 `~/.xiaoo/skills/`
7. 配置项目目录（输入项目根目录绝对路径）
8. 初始化全局配置（`~/.aet/config.json`）
9. 启动 xiaoO daemon

使用时启动 `xiaoo` TUI，执行 `/remote http://127.0.0.1:18080` 连接 daemon（每次启动 TUI 都需执行此步），即可用 `/aet-*` 命令。

---

## 4. 命令使用

### Q22. AET 提供哪些斜杠命令？哪些需要 Token？

9 个斜杠命令（`/aet-` 前缀，在 OpenCode 聊天窗口输入）：

| 命令 | 功能 | 是否需要 Token |
| --- | --- | :---: |
| `/aet-init` | 初始化项目配置 | 否 |
| `/aet-auto <URL>` | 自动化功能开发工作流 | 是 |
| `/aet-bugfix <描述>` | Bug 修复工作流 | 视输入形式 |
| `/aet-pr` | PR 管理 | 是 |
| `/aet-issue` | Issue 管理 | 是 |
| `/aet-release` | Release 管理 | 是 |
| `/aet-doc` | 文档生成 | 否 |
| `/aet-design` | 直接进入设计智能体 | 否 |
| `/aet-implement` | 直接进入实现智能体 | 否 |

> `/aet-bugfix` 是否需要 Token 取决于输入形式：直接描述 Bug 或 CVE 标识符不需要 Token；以 Issue URL 输入时需认领 Issue（调用平台 API），需要 Token。

### Q23. `/aet-auto` 命令的核心流程是什么？

AET 核心命令，从 Issue 到 PR 的完整开发流程。8 个阶段：

1. 认领 Issue，创建特性分支
2. Checkpoint 检测（询问继续或重新开始）
3. 需求分析（评审确认点）
4. 需求设计（模块划分、接口设计、DFX 策略，评审确认点）
5. 开发计划（任务分解、围栏配置，评审确认点）
6. TDD 开发
7. 功能验证（确认点）
8. 提示用户使用 `/aet-pr` 提交 PR

期间 AET 在关键节点（设计评审、开发计划评审）暂停等待确认。

### Q24. `/aet-auto 项目分析` 模式会生成什么？

自动分析项目架构，生成以下文档到 `.aet/project-analysis/`：

| 文档 | 说明 |
| --- | --- |
| `Overview.md` | 项目概览 |
| `Modules.md` | 模块清单与依赖矩阵 |
| `Architecture.md` | 架构概览 |
| `modules/` | 各模块详细分析 |

此文档是后续围栏配置的依据，项目结构发生重大变化时（如新增模块、重构）需重新执行以更新分析结果。

### Q25. `/aet-bugfix` 接受哪些输入形式？

3 种输入：

1. **Issue URL** — `/aet-bugfix https://atomgit.com/owner/repo/issues/456`
2. **直接描述 Bug** — `/aet-bugfix 应用崩溃 when user clicks cancel button`
3. **CVE 标识符** — `/aet-bugfix CVE-2026-31431`，自动分支到 CVE 研究 + 本地仓库定位流程

工作流 4 步：问题诊断 → 修复规划 → TDD 修复 → 验证测试。对于 CVE 输入，agent 自动分支并产物输出到 `.aet/bugfix/{CVE-ID}/`。

### Q26. `/aet-pr` 如何路由到不同 Skill？

按意图关键词分流：

- **Review 意图**（关键词：`review`、`评审`、`code review`、`check the PR`、`review PR #N`）→ 调用 `aet-reviewing-pr` Skill
- **其他 PR 意图**（create / update / list / get / add-comment / delete-comment）→ 调用 `aet-operating-pr` Skill

Review 模式支持参数：`--dry-run` / `--no-post`（生成产物但不发布）、`--include-draft`（强制评审 draft PR）、按 URL 或 PR 号定位（如 `/aet-pr review 226`、`/aet-pr review https://atomgit.com/owner/repo/merge_requests/226`）。

### Q27. `/aet-release` 支持哪些原子操作和完整流程？

6 个原子操作：

- **Create Release** — `创建release v1.0.0` / `create release v1.2.0`
- **Delete Release** — `删除release v1.1.0` / `delete release 123`
- **Query Release** — `查询release v1.0.0` / `get release` / `latest release`
- **List Releases** — `列出所有release`
- **Upload Asset** — `上传附件` / `get upload url`
- **Download Asset** — `下载附件` / `download asset`

**完整发布流程** — 用户输入"发布新版本"/"我要发布"/"release新版本"时，引导走 Change Detection → Version Generation → Release Notes → Create Release 流程，自动检测代码变更、分析 commit 类型（feat/fix/docs 等）推断版本号、生成 Release Notes、创建平台 Release。

### Q28. `/aet-doc` 支持生成哪些类型的文档？

12 种文档类型：

| 类型 | 说明 |
| --- | --- |
| README 文档 | 生成中英文双语 README |
| 用户手册 | 安装指南、功能教程、故障排查 |
| 技术分析 | 深度技术原理分析文档 |
| HTML 幻灯片 | 可交互的 HTML 幻灯片 |
| 技术信息图 | "一图看懂 XXX"长图 |
| 实践案例 | 项目示例和教程文档 |
| Python API 文档 | 函数/类/模块的 docstring 与 API 参考 |
| 文档翻译 | 中英互译（全量/增量/同步三种模式） |
| 文档质量检查 | 通用性检查，支持 URL/PR/本地路径 |
| mdbook 文档构建 | 从 Markdown 构建可浏览的 HTML 文档站 |
| 问答对生成 | 从本地文件、仓库或远程 Git URL 生成带来源溯源的中文 Q&A 对 |
| wiki 知识库构建 | 从任意内容构建可查询的轻量级个人 Wiki |

可一次生成多种，如 `/aet-doc 生成 README 和用户手册`；也可根据 Issue URL 生成手册（`/aet-doc 根据 <Issue URL> 生成手册`）。

### Q29. `aet` CLI 提供哪些子命令？

CLI 主入口 `aet <resource> <action> [flags]`，本版本提供 8 个命令 + 1 个内部 dispatcher：

- `aet workflow init --name …` — 初始化工作流
- `aet workflow handover [--step …]` — 阶段交接
- `aet workflow continue` — 状态恢复（重新发出当前步骤的 prompt）
- `aet workflow status` — 只读查询活跃工作流
- `aet workflow abort [--reason …]` — 终止活跃工作流
- `aet workflow list` — 列出所有工作流 + 命令
- `aet context [plugin-name ...] [--root …]` — 输出插件上下文
- `aet plugin init [--agent …]` — 生成 agent 命令/skill 文件
- `aet event <name>` — **内部 dispatcher**，从 `--help` 隐藏，用于分发非工作流事件（如 `aet event ca-stop`）

CLI 是 agent-agnostic 的，不接 `--agent` 标志。调用方通过 `--output json|prompt` 声明编码方式（默认 `prompt`）。Stateful Core 契约：每个 projectRoot 只支持一个 active workflow，状态由 Core 在 `<projectRoot>/.aet/core-checkpoint/` 持有，调用方无需重复传递。

### Q30. Aet-Router 的意图路由支持哪些工作流类型？

Router 通过分析用户意图自动路由到合适工作流，支持 6 类：

1. **Feature Development** — 提供 Issue URL 或描述要开发的功能
2. **Bug Fix** — 描述 bug 或要修复的 issue
3. **Project Analysis** — 请求分析项目架构和结构
4. **Configuration Setup** — 请求初始化或配置项目设置
5. **Design Workflow** — 请求开始或继续设计阶段
6. **Documentation Workflow / Implementation Workflow** — 请求生成文档或开始/继续实现

直接描述要做什么，Router 会引导到正确工作流。

### Q31. `/aet-init` 命令会做什么？是否必须先执行？

`/aet-init` 调用 `aet-setup-config` Skill，配置向导会自动检测 Git 远程仓库信息，读取全局配置中的 Token，生成 `.aet/config.json`（含 Fork 源仓库信息、访问令牌、上游仓库信息）。

**首次使用 AET 时必须执行一次**，否则依赖平台 API 的命令（`/aet-pr`、`/aet-issue`、`/aet-auto`）不可用。注意命令定义中带 `disable-model-invocation: true` 标志，表示该命令是纯路由不调用模型；同时还会自动检测用户输入语言并以相同语言响应。

---

## 5. 核心机制

### Q32. Checkpoint 机制是如何工作的？存储在哪里？

Checkpoint 是 AET 的断点恢复机制，用于解决长程任务（4-8 小时）中断问题。

**存储位置**：`.aet/checkpoint/` 目录

**目录结构**：

- `index.json` — 索引文件，跟踪活跃和已中断的 Checkpoint 状态
- `checkpoint_{timestamp}_{random}.json` — 各 Checkpoint 的状态快照，含当前阶段、执行记录、历史记录
- `archive/` — 已完成 Checkpoint 的归档目录

**恢复方式**：重新执行相同命令，AET 自动检测 Checkpoint 索引并询问继续或重新开始，避免从头执行减少资源消耗。Aet-Router 在入口处检查 `.aet/checkpoint/` 目录中的 Checkpoint 状态，询问用户继续还是重新开始。

### Q33. 围栏（Fence）有哪三种权限？由谁在什么阶段生成？

围栏是 AET 的模块保护机制，包含三种权限：

| 符号 | 含义 | 说明 |
| :--- | :--- | :--- |
| ✅ | 允许修改 | 本次开发可以修改或新增的文件 |
| ❌ | 禁止修改 | 不应修改的关键文件，保护架构完整性 |
| 🔵 | 条件修改 | 满足特定条件才能修改 |

由 Aet-Implement 智能体在**实现阶段首步**（开发计划生成）自动生成在 DPS（开发计划规范）中。重要区分：**工作流控制 Agent 执行顺序和确认点，围栏控制开发时 AI 能改哪些文件——两者独立，互不依赖**。日常使用 AET 不需理解围栏，只有在需要保护核心模块时才需关注。

### Q34. 围栏在开发流程的哪三个保护点发挥作用？

3 个保护点：

| 保护点 | 位置 | 保护内容 |
| :--- | :--- | :--- |
| 保护点 1 | 开发计划生成时 | 定义允许/禁止/条件修改的文件范围 |
| 保护点 2 | 编码实现时 | AI 对照围栏配置自检，拒绝越界修改 |
| 保护点 3 | PR 创建前 | 提交前最后一次检查，确保没有越界 |

流程顺序：需求分析 → 需求设计 → 开发计划（保护点 1）→ 编码实现（保护点 2）→ PR 创建（保护点 3）→ 合并。围栏检查在编码时（保护点 2）是 AI 自动执行的，人工评审作为第二道防线在 PR 创建前（保护点 3）确认没有越界修改。

### Q35. 围栏遵循哪四条模块依赖保护规则？

4 条架构原则：

1. **禁止反向依赖** — 高层模块不能依赖低层模块，依赖方向必须从上至下（如 UI → API → 业务层 → 基础层）。错误示例：UI 层直接调用 Core 层、业务层直接操作数据库。
2. **禁止跨层调用** — 只能相邻层次之间调用，不能跳过中间层。错误示例：UI → Evaluation（跨过 API 层）；正确：UI → API → Evaluation。
3. **禁止循环依赖** — 模块之间不能形成循环依赖关系。错误：Module A → B → C → A；正确：A → B → C（单向）。
4. **保持接口稳定** — 被多个模块广泛依赖的接口不能随意变更。应新增函数保留旧函数（可选废弃、逐步迁移），不能直接修改被广泛使用的函数签名。

### Q36. 当 AI 想修改围栏中禁止的文件时，应如何处理？

AI 会暂停询问授权突破。流程：

1. **说明原因** — 详细描述为什么必须突破围栏，如"运行时发现模块兼容性问题，必须修改导入方式"
2. **申请审批** — AET 暂停等待用户确认
3. **用户决策**
   - 拒绝：回复"不允许修改"，AI 寻找替代方案
   - 批准：回复"允许修改，原因：需要新增用户表字段"
4. **记录原因** — 将突破原因写入提交信息，供后续追溯
5. **更新配置** — AET 自动同步更新围栏配置，反映实际修改范围
6. **继续开发**

也可在评审时回顾围栏效果（是否有效保护核心文件、是否过严影响效率、是否需补充禁止修改列表），结果应用到下一次开发。扩展但不修改禁止文件的推荐模式：新增函数保留原函数、新增字段不修改现有字段、使用装饰器或中间层隔离变更。

### Q37. SDD（规范驱动开发）是什么？AET 如何实现？

SDD = Specification-Driven Development（规范驱动开发），强制 AI 输出结构化设计文档，将设计方法最佳实践（功能树、DFx 设计、架构原则等）编码为不可篡改的基准上下文，确保开发质量。

AET 实现方式：各阶段产物以 Markdown 固化，直接作为下一阶段输入上下文：

```
Issue → RAS（需求分析）→ RDS（需求设计）→ DPS（开发计划）→ 实现代码 → 验证报告
```

每个阶段产物都是下一阶段的基础上下文，消除角色间沟通成本。

### Q38. SR-AR 需求分解规则是什么？

AET 采用 SR-AR 方法进行需求分解：

- **SR (System Requirement) 系统需求** — 对应一个主要场景或功能域，一般 1-2 个
- **AR (Architecture Requirement) 架构需求** — 属于某个具体系统元素的架构需求

分解规则：

| 规则 | 说明 |
| :--- | :--- |
| SR 数量 | 一般控制在 1-2 个，优先合并，避免过多 |
| AR 数量 | 每个 SR 默认 1-2 个 AR，最多不超过 3 个 |
| 一对一原则 | 一个 AR 属于且仅属于一个模块 |
| 能力点 | 每个 AR 必须列出具体能力点 |

示例：

```
SR-1: 用户认证功能
  ├── AR-1.1: 用户登录（登录模块）
  └── AR-1.2: 用户注册（注册模块）
```

### Q39. TDD 铁律是什么？AET 实现阶段如何执行 TDD 循环？

**TDD 铁律**：`NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST`（没有失败测试就不写生产代码）。

实现阶段强制遵循"红 → 绿 → 重构"循环：

- **红** — 编写失败的测试
- **绿** — 编写最简代码通过测试
- **重构** — 优化代码
- 循环

Aet-Implement 对每个任务执行 TDD 循环：编写失败测试 → 验证测试失败 → 编写最简代码通过测试 → 验证测试通过 → 提交代码。

### Q40. AET 在哪些关键节点支持用户确认？

5 个人工确认点：

| 节点 | 说明 |
| :--- | :--- |
| Checkpoint 检测 | 发现已存在进度时，询问继续或重新开始 |
| 设计评审前 | 确认需求分析是否通过 |
| 实现前 | 确认开发计划是否合理 |
| 功能验证 | 确认功能验证是否通过 |
| 实现完成 | 提示用户使用 `/aet-pr` 提交 PR |

典型用户介入场景：

> **Automation 模式抑制**：当 scenario 配置 `"automation": true` 时，以上 5 个确认点全部被引擎自动短路为 `auto` 行为，agent 不调 `question` 工具，基于自身判断推进。Directive `<aet-run-mode>automation</aet-run-mode>` 注入到 system prompt 后，SKILL.md 和 Agent prompt 据此切换行为。详见 [workflow.md § 自动化模式](workflow.md#自动化模式-automation-mode)。验证类门禁（lint / test / build）不受 automation 影响，仍必经。

- 新任务开始 — 用户等待
- 设计阶段 — 评审时确认
- 实现阶段 — 用户等待
- 任务中断后恢复 — 选择继续或重新开始
- 实现完成 — 手动执行 `/aet-pr`
- 发现问题 — 指导修复方向

### Q41. RAS、RDS、DPS 三份设计文档分别包含什么内容？

三份核心文档：

| 文档 | 全称 | 包含内容 | 生成阶段 |
| :--- | :--- | :--- | :--- |
| **RAS** | Requirements Analysis Specification | 需求背景、目标、范围、详细需求 | Aet-Design 设计阶段 |
| **RDS** | Requirements Design Specification | 模块划分、接口设计、DFX 策略、SR-AR 分解 | Aet-Design 设计阶段 |
| **DPS** | Development Plan Specification | 开发任务分解、围栏配置、具体实现步骤 | Aet-Implement 实现阶段首步 |

DPS 对应文件 `dev-plan.md`。三份文档顺序传递：RAS → RDS → DPS，每个都是下一阶段的输入上下文。

---

## 6. 工作流配置

### Q42. AET 工作流配置有哪三个来源？合并规则是什么？

3 个来源，按优先级从低到高：

| 优先级 | 来源 | 路径 |
| :--- | :--- | :--- |
| 低 | 全局工作流模板 | `~/.aet/templates/workflow.json` |
| 中 | 项目工作流模板 | `.aet/templates/workflow.json` |
| 高 | 项目配置文件 | `.aet/config.json` 的 `scenarios`/`hooks`/`agents` 字段 |

**合并规则**：高优先级配置中同名的 `scenarios`、`hooks`、`agents` 会覆盖低优先级。`.aet/config.json` 顶层结构为 `{ "version", "codePlatform", ... }`，scenarios/hooks/agents 属于 `codePlatform` 层下可选字段，系统自动合并：项目配置 → 工作流模板 → 全局配置。任何读取错误时 ConfigManager 回退到内置 BASELINE_CONFIG（baseline + global + project 三层合并），保证新克隆项目能直接 `aet workflow init feature`。

### Q43. 工作流配置的顶层结构是什么？包含哪些字段？

统一 JSON 格式，顶层结构：

```json
{
  "version": "1.0",
  "scenarios": { },
  "hooks": { },
  "agents": { }
}
```

| 字段 | 说明 |
| :--- | :--- |
| `version` | 配置文件格式版本，当前为 `1.0` |
| `scenarios` | 场景定义，配置不同类型的开发流程 |
| `hooks` | 钩子定义，配置阶段/步骤间的用户交互行为 |
| `agents` | Agent 定义，配置各 Agent 的步骤工作流 |

每个 scenario 含 `workflow` 数组，每项含 `agent_id`、`before`（阶段前钩子，可为 null）、`after`（阶段后钩子，可为 null 或 hook 名称）。

### Q44. 钩子（Hook）有哪两种内置类型？如何自定义？

2 种内置类型：

- **auto** — 设置后 Agent 完成阶段后自动进入下一阶段，无需用户确认。配置：`"promptTemplate": null, "options": null`。
- **confirm** — Agent 完成后暂停等待用户确认。"完成"(approve)进入下一阶段，"需要修改"(reject)重新执行当前阶段。配置含 `promptTemplate`（带 `{description}` 和 `{options}` 占位符）和默认两个选项（完成=approve / 需要修改=reject）。

**自定义钩子**示例：

```json
{
  "hooks": {
    "stage_review": {
      "description": "阶段审查确认",
      "promptTemplate": "请审查当前阶段的交付物。\n\n{description}\n\n选项：\n{options}",
      "options": [
        { "label": "通过", "value": "approve" },
        { "label": "需要修改", "value": "reject" },
        { "label": "跳过本次审查", "value": "skip" }
      ]
    }
  }
}
```

可在 confirm 基础上加第三个选项（如"跳过本次审查=skip"）满足特定需求。

### Q45. AET 预置了哪些内置场景？

9 个内置场景：

| 场景 ID | 名称 | 说明 |
| :--- | :--- | :--- |
| `feature` | 功能开发流程 | 从设计到实现、验证、PR 提交提示的完整流程 |
| `bugfix` | Bug 修复流程 | 从问题诊断到修复、验证、PR 提交提示的流程 |
| `config-setup` | 配置初始化流程 | 项目配置初始化 |
| `project-analysis` | 项目分析流程 | 分析项目架构和模块依赖 |
| `design` | 设计阶段流程 | 需求澄清、架构设计的完整设计流程 |
| `implement` | 实现阶段流程 | 基于设计文档执行开发计划生成、代码开发、单元测试、开发验证 |
| `design-refine` | 需求变更流程 | 基于已有设计文档进行需求变更和迭代 |
| `release` | 发布管理流程 | 版本发布和 Release Notes 生成 |
| `doc` | 文档生成流程 | 生成或更新项目文档（README、用户手册、技术分析、Python API 文档、文档翻译、文档质量检查、mdbook 构建等） |

### Q46. 如何创建一个全自动工作流？如何创建严格审查工作流？

**全自动流程** — 将所有 `after` 设置为 `auto`：

```json
{
  "scenarios": {
    "auto-feature": {
      "name": "全自动功能开发",
      "workflow": [
        { "agent_id": "aet-design", "before": null, "after": "auto" },
        { "agent_id": "aet-implement", "before": null, "after": "auto" }
      ]
    }
  }
}
```

**严格审查流程** — 每个 `after` 设置为 `confirm`：

```json
{
  "scenarios": {
    "strict-code": {
      "name": "严格代码开发流程",
      "workflow": [
        { "agent_id": "aet-design", "before": null, "after": "confirm" },
        { "agent_id": "aet-implement", "before": null, "after": "confirm" }
      ]
    }
  }
}
```

也可调整 Agent 顺序（如测试优先：design → test → implement）或新增自定义 Agent（如安全检查 agent + `secure-code` 场景）。简化流程可让部分 `after` 为 `null` 跳过确认。

### Q47. 如何开发自定义 Skill 并集成到工作流？

3 步：

1. **创建自定义 Skill** — 在 `skills/` 目录下创建新目录（如 `skills/my-security-check/SKILL.md`），SKILL.md 含"概述/When to use/Workflow/Resources"四节，遵循渐进式披露原则。
2. **配置自定义 Agent 和场景** — 在 `.aet/templates/workflow.json` 或 `.aet/config.json` 中添加自定义 Agent（含 `step_id`、`description`、`after`、`skill` 字段）和场景（编排 Agent 执行顺序）。
3. **使用自定义工作流** — 在 OpenCode 中执行 `/aet-auto 使用 <场景名> 场景开发...` 触发自定义工作流。

注意：自定义场景的触发方式取决于 AET 的意图识别能力，也可通过修改已有场景的 `workflow` 字段覆盖默认行为。

### Q48. 项目配置中如何指定代码托管平台类型？

在 `.aet/config.json` 中通过 `codePlatform.platform.type` 字段指定，支持 3 种类型：`gitcode`、`github`、`gitlab`。配置示例：

```json
{
  "codePlatform": {
    "platform": { "type": "gitcode" }
  }
}
```

对应 Token 存储在全局配置 `~/.aet/config.json.platforms` 中（按平台名分组）。

### Q49. 确认点设置的最佳实践是什么？

按场景类型设置：

| 场景 | 建议 |
| :--- | :--- |
| 快速验证想法 | 使用 `auto` 跳过所有确认点 |
| 正式项目开发 | 保留 `confirm` 确认点，在设计评审和实现完成时确认 |
| 团队协作 | 在关键阶段交付物（RAS、RDS、DPS）处设置确认点 |
| 新手使用 | 保留默认配置，充分理解流程后再自定义 |

调试建议：修改配置后需重新启动 OpenCode 或重新加载配置；确保 JSON 格式正确可用校验工具验证；从简单修改开始（如调整确认点）逐步增加自定义程度。

---

## 7. 故障排查

### Q50. 遇到 AET 问题时，建议按什么步骤排查？

5 步系统排查：

1. **检查安装状态** — 确认 AET 插件和依赖正确安装
2. **检查配置文件** — 确认 `.aet/config.json` 配置正确
3. **检查网络连接** — 确认能够访问代码仓库平台
4. **查看错误信息** — 分析 AET 返回的具体错误描述
5. **查看日志** — 收集详细日志信息用于定位问题

### Q51. 安装失败常见原因有哪些？如何解决？

3 个常见原因：

1. **未找到 git** — 系统未安装 Git。
   - macOS: `brew install git`
   - Ubuntu/Debian: `sudo apt-get install git`
   - Windows: 下载 https://gitforwindows.org/
2. **未找到 Node.js** — Node.js 未安装或版本低于 14.0.0。从 https://nodejs.org/ 下载安装 Node.js >= 14.0.0。
3. **npm 依赖安装失败** — 网络问题导致 npm 包下载失败。解决：
   ```bash
   cd ~/.config/opencode/aet
   npm cache clean --force
   npm install
   ```

### Q52. 命令无响应可能是什么原因？如何排查？

3 个可能原因：

1. AET 未正确安装
2. 当前目录没有 `.aet/config.json`
3. OpenCode 未重新加载配置

排查命令：

```bash
# 检查安装状态
ls -la ~/.config/opencode/plugins/aet.js
ls -la ~/.config/opencode/skills/aet

# 检查项目配置
ls -la .aet/config.json
```

分别检查插件、skills、项目配置是否就位。初始化失败时还需确认当前目录是 Git 仓库（`/aet-init` 要求 Git 项目目录）。

### Q53. 长程任务中断后如何恢复？

AET 支持断点恢复，**重新运行相同的命令即可**：

```bash
/aet-auto https://atomgit.com/owner/repo/issues/123
```

AET 会自动检测已存在的 Checkpoint，询问继续还是重新开始。Checkpoint 存储在 `.aet/checkpoint/` 目录。若返回 `Checkpoint 不存在` 错误，说明中断的任务已过期，需重新开始任务。

**Agent 行为异常**时（上下文丢失或指令理解偏差）：

1. 检查当前阶段的输出文档是否完整
2. 使用 `confirm` 确认点重新评审
3. 如必要，选择"需要修改"让 Agent 重新执行

### Q54. AET 常见错误信息及含义是什么？

| 错误信息 | 含义 | 解决方案 |
| :--- | :--- | :--- |
| `未找到 git` | 系统缺少 Git | 安装 Git |
| `未找到 Node.js` | Node.js 未安装 | 安装 Node.js >= 14 |
| `npm 依赖安装失败` | 网络或 npm 问题 | 清理缓存后重试 |
| `This issue has already been claimed` | Issue 已被认领 | 选择其他 Issue |
| `令牌配置错误` | Token 无效或权限不足 | 重新配置 Token |
| `无法访问平台 API` | 网络问题或 API 地址错误 | 检查网络和 API 配置 |
| `Checkpoint 不存在` | 中断的任务已过期 | 重新开始任务 |

### Q55. 向开发团队报告问题时需要收集哪些信息？

收集 5 类信息：

1. **AET 版本号**
2. **使用的命令和完整参数**
3. **完整的错误信息（文本）**
4. **配置诊断信息**（注意隐去敏感信息如 Token）
5. **复现步骤**

具体收集命令：

```bash
# 安装状态
ls -la ~/.config/opencode/plugins/aet.js
ls -la ~/.config/opencode/skills/aet

# Node.js 版本
node --version

# 项目配置状态（注意隐去 Token）
cat .aet/config.json

# OpenCode 版本
opencode --version
```

也可在 OpenCode 配置中启用详细日志模式获取更多调试信息。
