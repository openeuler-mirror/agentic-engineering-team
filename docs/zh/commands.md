# AET 命令参考

> 文档版本：v1.0 | 更新日期：2026-05-27 | 软件版本：v1.1.0

AET 提供 10 个斜杠命令，覆盖从项目初始化到发布的全流程。所有命令在 OpenCode 聊天窗口中以 `/aet-` 前缀输入。

## 命令总览

| 命令 | 功能 | 是否需要 Token |
| :--- | :--- | :--- |
| `/aet-init` | 初始化项目配置 | 否 |
| `/aet-auto <URL>` | 自动化功能开发工作流 | 是 |
| `/aet-bugfix <描述>` | Bug 修复工作流 | 否 |
| `/aet-pr` | PR 管理 | 是 |
| `/aet-issue` | Issue 管理 | 是 |
| `/aet-release` | Release 管理 | 是 |
| `/aet-doc` | 文档生成 | 否 |
| `/aet-design` | 直接进入设计智能体 | 否 |
| `/aet-implement` | 直接进入实现智能体 | 否 |

---

## `/aet-init` — 项目初始化

初始化项目配置，生成 `.aet/config.json`。

**用途：** 首次使用 AET 时必须执行一次。

**使用方式：**

```
/aet-init
```

**配置向导会要求提供：**

- Fork 源仓库信息
- 访问令牌（Token）
- 上游仓库信息

**执行效果：**

- 自动检测 Git 远程仓库信息
- 读取全局配置中的 Token
- 生成 `.aet/config.json`

---

## `/aet-auto` — 自动化开发工作流

AET 的核心命令，从 Issue 到 PR 的完整开发流程。

**用途：** 认领 Issue 并执行完整开发流程。

**使用方式：**

```
/aet-auto https://atomgit.com/owner/repo/issues/123
```

**自动完成以下阶段：**

| 阶段 | 执行内容 | 用户确认点 |
| :--- | :--- | :--- |
| 1. 认领 Issue | 创建特性分支，防止重复工作 | — |
| 2. Checkpoint 检测 | 检查是否存在已中断的进度 | 询问继续或重新开始 |
| 3. 需求分析 | 分析 Issue 内容，提取需求 | 需求分析评审 |
| 4. 需求设计 | 模块划分、接口设计、DFX 策略 | 需求设计评审 |
| 5. 开发计划 | 任务分解、围栏配置 | 开发计划评审 |
| 6. TDD 开发 | 测试驱动开发实现功能 | — |
| 7. 功能验证 | 验证代码质量和需求满足度 | 功能验证确认 |
| 8. PR 提交提示 | 提示用户使用 `/aet-pr` 提交 | — |

**项目分析模式：**

```
/aet-auto 项目分析
```

自动分析项目架构，生成以下文档到 `.aet/project-analysis/`：

| 文档 | 说明 |
| :--- | :--- |
| `Overview.md` | 项目概览 |
| `Modules.md` | 模块清单与依赖矩阵 |
| `Architecture.md` | 架构概览 |
| `modules/` | 各模块详细分析 |

---

## `/aet-bugfix` — Bug 修复工作流

**用途：** 结构化诊断和修复 Bug。

**使用方式：**

```bash
# 使用 Issue URL
/aet-bugfix https://atomgit.com/owner/repo/issues/456

# 直接描述 Bug
/aet-bugfix 应用崩溃 when user clicks cancel button
```

**工作流程：**

| 步骤 | 说明 |
| :--- | :--- |
| 1. 问题诊断 | 分析错误原因和影响范围 |
| 2. 修复规划 | 生成修复方案 |
| 3. TDD 修复 | 先写测试，再修复代码 |
| 4. 验证测试 | 确保修复有效 |

---

## `/aet-pr` — PR 管理

**用途：** 管理 Pull Request（需要平台 Token）。

**使用方式：**

