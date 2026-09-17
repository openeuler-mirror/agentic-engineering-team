# AET 架构设计

> 文档版本：v1.1 | 更新日期：2026-09-17 | 软件版本：v1.1.0

## 概述

AET (Agentic Engineering Team) 是一个全流程 AI 辅助研发底座/引擎，通过多个 AI 智能体有序协作，覆盖软件研发全生命周期（规划、设计、编码、构建、测试、发布与部署、运维、资料）。

### 设计目标

- **极简协作**：人与 AI 协作，极简完成从需求到实现的完整流程
- **结构化流程**：通过精心设计的工作流，保证开发质量和可追溯性
- **断点恢复**：基于 Checkpoint 快照机制，支持任务中断后继续执行
- **OpenCode 平台支持**：作为插件集成到 OpenCode 运行时
- **多平台代码仓库支持**：通过 `codePlatform` 配置，支持 GitCode、GitHub、GitLab、Gitee、AtomGit

## 整体架构

AET 采用分层架构设计，从用户入口到底层原子技能共四层：

```
用户入口层（命令）
     │
     ▼
编排 Skill 层（协调子流程）
     │
     ▼
Agent 层（智能体协作）
     │
     ▼
原子 Skill 层（单一职责执行）
```

### 用户入口层

用户通过斜杠命令在 OpenCode 中与 AET 交互：

| 命令 | 功能 |
| :--- | :--- |
| `/aet-init` | 项目初始化 |
| `/aet-auto` | 功能开发工作流 |
| `/aet-bugfix` | Bug 修复工作流 |
| `/aet-pr` | PR 管理 |
| `/aet-issue` | Issue 管理 |
| `/aet-release` | Release 管理 |
| `/aet-doc` | 文档生成 |
| `/aet-design` | 直接进入设计智能体 |
| `/aet-implement` | 直接进入实现智能体 |

### Agent 层

Agent 是 AET 中专门负责特定开发阶段的 AI 智能体，通过多 Agent 协作完成完整开发流程：

```
用户输入 Issue URL
        │
        ▼
┌─────────────────┐
│   Aet-Router    │ ← 路由智能体：认领 Feature、检查 Checkpoint
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Aet-Design    │ ← 设计智能体：RAS → RDS → 评审
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Aet-Implement   │ ← 实现智能体：DPS（开发计划）→ TDD 开发 + 功能验证
└────────┬────────┘
         │
         ▼
        PR 创建（用户手动执行 `/aet-pr`）
```

各 Agent 职责如下：

| Agent | 职责 |
| :--- | :--- |
| **Aet-Router** | 核心协调者，理解需求、认领 Feature、路由工作流、管理 Checkpoint |
| **Aet-Design** | 设计智能体，需求分析 (RAS)、需求设计 (RDS) |
| **Aet-Implement** | 实现智能体，开发计划 (DPS)、TDD 驱动开发、代码实现、功能验证 |
| **Aet-Test** | 测试智能体（待扩展），集成测试、性能测试 |
| **Aet-Bugfix** | 修复智能体，Bug 诊断、修复规划 |
| **Aet-Doc** | 文档生成，README、用户手册、技术分析、幻灯片、信息图、实践案例、Python API 文档、文档翻译、文档质量检查、mdbook 文档构建、问答对生成、wiki 知识库构建、GIF 动图生成 |
| **Aet-Release** | Release 管理，版本发布、Release Notes 生成 |

### Skill 层

Skill 是 AET 的核心功能单元，分为三个层级：

| 层级 | 说明 | 示例 |
| :--- | :--- | :--- |
| **命令 Skill** | 用户入口 | `/aet-init`, `/aet-auto` |
| **编排 Skill** | 协调子流程 | `feature-management` |
| **原子 Skill** | 执行单一职责 | `aet-analyzing-project`, `aet-implementing-requirement` |

## 核心概念

### Checkpoint（检查点）

Checkpoint 是 AET 的断点恢复机制，用于解决长程任务中断问题：

- **保存位置**：`.aet/checkpoint/` 目录
- **目录结构**：
  - `index.json` — 索引文件，跟踪活跃和已中断的 Checkpoint 状态
  - `checkpoint_{timestamp}_{random}.json` — 各 Checkpoint 的状态快照（含当前阶段、执行记录、历史记录）
  - `archive/` — 已完成 Checkpoint 的归档目录
- **恢复方式**：重新执行相同命令，AET 自动检测 Checkpoint 索引并询问继续或重新开始
- **作用**：避免长程任务（4-8 小时）因中断而从头执行，减少资源消耗

### 围栏（Fence）

围栏是 AET 的模块依赖保护机制，明确限定开发过程中允许修改的文件范围：

- **允许修改（✅）**：本次开发可以修改或新增的文件
- **禁止修改（❌）**：不应修改的关键文件，保护架构完整性
- **条件修改（🔵）**：满足特定条件才能修改

> 工作流控制 Agent 的执行顺序和确认点，围栏控制开发时 AI 能改哪些文件。两者是独立的：围栏由 Aet-Implement 在实现阶段首步（开发计划生成）自动生成在 DPS 中，你只需要在评审时确认；workflow 由你手动编辑配置文件。

### Workflow（工作流）

工作流定义了 Agent 之间的协作顺序和流程控制。关键要素包括：

