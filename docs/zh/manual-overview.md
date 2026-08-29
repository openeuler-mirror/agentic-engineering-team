# AET 用户手册概览

> 更新日期：2026-06-01 | 软件版本：v1.1.0

AET (Agentic Engineering Team) 全流程 AI 辅助研发底座/引擎，人与 AI 协作，极简完成从需求创建、实现到维护。

## 文档清单

| 文档 | 说明 | 状态 |
| :--- | :--- | :--- |
| [quick-start.md](./quick-start.md) | 5分钟快速上手 — 从安装到执行第一个任务 | 新生成 |
| [installation.md](./installation.md) | 安装指南 — 系统要求、安装方法、配置初始化 | 新生成 |
| [architecture.md](./architecture.md) | 架构设计 — Agent 协作流程、核心概念、技术特性 | 已更新 |
| [commands.md](./commands.md) | 命令参考 — 全部 9 个命令使用说明，doc 支持 12 种文档类型 | 已更新 |
| [agent.md](./agent.md) | Agent 说明 — 预置 Agent、职责说明、配置方式 | 已更新 |
| [skill.md](./skill.md) | Skill 说明 — Skill 层级、预置 Skill、开发自定义 Skill | 已更新 |
| [module-dependency-protection.md](./module-dependency-protection.md) | 模块依赖保护 — 围栏机制、配置与突破流程 | 已有 |
| [workflow.md](./workflow.md) | 工作流配置 — 自定义工作流、配置确认点、平台类型 | 已更新 |
| [glossary.md](./glossary.md) | 术语表 — Agent、Skill、Fence 等核心概念速查 | 已有 |
| [troubleshooting.md](./troubleshooting.md) | 故障排查 — 常见问题、错误信息、日志收集 | 已有 |
| [qa.md](./qa.md) | 常见问答 — AET 使用中的高频问题与解答 | 新增 |

## 文档使用关系（由浅入深学习路径）

### 入门阶段

| 文档 | 适用场景 | 前置要求 |
| :--- | :--- | :--- |
| [quick-start.md](./quick-start.md) | 首次使用，5 分钟快速体验 | 无 |
| [installation.md](./installation.md) | 正式安装和配置 AET | 无 |
| [architecture.md](./architecture.md) | 了解 AET 整体架构和工作原理 | [installation.md](./installation.md) |
| [commands.md](./commands.md) | 掌握全部命令的详细用法 | [quick-start.md](./quick-start.md) |

### 进阶阶段

| 文档 | 适用场景 | 前置要求 |
| :--- | :--- | :--- |
| [agent.md](./agent.md) | 了解各智能体职责，选择合适的工作流 | [architecture.md](./architecture.md) |
| [skill.md](./skill.md) | 使用预置 Skill 或开发自定义 Skill | [agent.md](./agent.md) |
### 高级阶段

| 文档 | 适用场景 | 前置要求 |
| :--- | :--- | :--- |
| [module-dependency-protection.md](./module-dependency-protection.md) | 保护项目模块架构完整性 | [architecture.md](./architecture.md) |
| [workflow.md](./workflow.md) | 自定义工作流流程和确认点配置 | [agent.md](./agent.md)、[module-dependency-protection.md](./module-dependency-protection.md) |

### 参考阶段

| 文档 | 适用场景 | 前置要求 |
| :--- | :--- | :--- |
| [glossary.md](./glossary.md) | 核心术语速查 | 无 |
| [troubleshooting.md](./troubleshooting.md) | 问题诊断和解决 | 任意阶段 |

## 推荐阅读路径

```
首次使用
    │
    ├──→ quick-start.md（5分钟体验）
    │
    ├──→ installation.md（完整安装）
    │
    ├──→ architecture.md（理解架构）
    │
    ├──→ commands.md（掌握命令）
    │
    └──→ 开始使用 /aet-auto
            │
    遇到问题？└──→ troubleshooting.md
    想了解概念？└──→ glossary.md
    需要高级配置？└──→ workflow.md
    想开发 Skill？└──→ skill.md
```
