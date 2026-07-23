---
name: aet-checking-docs
description: |
  检查文档质量的工具。当用户提到检查文档质量、审查文档、文档检查、文档审查、lint文档，
  或者提供文档URL/PR链接/本地文件路径要求检查时触发。支持文档通用性检查。
  输入类型：1) 可访问的HTML页面URL；2) AtomGit/GitCode PR链接（分析PR中的文档diff）；
  3) 本地文件夹路径。自动根据内容判断执行 通用+教程 或 通用+API 的检查组合。
---

# 文档质量检查器

## 输入解析

解析用户提供的输入，判断输入类型并获取内容：

| 输入类型 | 识别方式 | 获取内容方法 |
|---------|---------|-------------|
| HTML页面URL | 以 `http://` 或 `https://` 开头且非Git链接 | 使用 `WebFetch` 工具获取页面内容 |
| AtomGit/GitCode PR链接 | 包含 `atomgit.com` 的PR URL | 使用 AtomGit API + Token 获取PR内容 |
| 本地文件夹 | 本地路径 | 使用 `read` 工具读取文件内容 |

### PR链接处理流程

对于AtomGit/GitCode PR链接：

1. **检查环境变量** → 确认 `ATOMGIT_TOKEN` 环境变量已设置（用于API认证）
2. 解析PR链接获取仓库信息（owner）、仓库名（repo）和PR编号
3. 调用脚本 `scripts/fetch_pr.ps1` 或 `scripts/fetch_pr.sh` 获取PR详情和diff内容：
    - 脚本路径：`scripts/fetch_pr.ps1`（Windows）或 `scripts/fetch_pr.sh`（Linux/Mac）
    - **禁止通过命令行参数明文传递敏感信息，必须使用环境变量**
    - API格式: `https://api.atomgit.com/api/v5/repos/{owner}/{repo}/pulls/{pr_number}`
4. 识别diff中的文档文件（.md, .rst, .txt等）
5. 分析文档变更内容

**脚本用法：**

```powershell
# 首先设置环境变量（必须）
export ATOMGIT_TOKEN="your_private_token"  # Linux/Mac
$env:ATOMGIT_TOKEN="your_private_token"     # Windows

# 然后执行脚本
# Windows
.\scripts\fetch_pr.ps1 -Owner <owner> -Repo <repo> -PrNumber <pr_number>

# Linux/Mac
bash scripts/fetch_pr.sh <owner> <repo> <pr_number>
```

**Token获取方式**：

- AtomGit: https://atomgit.com/user_settings/apitokens
- 需要创建私人令牌，勾选 `repo` 权限
- 设置环境变量 `ATOMGIT_TOKEN` 以供脚本使用

---

## 检查规则

### 1. 通用性检查（所有文件必须通过）

根据规则文件 `rules/doc_general_rules.md` 检查所有文件。


### 2. 生成并保存报告

汇总所有检查结果，按照 "输出格式" 生成 Markdown 报告保存到本地，在 "基本信息" 中列出本次使用的规则文件，告知用户路径。

- 多输入或混合输入都合并到 `report_{日期}.md`。
- 如果报告文件已存在，必须先提示用户确认是否覆盖，不可直接覆盖。
- 报告内按输入源分章节（如 `## PR #1234`, `## 本地文件: xxx.md`）。
- 默认保存到当前目录，或用户指定路径。


## 输出格式

生成Markdown格式的检查报告。


### 报告结构

```markdown
# 文档质量检查报告

## 基本信息

| 项目 | 内容 |
|------|------|
| 检查时间 | [时间戳] |
| 输入类型 | [HTML页面/PR链接/本地文件] |
| 输入来源 | [具体URL或路径] |
| 使用规则 | [本次使用的规则文件列表，如 `doc_general_rules.md`] |

## 检查结果概览

| 问题等级 | 数量 |
|----------|------|
| 严重问题 | X |
| 一般问题 | X |
| 建议优化 | X |
| **总计** | **X** |

## 详细问题列表

- 以下仅给出输出格式参考，编号以规则文件中列举的实际编号为准。
- 本章节的问题分类不需要给出具体的规则文件来源。

### 通用性问题

| 编号 | 问题标题 | 优先级 | 位置 | 问题描述 | 建议修复 |
|------|----------|--------|------|----------|----------|
| G-L-01 | 单词拼写问题 | 严重 | 第X行 | XX单词拼写错误 | XX单词应改为XX |
| G-U-01 | 使用被动语态 | 一般 | 第X行 | XXX这句话使用了被动语态 | 建议将这句话改为XXX |

## 改进建议

1. [🔴高] 建议...
2. [🟠中] 建议...
3. [🟢低] 建议...
```


## 注意事项

- 对于PR链接，会分析PR中的文档变更部分
- 检查过程会尽量获取页面完整内容
- 图片使用本地路径时无法验证，会标记为"需人工确认"