```bash
/aet-pr 为特性分支创建 PR
/aet-pr 更新 PR 状态
/aet-pr 查看所有打开的 PR
/aet-pr 查看 PR 的评论和审查
```

**前条件：** 需要先执行 `/aet-init` 配置平台凭证。

---

## `/aet-issue` — Issue 管理

**用途：** 管理 Issue（需要平台 Token）。

**使用方式：**

```bash
/aet-issue 创建一个 Issue：用户登录功能
/aet-issue 认领 https://atomgit.com/owner/repo/issues/123
/aet-issue 查看 Issue 123 的详情
/aet-issue 将 Issue 123 状态更新为进行中
```

---

## `/aet-release` — Release 管理

**用途：** 自动化版本发布流程。

**使用方式：**

```bash
# 完整流程（自动检测变更、推断版本号）
/aet-release 发布新版本

# 原子操作
/aet-release 创建 v1.2.0        # 直接创建指定版本
/aet-release 删除 v1.1.0        # 删除 Release
/aet-release 列出所有release    # 查询列表
/aet-release 查询 v1.0.0        # 查询详情
```

**自动完成：**

- 检测上次 Release 后的代码变更
- 分析 commit 类型（feat/fix/docs 等）
- 推断版本号（major/minor/patch）
- 生成 Release Notes
- 创建平台 Release

---


## `/aet-doc` — 文档生成

**用途：** 统一文档生成入口，支持 13 种文档类型。

**使用方式：**

```bash
/aet-doc 生成 README              # 生成 README 文档
/aet-doc 生成用户手册              # 生成用户手册
/aet-doc 生成技术分析              # 生成技术分析文档
/aet-doc 生成幻灯片               # 生成 HTML 幻灯片
/aet-doc 生成信息图                # 生成技术信息图
/aet-doc 生成实践案例              # 生成实践案例/教程
/aet-doc 根据 <Issue URL> 生成手册 # 从 Issue 内容生成手册
/aet-doc 生成 Python API 文档   # 生成 API 文档/docstring
/aet-doc 翻译 <路径>            # 文档翻译（默认中译英）
/aet-doc 检查文档质量 <路径/URL> # 文档质量检查
/aet-doc 构建 mdbook 文档       # 从 Markdown 构建 HTML 文档站
/aet-doc 生成问答 <路径/URL>     # 生成问答对/Q&A/FAQ（支持本地路径或远程仓库）
/aet-doc 建个 wiki <路径/URL>     # 构建可查询的 Wiki 知识库
/aet-doc 生成 GIF <图片/视频路径>  # 生成 GIF（图片拼接/视频转换/抽帧/裁剪）
```

**支持的文档类型：**

| 类型 | 说明 |
| :--- | :--- |
| **README 文档** | 生成中英文双语 README |
| **用户手册** | 安装指南、功能教程、故障排查 |
| **技术分析** | 深度技术原理分析文档 |
| **HTML 幻灯片** | 可交互的 HTML 幻灯片 |
| **技术信息图** | "一图看懂 XXX"长图 |
| **实践案例** | 项目示例和教程文档 |
| **Python API 文档** | 函数/类/模块的 docstring 与 API 参考 |
| **文档翻译** | 中英互译（全量/增量/同步三种模式） |
| **文档质量检查** | 通用性检查，支持 URL/PR/本地路径 |
| **mdbook 文档构建** | 从 Markdown 构建可浏览的 HTML 文档站 |
| **问答对生成** | 从本地文件、仓库或远程 Git URL 生成带来源溯源的中文 Q&A 对 |
| **wiki 知识库构建** | 从任意内容构建可查询的轻量级个人 Wiki |
| **GIF 动图生成** | 图片拼接成 GIF、GIF 抽帧/裁剪、视频转 GIF |

---

## `/aet-design` — 直接进入设计智能体

**用途：** 直接调用 Aet-Design 智能体执行设计阶段。

## `/aet-implement` — 直接进入实现智能体

**用途：** 直接调用 Aet-Implement 智能体执行实现阶段。
