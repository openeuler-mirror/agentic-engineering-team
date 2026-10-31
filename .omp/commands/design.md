---
description: 设计智能体
disable-model-invocation: true
---

/design $ARGUMENTS

## 介绍

设计智能体

## 工作流概览

本工作流共 2 个阶段：

1. requirements_analysis（核心 skill: 无）
2. requirements_design（核心 skill: 无）

阶段切换：每完成一个阶段，通过 bash 执行 `aet workflow handover` 进入下一阶段。

## 启动工作流

请立即通过 bash 执行以下命令初始化本工作流（将 `<原始需求>` 替换为用户输入的初始需求描述）：

```
aet workflow init --name design --argument "<原始需求>"
```

收到 `workflow_started` 响应后，执行以下命令进入第一阶段：

```
aet workflow handover
```

后续每次执行 `aet workflow handover` 会注入下一阶段的任务 prompt，请遵照执行。每完成一个阶段，再次执行 `aet workflow handover` 进入下一阶段，直到工作流完成。

