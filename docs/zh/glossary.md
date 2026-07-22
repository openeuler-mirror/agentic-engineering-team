# AET 术语表

> 文档版本：v1.0 | 更新日期：2026-05-27

## 核心概念

| 术语 | 说明 |
| :--- | :--- |
| **Agent（智能体）** | 专门负责开发流程特定阶段的 AI 助手。AET 预置 8 个 Agent：Router、PRD、Design、Implement、Test、Bugfix、Doc、Release。 |
| **Skill（技能）** | AET 的核心功能单元，分为命令 Skill（用户入口）、编排 Skill（协调子流程）、原子 Skill（单一职责）三个层级。 |
| **Scenario（场景）** | 不同类型的开发流程，如 feature（功能开发）、bugfix（Bug修复）、release（版本发布）。 |
| **Workflow（工作流）** | Agent 之间的协作流程定义。由多个 Agent 顺序执行，每个 Agent 前后可配置 Hook。 |
| **Hook（钩子）** | 控制 Agent 执行流程的机制。`auto` 自动进入下一阶段，`confirm` 需要用户确认。 |
| **Step（步骤）** | Agent 内部的细粒度工作单元。每个 Agent 可包含多个 Step。 |
| **Task（任务）** | 实现计划中的细粒度开发工作任务。 |

## 核心机制

| 术语 | 说明 |
| :--- | :--- |
| **Checkpoint（检查点）** | 任务状态快照机制，存储在 `.aet/checkpoint/` 目录。支持长程任务中断后从断点继续执行。 |
| **Fence（围栏）** | 模块依赖保护机制。通过 ✅ 允许修改 / ❌ 禁止修改 / 🔵 条件修改 三种配置，限定 AI 的修改范围。 |
| **SDD（规范驱动开发）** | Specification-Driven Development，强制 AI 输出结构化设计文档，将设计方法最佳实践作为基准上下文。 |
| **TDD（测试驱动开发）** | Test-Driven Development，实现阶段强制遵循"红（写失败测试）→ 绿（写最简代码）→ 重构（优化代码）"循环。 |

## 设计文档

| 术语 | 全称 | 说明 |
| :--- | :--- | :--- |
| **RAS** | Requirements Analysis Specification | 需求分析规范。包含需求背景、目标、范围、详细需求。由 Aet-Design 在设计阶段生成。 |
| **RDS** | Requirements Design Specification | 需求设计规范。包含模块划分、接口设计、DFX 策略、SR-AR 分解。由 Aet-Design 在设计阶段生成。 |
| **DPS** | Development Plan Specification | 开发计划规范。对应 `dev-plan.md`。包含开发任务分解、围栏配置、具体实现步骤。由 Aet-Implement 在实现阶段首步生成。 |

## 平台与集成

| 术语 | 说明 |
| :--- | :--- |
| **OpenCode** | AET 主运行平台，通过插件 `.opencode/plugins/aet.js` 集成。 |

## 代码仓库平台

AET 支持以下代码仓库平台：
- GitHub
- GitLab
- Gitee
- AtomGit
- GitCode

## 其他

| 术语 | 说明 |
| :--- | :--- |
| **PRD** | Product Requirements Document，产品需求文档。AET 支持 6 阶段 PRD 生成流程。 |
| **FR** | Feature Requirement，功能需求。PRD 流程中定义的单个功能需求项。 |
| **DFX** | Design for X，一组质量属性设计策略（可用性、安全性、可扩展性、可测试性）。 |
| **SR** | System Requirement，系统需求。对应一个主要场景或功能域。 |
| **AR** | Architecture Requirement，架构需求。属于某个具体系统元素的架构需求。 |
