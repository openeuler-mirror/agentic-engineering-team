# Skill 说明

> 文档版本：v1.0 | 更新日期：2026-05-27 | 软件版本：v1.1.0

## 概述

Skill（技能）是 AET 的核心功能单元。每个 Skill 定义为 `SKILL.md` 文件，描述其用途、触发场景和工作流程。AET 预置多个 Skill，分为三个层级。

## Skill 层级结构

| 层级 | 说明 | 示例 |
| :--- | :--- | :--- |
| **命令 Skill** | 用户入口，通过斜杠命令触发 | `/aet-init`, `/aet-auto`, `/aet-bugfix` |
| **编排 Skill** | 协调子流程，组合多个 Skill | `feature-management`, `aet-reviewing-code` |
| **原子 Skill** | 执行单一职责，最小的功能单元 | `aet-analyzing-project`, `test-driven-development` |

## 预置 Skill 清单

### 分析与设计

| Skill | 层级 | 用途 |
| :--- | :--- | :--- |
| `aet-req-analysis` | 编排 | 需求分析 |
| `aet-req-design` | 编排 | 需求设计 |
| `aet-analyzing-project` | 原子 | 项目架构分析 |

### 实现

| Skill | 层级 | 用途 |
| :--- | :--- | :--- |
| `aet-implementing-requirement` | 编排 | 执行设计规范为可工作代码 |
| `test-driven-development` | 编排 | TDD 工作流（红-绿-重构） |

### 测试与质量

| Skill | 层级 | 用途 |
| :--- | :--- | :--- |
| `aet-reviewing-code` | 编排 | 综合代码审查 |
| `aet-reviewing-pr` | 原子 | PR 审查 |

### 代码审查

| Skill | 层级 | 用途 |
| :--- | :--- | :--- |
| `aet-checking-bad-smell` | 原子 | 代码坏味道检测 |
| `aet-checking-implementation` | 原子 | 实现质量检查 |
| `aet-diagnosing-bug` | 原子 | Bug 诊断分析 |

### 文档生成

| Skill | 层级 | 用途 |
| :--- | :--- | :--- |
| `aet-generating-readme` | 编排 | 生成 README 文档 |
| `aet-generating-manual` | 编排 | 生成用户手册 |
| `aet-generating-technical-analysis` | 编排 | 生成技术分析文档 |
| `aet-generating-html-slides` | 原子 | 生成 HTML 幻灯片 |
| `aet-generating-technical-infographic` | 原子 | 生成技术信息图 |
| `aet-generating-practice-case` | 编排 | 生成实践案例/教程 |
| `aet-generating-python-api` | 编排 | 生成 Python API 文档/docstring |
| `aet-generating-qa` | 编排 | 生成问答对/Q&A/FAQ |
| `wiki-builder` | 编排 | 从任意内容构建可查询的轻量级个人 Wiki |
| `aet-doc-translator` | 原子 | 文档翻译（中英互译，全量/增量/同步） |
| `aet-checking-docs` | 原子 | 文档质量检查 |
| `aet-building-doc-mdbook` | 原子 | mdbook 文档构建 |
| `aet-generating-gif` | 原子 | GIF 动画处理 |

### PR/Issue/Release

| Skill | 层级 | 用途 |
| :--- | :--- | :--- |
| `aet-operating-pr` | 编排 | PR 管理和创建 |
| `aet-operating-issues` | 编排 | Issue 管理 |
| `aet-operating-release` | 编排 | Release 管理 |

### 安全与 CVE

| Skill | 层级 | 用途 |
| :--- | :--- | :--- |
| `aet-researching-cve` | 编排 | CVE 安全漏洞情报聚合 |
| `aet-locating-cve-fix` | 原子 | CVE 补丁定位诊断 |
| `aet-planning-cve-backport` | 编排 | CVE 补丁反向移植规划 |
| `aet-verifying-cve-fix` | 编排 | CVE 补丁验证（QEMU 内核） |
| `aet-checking-security` | 原子 | 安全漏洞检查 |

### 配置与交互

| Skill | 层级 | 用途 |
| :--- | :--- | :--- |
| `aet-setup-config` | 编排 | 项目配置初始化 |
| `aet-interacting-with-users` | 原子 | 用户交互 |

## Skill 调用方式

### 通过命令调用

斜杠命令会自动触发对应的编排 Skill：

```
/aet-auto <URL>    → 触发 feature-management 编排 Skill
/aet-bugfix <描述>  → 触发 Bug 修复编排 Skill
```

### 通过 Skill 工具直接调用

在 OpenCode 中，可以直接使用 Skill 工具调用任意 Skill：

```
使用 Skill 工具调用 aet-req-analysis skill
输入：.aet/features/feature-xxx/ 目录下的 Issue 内容
```

## 开发自定义 Skill

### Skill 文件结构

每个 Skill 是一个目录，包含 `SKILL.md` 定义文件：

```
skills/{skill-name}/
├── SKILL.md          # Skill 定义（必须）
└── scripts/          # 可选辅助脚本
```

### SKILL.md 定义规范

```markdown
# {Skill 名称}

## 概述
{简要描述 Skill 的用途}

## When to use
{触发场景描述}

## Workflow
{执行步骤说明}

## Resources
{参考资源}
```

关键要素：

- **渐进式披露**：描述简洁明了，从简单开始，需要时再增加复杂度
- **When to use**：明确 Skill 的触发条件和使用场景
- **Workflow**：清晰定义执行步骤

### 自定义 Skill 开发步骤

1. 在 `skills/` 目录下创建新目录（如 `skills/my-custom-skill/`）
2. 编写 `SKILL.md` 文件
3. 在技能目录中添加所需的辅助脚本
4. 在工作流模板中引用该 Skill

### 集成到工作流

在工作流模板中引用自定义 Skill：

```json
{
  "hooks": {
    "my_custom_hook": {
      "description": "执行自定义技能",
      "skill": "my-custom-skill"
    }
  }
}
```

## Skill 使用建议

| 场景 | 推荐使用 |
| :--- | :--- |
| 快速完成一个 Issue | `/aet-auto <URL>` |
| Bug 修复 | `/aet-bugfix <描述>` |
| 仅需要代码实现 | `aet-implementing-requirement` skill |
| 代码审查 | `aet-reviewing-code` skill |
| TDD 开发 | `test-driven-development` skill |
| 管理 Issue/PR | `aet-operating-issues` / `aet-operating-pr` skill |
| 生成文档 | `aet-generating-readme` / `aet-generating-manual` / `aet-generating-python-api` / `aet-generating-qa` / `aet-generating-gif` / `wiki-builder` / `aet-doc-translator` / `aet-checking-docs` / `aet-building-doc-mdbook` skill |
