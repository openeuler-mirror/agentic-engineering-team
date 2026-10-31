---
description: 修复智能体
disable-model-invocation: true
---

/bugfix $ARGUMENTS

## 介绍

修复智能体

## 工作流概览

本工作流共 2 个阶段：

1. diagnose（核心 skill: 无）
2. fix（核心 skill: 无）

阶段切换：每完成一个阶段，通过 bash 执行 `aet workflow handover` 进入下一阶段。



