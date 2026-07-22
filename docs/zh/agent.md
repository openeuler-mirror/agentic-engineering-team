# Agent 说明

> 文档版本：v1.0 | 更新日期：2026-05-27 | 软件版本：v1.1.0

## 概述

Agent（智能体）是 AET 中专门负责开发流程特定阶段的 AI 助手。每个 Agent 有独立的系统提示词，通过多 Agent 协作完成完整的开发流程。

## 预置 Agent

AET 预置了以下 Agent：

| Agent | 职责 | 目录 |
| :--- | :--- | :--- |
| **Aet-Router** | 核心协调者 — 理解需求、认领 Feature、路由工作流、管理 Checkpoint | `agents/router/` |
| **Aet-Design** | 设计智能体 — 需求分析 (RAS)、需求设计 (RDS) | `agents/design/` |
| **Aet-Implement** | 实现智能体 — 开发计划 (DPS)、TDD 驱动开发、代码实现、功能验证 | `agents/implement/` |
| **Aet-Test** | 测试智能体 — 集成测试、性能测试（待扩展） | `agents/test/` |
| **Aet-Bugfix** | 修复智能体 — Bug 诊断、修复规划 | `agents/bugfix/` |
| **Aet-Doc** | 文档生成 — README、用户手册、技术分析、幻灯片、信息图、实践案例 | `agents/doc/` |
| **Aet-Release** | Release 管理 — 版本发布、Release Notes 生成 | `agents/release/` |
| **Aet-General** | 通用智能体 — 通用任务执行 | `agents/general/` |

## Agent 详细说明

### Aet-Router（路由智能体）

**职责：** 智能体开发团队的核心协调者。

**功能：**

- 理解用户需求，分析用户想要完成的任务
- 认领 Feature，创建特性分支，更新 Issue 状态
- 路由到合适的工作流（设计-实现、Bug 修复等）
-  Checkpoint 检测和管理
- 协调多阶段开发工作流执行

**工作流协调顺序：**

```
设计阶段 → 实现阶段 → 验证阶段 → 完成阶段
```

**Checkpoint 管理：**

- 支持断点恢复，检查 `.aet/checkpoint/` 目录中的 Checkpoint 状态
- 询问用户是继续还是重新开始

### Aet-Design（设计智能体）

**职责：** 将需求转化为详细的设计文档。

**执行步骤（按顺序）：**

| # | 步骤 | 输出 |
| :--- | :--- | :--- |
| 1 | 需求分析 | RAS 文档（需求分析规范） |
| 2 | 需求评审 | 通过/不通过 |
| 3 | 需求设计 | RDS 文档（需求设计规范） |
| 4 | 需求设计评审 | 通过/不通过 |
| 5 | 提交文档 | Git 提交 |

**两份核心设计文档：**

| 文档 | 全称 | 说明 |
| :--- | :--- | :--- |
| **RAS** | Requirements Analysis Specification | 需求分析规范 — 需求背景、目标、范围、详细需求 |
| **RDS** | Requirements Design Specification | 需求设计规范 — 模块划分、接口设计、DFX 策略、SR-AR 分解 |

### Aet-Implement（实现智能体）

**职责：** 根据设计文档执行开发计划生成、TDD 开发并完成功能验证。

**执行步骤（按顺序）：**

| # | 步骤 | 输出 |
| :--- | :--- | :--- |
| 1 | 开发计划 | DPS 文档（开发任务分解、围栏配置、具体实现步骤） |
| 2 | 计划评审 | 通过/不通过 |
| 3 | TDD 开发 | 测试代码 + 实现代码 |
| 4 | 功能验证 | 验证报告 |
| 5 | 提示提交 PR | 提示用户执行 `/aet-pr` |

**执行流程：**

1. 生成开发计划（如已存在且与设计一致可复用）
2. 读取设计文档和实现计划
3. 对每个任务执行 TDD 循环：
   - 编写失败的测试
   - 验证测试失败
   - 编写最简代码通过测试
   - 验证测试通过
   - 提交代码
4. 功能验证：
   - 检查所有必需功能是否已实现
   - 验证接口是否符合设计
   - 将每个需求映射到实现代码
   - 生成验证报告
5. 提示用户使用 `/aet-pr` 提交 PR

**TDD 铁律：**

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

### Aet-Test（测试智能体）

**当前状态：** 框架保留，职责待扩展。

**功能验证职责：** 由 Aet-Implement 承担。

**未来扩展方向：**

- 集成测试：跨模块、跨服务的集成测试
- 性能测试：负载测试、压力测试、性能基准
- 安全测试：安全扫描、漏洞检测
- 端到端测试：完整用户场景测试

### Aet-Bugfix（修复智能体）

**职责：** 结构化 Bug 修复。

**执行流程：**

1. 问题诊断（`aet-diagnosing-bug`）— 分析错误原因和影响范围
2. 修复规划（`aet-implementing-requirement`）— 生成修复方案
3. TDD 修复（`test-driven-development`）— 先写测试，再修复代码
4. 验证测试 — 确保修复有效

### Aet-Doc（文档生成智能体）

**职责：** 统一文档生成。

**支持的文档类型：**

- README 文档
- 用户手册
- 技术分析文档
- HTML 幻灯片
- 技术信息图
- 实践案例/教程

### Aet-Release（Release 管理智能体）

**职责：** 自动化版本发布。

**功能：**

- 检测上次 Release 后的代码变更
- 分析 commit 类型（feat/fix/docs 等）
- 推断版本号（major/minor/patch）
- 生成 Release Notes
- 创建平台 Release

## Agent 配置

### 配置文件结构

Agent 的定义文件位于 `agents/{agent-name}/index.js`，系统提示词位于 `agents/{agent-name}/prompts/main.md`。

Agent 通过 `agents/index.js` 注册表统一管理：

```javascript
// Agent 注册示例
{
  agent_id: "aet-design",
  name: "Aet-Design",
  description: "设计智能体 — 需求分析、架构设计",
  prompt: "prompts/main.md",
  steps: [
    "requirements_analysis",
    "requirements_analysis_review",
    "requirements_design",
    "requirements_design_review",
    "commit"
  ]
}
```

### 工作流中的 Agent 编排

在工作流模板中配置 Agent 的执行顺序和确认点：

```json
{
  "workflow": [
    { "agent_id": "aet-design", "before": null, "after": "confirm" },
    { "agent_id": "aet-implement", "before": null, "after": "confirm" }
  ]
}
```

更多详情请参阅 [工作流配置](./workflow.md)。

## Agent 协作示例

以 `/aet-auto` 为例，Agent 协作流程如下：

```
用户输入 Issue URL
       │
       ▼
Aet-Router：认领 Feature → 检查 Checkpoint → 意图识别
       │
       ▼
Aet-Design：需求分析 → 评审 → 需求设计 → 评审 → 提交文档
       │
       ▼
Aet-Implement：开发计划 → 评审 → TDD 开发 → 功能验证 → 提示提交 PR
       │
       ▼
用户手动执行 /aet-pr 提交 PR
```
