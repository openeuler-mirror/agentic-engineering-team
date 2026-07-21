# AET (Agentic Engineering Team)

![Version](https://img.shields.io/badge/version-1.1.0-blue)
![License](https://img.shields.io/badge/license-MulanPSL--2.0-green)
![Node](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen)
![Platform](https://img.shields.io/badge/platform-OpenCode-lightgrey)

> AET (Agentic Engineering Team) 全流程 AI 辅助研发底座/引擎：通过多个专用 AI 智能体有序协作，覆盖从需求分析、设计、编码、测试到发布、运维的软件研发全生命周期。

---

## 目录

- [核心挑战](#核心挑战)
- [功能特性](#功能特性)
- [快速上手](#快速上手)
- [架构设计](#架构设计)
- [命令参考](#命令参考)
- [配置说明](#配置说明)
- [项目结构](#项目结构)
- [发展路线](#发展路线)
- [贡献指南](#贡献指南)
- [许可证](#许可证)

---

## 核心挑战

AI 辅助研发工具面临三个普遍问题：

- **长程任务失败率高** — 超过 4–8 小时的 AI 研发任务失败率超过 50%，重试需从头开始，大量消耗计算资源。
- **单智能体能力局限** — 现有 AI 编码工具大多服务于"单兵作战"，无法理解架构师、开发、测试、产品等角色的协作边界与工件传递要求。
- **研发流程不兼容** — 开源项目开发流程各异（敏捷迭代、传统流程、嵌入式安全标准），现有框架缺乏灵活的检查点和交付件模板配置。

AET 通过多智能体编排、断点恢复和可配置工作流解决上述问题。

---

## 功能特性

- **多智能体协作** — 8 个专用智能体（Router、PRD、Design、Implement、Test、Bugfix、Doc、Release）按序执行，覆盖从需求认领到 PR 提交的完整流程。每个智能体有独立的系统提示词，针对其阶段优化。

- **规格驱动开发 (SDD)** — 功能树、DFx 设计、架构原则等设计方法最佳实践编码为不可篡改的基准上下文，强制 AI 输出符合专业标准的需求分析与设计说明书。

- **四层分层架构** — 命令层 → 编排 Skill 层 → Agent 层 → 原子 Skill 层，各层职责清晰、可独立扩展。阶段产物（设计文档、开发计划、验证报告）以 Markdown 固化，直接作为下一阶段的输入上下文。

- **围栏模块保护 (Fence)** — 设计阶段自动将文件划分为允许修改、禁止修改和条件修改三类。AI 在开发时自动遵守围栏边界，防止越界修改破坏模块依赖。围栏在三个保护点（设计、实现、PR 前）反复校验。

- **可配置工作流** — Agent 执行顺序和用户确认点 (Hook) 通过 JSON 完全自定义。三级配置（全局模板、项目模板、项目配置）支持团队在不修改核心代码的前提下适配不同流程。

- **断点恢复 (Checkpoint)** — 任务快照记录各阶段完整状态。长程任务中断后从最新断点恢复，无需从头执行，降低计算资源重复消耗。

- **原子技能** — 模块化 Skill 体系覆盖分析、设计、实现、测试、代码审查、发布管理、文档生成、安全与 CVE 分析。技能采用渐进式披露模式，按需展示复杂度。

- **自动化版本发布** — 检测上次 Release 后的代码变更，分析 commit 类型（feat/fix/docs/refactor），推断版本号（major/minor/patch），生成 Release Notes 并自动创建平台 Release。

---

## 快速上手

### 前置要求

- Git
- Node.js >= 14.0.0
- npm

### 一键安装

```bash
curl -fsSL https://raw.atomgit.com/openeuler/agentic-engineering-team/raw/master/scripts/install.sh | bash
```

安装脚本自动完成以下步骤：

1. 检查系统依赖（git、node、npm）
2. 克隆仓库到 `~/.config/opencode/aet`
3. 创建插件符号链接到 `~/.config/opencode/plugins/aet.js`
4. 复制 skills 到 `~/.config/opencode/skills/aet/`
5. 创建命令符号链接到 `~/.config/opencode/commands/`
6. 安装 npm 依赖（`@opencode-ai/plugin`）
7. 安装 graphify（可选，项目分析工具）
8. 交互式配置平台 Token（可选）

> **提示**：Token 配置可选。未配置 Token 时，`/aet-pr` 和 `/aet-issue` 命令不可用。稍后可通过重新运行安装脚本或编辑 `~/.aet/config.json` 添加。

### 验证安装

```bash
ls -la ~/.config/opencode/plugins/aet.js
ls -la ~/.config/opencode/skills/aet
ls -la ~/.config/opencode/commands/aet-*.md
```

### 初始化项目

```bash
/aet-init
```

配置向导自动检测 Git 远程仓库信息，读取全局配置中的 Token，生成 `.aet/config.json`。

### 开始开发

```bash
/aet-auto https://github.com/owner/repo/issues/123
```

AET 自动完成以下流程：

1. 认领 Issue，创建特性分支
2. 生成三份设计文档：RAS（需求分析规范）、RDS（需求设计规范）、SDD（软件设计文档）
3. 基于围栏配置生成开发计划
4. 使用 TDD（红 → 绿 → 重构）实现功能
5. 对照需求验证功能完整性
6. 提示用户通过 `/aet-pr` 提交 PR

### 项目分析

```bash
/aet-auto 项目分析
```

生成架构概览、模块依赖文档和编码规范，存储在 `.aet/project-analysis/`。

### 生成文档

```bash
/aet-doc 生成 README         # 生成 README 文档
/aet-doc 生成用户手册         # 生成用户手册
/aet-doc 生成技术分析         # 生成技术分析文档
/aet-doc 生成幻灯片          # 生成 HTML 幻灯片
/aet-doc 生成信息图          # 生成技术信息图
/aet-doc 生成实践案例        # 生成实践案例/教程
/aet-doc 生成 Python API 文档  # 生成 API 文档/docstring
/aet-doc 翻译 docs/            # 文档翻译（中译英等）
/aet-doc 检查文档质量 docs/     # 文档质量检查
/aet-doc 构建 mdbook 文档      # 从 Markdown 构建 HTML 文档
```

---

## 架构设计

AET 采用四层分层架构，依赖方向严格自上而下：

```
┌─────────────────────────────┐
│      用户命令层              │  /aet-init, /aet-auto, /aet-bugfix, ...
│      (9 个命令)            │
└─────────────┬───────────────┘
              │
┌─────────────▼───────────────┐
│    编排 Skill 层             │  feature-management, aet-reviewing-code
│    (协调子流程)              │
└─────────────┬───────────────┘
              │
┌─────────────▼───────────────┐
│       Agent 层              │  Router → Design → Implement → Test
│  (领域专用智能体)            │  → Bugfix → Doc → Release
└─────────────┬───────────────┘
              │
┌─────────────▼───────────────┐
│    原子 Skill 层             │  单一职责技能
│   (最小功能单元)             │
└─────────────────────────────┘
```

### 设计优势

- **基于产物的协作**：各阶段输出 Markdown 产物（RAS、RDS、SDD、实现计划、验证报告），直接作为下一阶段的上下文，消除角色间沟通成本。
- **渐进式披露**：Skill 以简洁描述开头，需要时再展开完整复杂度，保持 Agent 提示词聚焦，避免上下文窗口溢出。
- **平台抽象**：所有平台 API 操作（Issue、PR、Release）通过统一的 `platform-api.js` 接口处理，一套代码支持 GitHub、GitLab、Gitee、AtomGit、GitCode。

---

## 命令参考

| 命令 | 功能 | 是否需要 Token |
|------|------|:---:|
| `/aet-init` | 初始化项目配置 | 否 |
| `/aet-auto <URL>` | 自动化开发工作流（Issue → PR） | 是 |
| `/aet-bugfix <描述>` | Bug 修复工作流 | 否 |
| `/aet-pr` | PR 管理（创建、更新、查询） | 是 |
| `/aet-issue` | Issue 管理（创建、认领、查询） | 是 |
| `/aet-release` | Release 管理（创建、删除、列出、查询） | 是 |
| `/aet-doc` | 文档生成（README、用户手册、技术分析、幻灯片、信息图、实践案例、Python API 文档、翻译、质量检查、mdbook 构建） | 否 |
| `/aet-design` | 直接进入设计智能体 | 否 |
| `/aet-implement` | 直接进入实现智能体 | 否 |

---

## 配置说明

### 全局配置

`~/.aet/config.json` 存储平台 Token：

```json
{
  "platforms": {
    "github": { "token": "ghp_xxxxxxxxxxxxxxxxx" },
    "gitcode": { "token": "gc_xxxxxxxxxxxxxxxxx" }
  }
}
```

### 项目配置

`.aet/config.json` 由 `/aet-init` 自动生成：

```json
{
  "version": "1.0",
  "codePlatform": {
    "mode": "issue",
    "platform": { "type": "gitcode" },
    "codebaseSync": {
      "enabled": false,
      "autoSyncOnClaim": false,
      "autoSyncOnCreate": false
    },
    "upstream": { "owner": "owner", "repository": "repo" },
    "fork": { "owner": "myfork", "repository": "repo" }
  },
  "scenarios": {},
  "hooks": {},
  "agents": {}
}
```

### 工作流自定义

工作流配置分三级（优先级从低到高）：

| 优先级 | 来源 | 路径 |
|--------|------|------|
| 低 | 全局工作流模板 | `~/.aet/templates/workflow.json` |
| 中 | 项目工作流模板 | `.aet/templates/workflow.json` |
| 高 | 项目配置文件 | `.aet/config.json` |

每级定义 `scenarios`（流程编排）、`hooks`（用户确认点 — `auto` 或 `confirm`）、`agents`（步骤级自定义）。

---

## 项目结构

```
.
├── agents/                  # Agent 定义（含系统提示词）
│   ├── router/             # Aet-Router：协调入口、Feature 认领
│   ├── design/             # Aet-Design：RAS、RDS、SDD 生成
│   ├── implement/          # Aet-Implement：TDD + 编码 + 验证
│   ├── test/               # Aet-Test：集成测试（扩展中）
│   ├── bugfix/             # Aet-Bugfix：诊断与修复规划
│   ├── doc/                # Aet-Doc：README、手册、技术分析、API 文档、翻译、检查、mdbook 构建
│   ├── general/            # Aet-General：通用任务处理
│   └── release/            # Aet-Release：版本管理
├── skills/                  # SKILL.md 定义
│   ├── aet-req-analysis/
│   ├── aet-req-design/
│   ├── aet-implementing-requirement/
│   ├── aet-operating-pr/
│   ├── aet-operating-issues/
│   ├── aet-operating-release/
│   ├── aet-generating-readme/
│   ├── aet-generating-manual/
│   ├── aet-reviewing-code/
│   ├── aet-diagnosing-bug/
│   ├── test-driven-development/
│   └── ... (35 个)
├── commands/               # 命令定义
├── scripts/                # 安装和配置脚本
│   ├── install.sh          # 一键安装（远程/本地模式）
│   ├── init-global-config.sh
│   └── templates/
├── docs/                   # 用户文档目录
│   └── zh/                # 中文文档
│       ├── installation.md # 安装指南
│       ├── quick-start.md  # 使用指南
│       ├── commands.md     # 命令参考
│       ├── agent.md        # Agent 说明
│       ├── skill.md        # Skill 说明
│       ├── workflow.md     # 工作流配置
│       ├── architecture.md # 架构设计
│       ├── module-dependency-protection.md # 模块依赖保护
│       ├── manual-overview.md # 手册概览
│       ├── glossary.md     # 术语表
│       └── troubleshooting.md # 故障排除
├── .opencode/              # OpenCode 插件配置
│   └── plugins/aet.js     # AET 插件入口
└── LICENSE
```

---

## 发展路线

| 方向 | 规划 |
|------|------|
| **Aet-Test 智能体** | 扩展至集成测试、性能测试、安全测试、端到端测试 |
| **围栏自动化** | 从文本定义演进为结构化配置文件，支持自动化合规检查和更丰富的语义（只读、有限修改） |
| **Skill 生态** | 持续扩展 Skill 库，提供正式的 Skill SDK |
| **平台扩展** | 支持更多 AI 编码平台和自托管环境 |

---

## 贡献指南

1. Fork 仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 遵循现有模式和目录结构进行更改
4. 为新功能添加测试
5. 运行测试：`npm test`
6. 提交更改 (`git commit -m '添加出色功能'`)
7. 推送到分支 (`git push origin feature/amazing-feature`)
8. 打开 Pull Request

---

## 许可证

本项目采用 **木兰宽松许可证第 2 版 (Mulan PSL v2)**。详见 [LICENSE](LICENSE) 文件。