- **Scenario（场景）**：feature、bugfix、release、project-analysis、config-setup 等。scenario 可声明 `automation: true` 启用无人值守模式（CI/CD 适用）
- **Hook（钩子）**：auto（自动进入下一阶段）或 confirm（需要用户确认）。`automation: true` 模式下 `confirm` 自动短路为 `auto` 行为，agent 不调 `question` 工具
- **Step（步骤）**：Agent 内部的细粒度工作单元

### SR-AR 需求分解

AET 采用 SR-AR 方法进行需求分解：

- **SR (System Requirement)**：系统需求，对应一个主要场景或功能域，一般 1-2 个
- **AR (Architecture Requirement)**：架构需求，属于某个具体系统元素

分解规则：

| 规则 | 说明 |
| :--- | :--- |
| **SR 数量** | 一般控制在 1-2 个，优先合并，避免过多 |
| **AR 数量** | 每个 SR 默认 1-2 个 AR，最多不超过 3 个 |
| **一对一原则** | 一个 AR 属于且仅属于一个模块 |
| **能力点** | 每个 AR 必须列出具体能力点 |

分解示例如下：

```
SR-1: 用户认证功能
  ├── AR-1.1: 用户登录（登录模块）
  └── AR-1.2: 用户注册（注册模块）
```

## 平台支持

AET 主平台为 OpenCode：

| 平台 | 支持方式 |
| :--- | :--- |
| **OpenCode** | 主平台，通过插件 `.opencode/plugins/aet.js` 集成 |

AET 通过 `platform-api.js` 与代码仓库平台交互，支持以下平台：

- GitHub
- GitLab
- Gitee
- AtomGit
- GitCode

## 核心技术特性

### 规范驱动开发（SDD）

AET 强制 AI 输出结构化文档（RAS → RDS → DPS），将设计方法最佳实践作为不可篡改的基准上下文，确保开发质量。

### 测试驱动开发（TDD）

实现阶段强制遵循"先测试后实现"逻辑：

```
红：写失败测试 → 绿：写最简代码 → 重构：优化代码 → 循环
```

### 人工确认点

关键节点支持用户确认，确保用户对重要决策有控制权：

| 节点 | 说明 |
| :--- | :--- |
| Checkpoint 检测 | 发现已存在进度时，询问继续或重新开始 |
| 设计评审前 | 确认需求分析是否通过 |
| 实现前 | 确认开发计划是否合理 |
| 功能验证 | 确认功能验证是否通过 |
| 实现完成 | 提示用户使用 `/aet-pr` 提交 PR |

### 用户介入场景

| 场景 | AET 行为 | 用户操作 |
| :--- | :--- | :--- |
| 新任务开始 | 认领 Issue，创建分支 | 等待 |
| 设计阶段 | 生成 RAS → RDS | 评审时确认 |
| 实现阶段 | 生成 DPS（开发计划）→ TDD 执行开发任务 + 功能验证 | 等待 |
| 任务中断后恢复 | 检测 Checkpoint | 选择继续或重新开始 |
| 实现完成 | 提示提交 PR | 手动执行 `/aet-pr` |
| 发现问题 | 报告错误 | 指导修复方向 |

### 阶段产物协作

各阶段产出物固化为 Markdown 文件，直接作为下一阶段的基础上下文：

```
Issue → RAS（需求分析）→ RDS（需求设计）→ DPS（开发计划）→ 实现代码 → 验证报告
```

## 设计原则

### 跨平台兼容性

Agent 的 system prompt 存储在 Skill 的 references 中，通过自然语言指导模型使用子 Agent，不受限于特定平台的 Agent 规范。这使得 AET 可在 OpenCode 平台运行。

### 渐进式披露

Skill 描述简洁明了，从简单开始，需要时再增加复杂度。核心包含 "When to use" 和 "Workflow" 两部分。

### 错误沉淀

平台 API 交互封装为脚本，遇到错误时总结经验并沉淀到脚本中，通过错误信息反馈给模型，减少模型上下文负担。

## 项目结构

AET 在项目中创建以下目录结构：

```
.
├── .aet/
│   ├── config.json              # 项目配置（codePlatform/codebaseSync等）
│   ├── features/
│   │   └── feature-{name}/
│   │       ├── issue.md         # Issue 内容副本
│   │       ├── design/          # 设计文档（RAS、RDS）
│   │       ├── implementation/  # 实现产物（开发计划 dev-plan、代码、测试）
│   │       ├── verification/    # 验证报告
│   │       └── tests/           # 测试代码
│   ├── project-analysis/        # 项目分析输出
│   └── templates/               # 工作流模板
├── agents/                      # Agent 定义
│   ├── router/                  # Aet-Router
│   ├── design/                  # Aet-Design
│   ├── implement/               # Aet-Implement
│   ├── test/                    # Aet-Test
│   ├── bugfix/                  # Aet-Bugfix
│   ├── doc/                     # Aet-Doc
│   ├── release/                 # Aet-Release
│   └── general/                 # Aet-General
├── skills/                      # 40 个 Skill 定义
├── commands/                    # 9 个命令定义
├── docs/                        # 项目文档
├── scripts/                     # 安装和配置脚本
│   ├── install.sh               # 一键安装脚本
│   ├── install.ps1              # Windows PowerShell 安装
│   ├── install.cmd              # Windows CMD 安装
│   └── templates/               # 配置模板
```
