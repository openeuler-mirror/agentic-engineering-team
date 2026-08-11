# AET 5分钟快速上手

> 文档版本：v1.0 | 更新日期：2026-05-27 | 软件版本：v1.1.0

本文档带你从零开始，5 分钟内体验 AET 的完整开发流程。

---

## 前置条件

- **Git** — 版本管理
- **Node.js >= 14.0.0** — AET 运行环境
- **npm** — 依赖管理
- **OpenCode** — AI 编码平台

验证环境：

```bash
git --version
node --version
npm --version
```

---

## 第1步：一键安装 AET

在终端执行：

```bash
curl -fsSL https://raw.atomgit.com/openeuler/agentic-engineering-team/raw/master/scripts/install.sh | bash
```

安装脚本自动完成：下载源码 → 创建插件 → 复制技能 → 安装依赖 → 可选安装知识图谱工具 → 配置 Token（可选）。

> **Tip：** Token 配置可跳过，不影响核心功能。后续可通过 `/aet-init` 补充。

---

## 第2步：进入项目目录

进入你要开发的项目目录（确保是 Git 仓库）：

```bash
cd your-project
```

---

## 第3步：初始化项目配置

在 OpenCode 中执行：

```
/aet-init
```

配置向导自动检测远程仓库信息，生成 `.aet/config.json`。

---

## 第4步：执行第一个开发任务

找一个 Issue URL，执行自动化开发工作流：

```
/aet-auto https://atomgit.com/owner/repo/issues/123
```

AET 将自动完成：

1. 认领 Issue，创建特性分支
2. 分析需求，生成设计文档（RAS → RDS）
3. 生成开发计划（DPS）
4. TDD 方式实现功能代码
5. 功能验证
6. 提示你使用 `/aet-pr` 提交 PR

期间 AET 会在关键节点（设计评审、开发计划评审）暂停等待你确认。

---

## 第5步：提交 PR（可选）

开发完成后，提交 Pull Request：

```
/aet-pr 创建 PR
```

---

## 完成 🎉

你已体验 AET 的完整开发流程！接下来可参考：

| 目的 | 文档 |
| :--- | :--- |
| 了解各命令的详细用法 | [命令参考](./commands.md) |
| 理解 AET 架构原理 | [架构设计](./architecture.md) |
| 自定义工作流 | [工作流配置](./workflow.md) |
| 遇到问题 | [故障排查](./troubleshooting.md) |
