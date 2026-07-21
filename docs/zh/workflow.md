# 工作流配置与自定义

> 文档版本：v1.0 | 更新日期：2026-05-27 | 软件版本：v1.1.0

## 概述

AET 支持灵活的工作流配置，允许用户自定义 Agent 执行顺序、配置用户确认点（Hook）以及扩展自定义 Skill。

## 配置来源与优先级

工作流配置有三个来源，按优先级从低到高排列：

| 优先级 | 来源 | 路径 |
| :--- | :--- | :--- |
| 低 | 全局工作流模板 | `~/.aet/templates/workflow.json` |
| 中 | 项目工作流模板 | `.aet/templates/workflow.json` |
| 高 | 项目配置文件 | `.aet/config.json` 的 `scenarios`/`hooks`/`agents` 字段 |

**合并规则：** 高优先级配置中同名的 `scenarios`、`hooks`、`agents` 会覆盖低优先级的配置。

> **Note：** `.aet/config.json` 的顶层结构为 `{ "version", "codePlatform", ... }`，scenarios/hooks/agents 属于 `codePlatform` 层下的可选字段。系统自动合并：项目配置 → 工作流模板 → 全局配置。

### 平台类型配置

项目配置中的 `codePlatform.platform.type` 指定代码托管平台类型：

```json
{
  "codePlatform": {
    "platform": { "type": "gitcode" }
  }
}
```

支持以下平台类型：`gitcode`、`github`、`gitlab`、`gitee`、`atomgit`。对应 Token 存储在全局配置 `~/.aet/config.json.platforms` 中。

## 配置参考

全局模板、项目模板和项目配置中的工作流字段使用统一的 JSON 格式。顶层结构如下：

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

### 场景配置

场景定义了不同类型的开发流程，每个场景包含一个 Agent 工作流编排：

```json
{
  "scenarios": {
    "feature": {
      "name": "功能开发流程",
      "description": "从设计到实现、验证、PR 提交提示的完整流程",
      "workflow": [
        { "agent_id": "aet-design", "before": null, "after": "confirm" },
        { "agent_id": "aet-implement", "before": null, "after": "confirm" }
      ]
    },
    "bugfix": {
      "name": "Bug 修复流程",
      "description": "从问题诊断到修复、验证、PR 提交提示的流程",
      "workflow": [
        { "agent_id": "aet-bugfix", "before": null, "after": "confirm" }
      ]
    }
  }
}
```

#### 字段说明

| 字段 | 说明 |
| :--- | :--- |
| `agent_id` | Agent 标识，对应 `agents` 中的定义 |
| `before` | 该阶段执行前的钩子（可为 `null`） |
| `after` | 该阶段执行后的钩子（可为 `null` 或 hook 名称） |

### 钩子配置

钩子控制 Agent 执行流程中的用户交互行为，支持两种类型：

**auto（自动）**

```json
{
  "auto": {
    "description": "自动进入下一阶段",
    "promptTemplate": null,
    "options": null
  }
}
```

设置后，Agent 将在该阶段完成后自动进入下一阶段，无需用户确认。

**confirm（确认）**

```json
{
  "confirm": {
    "description": "请用户确认该阶段任务是否完成",
    "promptTemplate": "你已结束输出，请确认当前阶段是否全部执行完成。\n\n{description}\n{options}\n",
    "options": [
      { "label": "完成", "value": "approve" },
      { "label": "需要修改", "value": "reject" }
    ]
  }
}
```

设置后，Agent 将在该阶段完成后暂停，等待用户确认：

- **完成**：进入下一阶段
- **需要修改**：重新执行当前阶段

**自定义钩子**

可以创建自定义钩子满足特定需求：

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

### Agent 步骤配置

配置每个 Agent 内部的步骤工作流：

```json
{
  "agents": {
    "aet-design": {
      "name": "Aet-Design",
      "description": "设计智能体",
      "workflow": [
        {
          "step_id": "requirements_analysis",
          "description": "需求分析规范 (RAS)",
          "before": null,
          "after": null
        },
        {
          "step_id": "requirements_analysis_review",
          "description": "需求分析评审",
          "before": null,
          "after": "confirm"
        },
        {
          "step_id": "requirements_design",
          "description": "需求设计规范 (RDS)",
          "before": null,
          "after": null
        },
        {
          "step_id": "requirements_design_review",
          "description": "需求设计评审",
          "before": null,
          "after": "confirm"
        },
        {
          "step_id": "development_plan",
          "description": "开发计划 (SDD)",
          "before": null,
          "after": null
        },
        {
          "step_id": "development_plan_review",
          "description": "开发计划评审",
          "before": null,
          "after": "confirm"
        },
        {
          "step_id": "commit",
          "description": "提交设计文档",
          "before": null,
          "after": null
        }
      ]
    }
  }
}
```

## 内置场景

AET 预置了以下场景：

| 场景 ID | 名称 | 说明 |
| :--- | :--- | :--- |
| `feature` | 功能开发流程 | 从设计到实现、验证、PR 提交提示的完整流程 |
| `bugfix` | Bug 修复流程 | 从问题诊断到修复、验证、PR 提交提示的流程 |
| `design-refine` | 需求变更流程 | 基于已有设计文档进行需求变更和迭代 |
| `config-setup` | 配置初始化流程 | 项目配置初始化 |
| `project-analysis` | 项目分析流程 | 分析项目架构和模块依赖 |
| `release` | 发布管理流程 | 版本发布和 Release Notes 生成 |
| `aet-prd` | PRD 生成流程 | 6 阶段 PRD 生成 |

## 使用示例

### 全自动流程

将所有 `after` 设置为 `auto` 实现全自动执行：

```json
{
  "scenarios": {
    "auto-feature": {
      "name": "全自动功能开发",
      "description": "无需用户确认的全自动流程",
      "workflow": [
        { "agent_id": "aet-design", "before": null, "after": "auto" },
        { "agent_id": "aet-implement", "before": null, "after": "auto" }
      ]
    }
  }
}
```

### 增加确认点

```json
{
  "scenarios": {
    "review-feature": {
      "name": "严格审查功能开发",
      "description": "含发布确认的严格流程",
      "workflow": [
        { "agent_id": "aet-design", "before": null, "after": "confirm" },
        { "agent_id": "aet-implement", "before": null, "after": "confirm" },
        { "agent_id": "aet-release", "before": null, "after": "confirm" }
      ]
    }
  }
}
```

### 调整 Agent 顺序

```json
{
  "scenarios": {
    "test-first": {
      "name": "测试优先开发流程",
      "description": "先测试设计再实现的流程",
      "workflow": [
        { "agent_id": "aet-design", "before": null, "after": "confirm" },
        { "agent_id": "aet-test", "before": null, "after": "confirm" },
        { "agent_id": "aet-implement", "before": null, "after": "confirm" }
      ]
    }
  }
}
```

### 创建自定义工作流

以下示例创建一个包含安全检查 Agent 的自定义工作流。

**步骤 1：创建自定义 Skill**

在 `skills/` 目录下创建 `my-security-check/SKILL.md`：

```
skills/
└── my-security-check/
    └── SKILL.md
```

**步骤 2：配置自定义 Agent 和场景**

在 `.aet/templates/workflow.json` 或 `.aet/config.json` 中添加：

```json
{
  "version": "1.0",
  "agents": {
    "my-security-check": {
      "name": "my-security-check",
      "displayName": "安全检查Agent",
      "description": "执行自定义安全检查",
      "workflow": [
        {
          "step_id": "security_scan",
          "name": "安全扫描",
          "description": "使用安全审计 skill 执行安全扫描",
          "before": null,
          "after": "confirm",
          "skill": "my-security-check"
        }
      ]
    }
  },
  "scenarios": {
    "secure-code": {
      "name": "安全代码开发流程",
      "description": "包含安全检查的开发流程",
      "workflow": [
        { "agent_id": "aet-design", "before": null, "after": "confirm" },
        { "agent_id": "aet-implement", "before": null, "after": "confirm" },
        { "agent_id": "my-security-check", "before": null, "after": null }
      ]
    }
  }
}
```

**步骤 3：使用自定义工作流**

在 OpenCode 中执行：

```
/aet-auto 使用 secure-code 场景开发登录功能
```

> **Note：** 自定义场景的触发方式取决于 AET 的意图识别能力。也可以通过修改已有场景的 `workflow` 来覆盖默认行为。

**其他自定义场景：**

简化开发流程（跳过实现阶段确认）：

```json
{
  "scenarios": {
    "simple-code": {
      "name": "简化代码开发流程",
      "description": "跳过实现阶段确认的快速流程",
      "workflow": [
        { "agent_id": "aet-design", "before": null, "after": "confirm" },
        { "agent_id": "aet-implement", "before": null, "after": null }
      ]
    }
  }
}
```

严格审查流程（全部确认）：

```json
{
  "scenarios": {
    "strict-code": {
      "name": "严格代码开发流程",
      "description": "每个步骤都需要用户确认的严格流程",
      "workflow": [
        { "agent_id": "aet-design", "before": null, "after": "confirm" },
        { "agent_id": "aet-implement", "before": null, "after": "confirm" }
      ]
    }
  }
}
```

## 最佳实践

### 确认点设置建议

| 场景 | 建议 |
| :--- | :--- |
| 快速验证想法 | 使用 `auto` 跳过所有确认点 |
| 正式项目开发 | 保留 `confirm` 确认点，在设计评审和实现完成时确认 |
| 团队协作 | 在关键阶段交付物（RAS、RDS、SDD）处设置确认点 |
| 新手使用 | 保留默认配置，充分理解流程后再自定义 |

### 调试建议

- 修改配置后需重新启动 OpenCode 或重新加载配置
- 确保 JSON 格式正确，可以使用 JSON 校验工具验证
- 从简单修改开始（如调整确认点），逐步增加自定义程度
