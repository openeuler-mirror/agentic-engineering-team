# 模板定制与配置检查指南

本文档面向需要定制文档模板、审查清单或排查配置问题的**最终用户与开发者**。

`SKILL.md` 只说明"如何调用 `template` / `checklist` / `check` 子命令"（给 agent 用），本文档说明"如何写插件、如何排查问题"（给人看）。

## 目录

- [核心概念](#核心概念)
- [第一部分：手把手教程](#第一部分手把手教程)
  - [0. 环境布局](#0-环境布局)
  - [1. 最小插件（5 分钟）](#1-最小插件5-分钟)
  - [2. 多组件与标题层级](#2-多组件与标题层级)
  - [3. 依赖链](#3-依赖链)
  - [4. 屏蔽：控制组件可见性](#4-屏蔽控制组件可见性)
  - [5. 跨层级混用：项目 + home](#5-跨层级混用项目--home)
  - [6. 用 checklist 组装审查清单](#6-用-checklist-组装审查清单)
  - [7. 用 check 审计配置](#7-用-check-审计配置)
- [第二部分：语法与 API 参考](#第二部分语法与-api-参考)
  - [A. 插件目录结构](#a-插件目录结构)
  - [B. plugin.json Schema](#b-pluginjson-schema)
  - [C. design.json Schema](#c-designjson-schema)
  - [D. artifact.md / checklist.md 与占位符语法](#d-artifactmd--checklistmd-与占位符语法)
  - [E. 组件 frontmatter 与标题层级](#e-组件-frontmatter-与标题层级)
  - [F. 章节自动编号](#f-章节自动编号)
  - [G. metadata 自动处理](#g-metadata-自动处理)
  - [H. 依赖链与屏蔽语义](#h-依赖链与屏蔽语义)
  - [I. 错误与退出码表](#i-错误与退出码表)
  - [J. checklist 与 template 的差异](#j-checklist-与-template-的差异)
- [第三部分：用 check 审计配置](#第三部分用-check-审计配置)
  - [A. check 子命令概览](#a-check-子命令概览)
  - [B. 输出格式](#b-输出格式)
  - [C. 检查规则详表](#c-检查规则详表)
  - [D. 常见问题排查](#d-常见问题排查)
  - [E. CI/CD 集成](#e-cicd-集成)
- [附录：实测验证案例](#附录实测验证案例)

---

## 核心概念

| 概念 | 说明 |
|---|---|
| **插件（plugin）** | 一个文件夹，包多个**模板集子目录**（wrapper）。形如 `~/.aet/design/a/{plugin.json, req-analysis/{artifact.md, components/}, req-design/{...}}`。同一插件可同时覆盖多个不同 skill 的模板集。 |
| **2 级就近查找 + 入参路径兜底** | 链上插件的每个文件按 2 级查找：项目 `.aet/design/<plugin>/<templateSet>/<rel>` → home `~/.aet/design/<plugin>/<templateSet>/<rel>`。链终止后回到入参路径 `<template-set-path>/<rel>` 单层兜底。 |
| **依赖链（chain）** | `plugin.json` 的 `depends_on`（单依赖字符串）形成 `a → b → c → ...` 链。链在 `depends_on` 缺失或为 null 时终止。 |
| **屏蔽（shield）** | 插件根 `plugin.json` 的 `shields`（`Record<templateSet, componentName[]>`）阻止链上**后续**插件提供该组件。穿透：阻止后续所有插件及入参路径兜底；自豁免：屏蔽者自身若提供该组件则不屏蔽自身。仅 `components/*` 可屏蔽。同一插件用单个 `shields` 对象为不同模板集声明不同屏蔽列表。 |
| **激活插件（active）** | 链的入口。来自 `design.json` 的 `plugin` 字段（项目优先 → home）。无 design.json、或 `plugin: null` 时链为空，直接使用入参路径作为完整模板集（`null` 是合法的显式禁用）。 |

`aet-design-env` 的 `template` 子命令组装文档；`checklist` 子命令组装审查清单；`check` 子命令审计配置。三者共享同一套插件/链/屏蔽语义。

---

# 第一部分：手把手教程

## 0. 环境布局

`template <template-set-path>` 与 `checklist <checklist-set-path>` 的入参路径通常来自调用方 skill 自带的 `_templates/` 目录（例如 `skills/aet-req-analysis/scripts/_templates/req-analysis`）。**入参路径本身就是兜底模板集**——当链上无任何插件提供某文件时，回到该路径读取。

链上插件的文件查找按 2 级就近优先：

| 层级 | 路径 | 谁来维护 | 说明 |
|---|---|---|---|
| 1（项目） | `{project}/.aet/design/<plugin>/<templateSet>/<rel>` | 项目 | 项目级覆盖；优先 |
| 2（home） | `{home}/.aet/design/<plugin>/<templateSet>/<rel>` | 用户 | 用户级覆盖；项目级无时回退 |
| 兜底（入参） | `<template-set-path>/<rel>` | 调用方 skill | 链终止后单层兜底（来自调用方 `_templates/`） |

**决策建议**：

- 项目级 `.aet/design/` 用于项目特定的覆盖（提交到项目仓库）。
- home 级 `~/.aet/design/` 用于个人/团队通用的覆盖（跨项目复用）。
- skill `_templates/` 由调用方 skill 自带，是基线模板集，**不在本 skill 维护范围内**。
- 跨层级混用允许：插件 `a` 在项目，依赖 `b` 在 home；只要 `<plugin>/<templateSet>/<rel>` 在某一级存在即可。

---

## 1. 最小插件（5 分钟）

目标：用最简单的插件覆盖一个 skill 的 `_templates/req-analysis`，生成完整文档。

假设入参路径 `skills/aet-req-analysis/scripts/_templates/req-analysis/artifact.md` 含占位符 `{{intro,2}}`。

写插件 a 的组件 `~/.aet/design/a/req-analysis/components/intro.md`：

```markdown
---
heading_level: 2
---

## Intro
来自插件 a
```

文件树：

```
~/.aet/design/
├── design.json
└── a/
    └── req-analysis/              ← 模板集子目录（名字必须匹配 basename(入参路径)）
        └── components/
            └── intro.md
```

激活插件（`~/.aet/design/design.json`）：

```json
{ "plugin": "a" }
```

生成：

```bash
node skills/aet-design-env/scripts/aet-design-env.mjs template skills/aet-req-analysis/scripts/_templates/req-analysis
```

输出：

```
## §1 Intro
来自插件 a
```

**要点**：入参路径的 `artifact.md` 提供骨架；链上插件 a 提供 `components/intro.md` → 用 a 的副本；H2 自动编号 `## Intro` → `## §1 Intro`；`design.json` 在 home 维护用户的全局激活选择。

---

## 2. 多组件与标题层级

入参路径的 `artifact.md`：

```markdown
{{intro,2}}

{{section.aet,3}}

## Deep
正文
```

写插件 a 的两个组件 `~/.aet/design/a/req-analysis/components/`：

`intro.md`：

```markdown
---
heading_level: 2
---

## Intro
来自插件 a
```

`section.aet.md`（注意 `.aet` 后缀，解析到 `components/section.aet.md`，与 `section.md` 是两个不同文件）：

```markdown
---
heading_level: 3
---

## Section
来自插件 a 的 .aet 组件
```

生成输出：

```
## §1 Intro
来自插件 a

### 1.1 Section
来自插件 a 的 .aet 组件

## §2 Deep
正文
```

**要点**：

- `.aet` 后缀有语义：`{{section.aet,3}}` 解析到 `components/section.aet.md`，与 `section.md` 不混淆。
- 占位符 `{{name,level}}` 的 `level` 优先；未给 `level` 则用组件的 `heading_level`。
- 层级调整算法：把组件正文里**每个标题**的 `#` 数量按 `toLevel - fromLevel` 平移，clamp 到 1-6。非标题行不变。`heading_level: 0` = 不调整正文，原样插入。
- 计数器在每个 H2 处重置：H2 → `§N`；H3 → `N.M`；H4 → `N.M.K`。H1/H5/H6 不动。详见第二部分 E、F 节。

---

## 3. 依赖链

写共享插件 shared `~/.aet/design/shared/req-analysis/components/intro.md`：

```markdown
---
heading_level: 2
---

## Intro
来自 shared
```

让 a 依赖 shared（`~/.aet/design/a/plugin.json`）：

```json
{ "depends_on": "shared" }
```

链：`a → shared`。

- `{{intro,2}}` 占位符查找：插件 a 有 `intro.md` → 用 a 的副本（不查 shared）。
- **删掉 a 的 intro 再生成**：链上 a 没有 intro，到 shared 找到了 → 用 shared 的副本（输出变为 "来自 shared"）。
- 链终止后还会回到入参路径兜底。

**要点**：`depends_on` 单依赖，形成链式结构（a → shared → ... → 终止）；组件查找按链顺序，第一个有该组件的插件提供。

---

## 4. 屏蔽：控制组件可见性

`shields: { "<templateSet>": ["X"] }` 表示：**X 不允许从后续插件/入参兜底**。但**屏蔽者自身若有 X，仍用自身的 X**。仅 `components/*` 可屏蔽；`artifact.md` 与 `components/metadata.md` 永不被屏蔽。`shields` 是 `Record<templateSet, componentName[]>`，声明在插件根 `plugin.json`，与 `depends_on` 共存——同一插件用单个 `shields` 对象为不同模板集声明不同屏蔽列表。

```json
// ~/.aet/design/a/plugin.json                  （插件根，depends_on + shields 共存）
{
  "depends_on": "shared",
  "shields": { "req-analysis": ["intro"] }
}
```

| 场景 | a 的 shields[req-analysis] | a 有 intro？ | shared 有？ | 入参有？ | 结果 |
|---|---|---|---|---|---|
| **自豁免** | `["intro"]` | 是 | — | — | 用 a 的（自身屏蔽豁免） |
| **穿透屏蔽** | `["intro"]` | 否 | 是 | 是 | 静默跳过该章节（不报错、不留 `[Missing component]` 占位符）；屏蔽穿透到 shared 与入参兜底 |
| **屏蔽入参兜底** | `["intro"]` | 否 | 否 | 是 | 静默跳过；屏蔽穿透到入参路径兜底 |

**要点**：屏蔽是"阻止后续查找"，不是"删除组件"；屏蔽者自身若无 → 静默跳过（不留占位符、不报错）；`shields` 缺失或 `shields[<templateSet>]` 缺失 → 该模板集无屏蔽。

---

## 5. 跨层级混用：项目 + home

```
{project}/.aet/design/                ~/.aet/design/
├── design.json                       └── shared/
└── a/                                    └── req-analysis/
    ├── plugin.json                           └── components/
    └── req-analysis/components/                  └── intro.md
        └── section.md
```

`design.json` 在项目级（优先于 home）。链：`a(项目) → shared(home)`。`{{intro,2}}` 查找：

- 插件 a 在项目级 → 无 intro.md；插件 a 在 home 级 → 无（a 不在 home）。
- 链上下一个：插件 shared 在 home 级 → 有！生成输出包含 "来自 shared"。

**要点**：同一插件可在多个层级出现；逐文件就近优先；项目级 `design.json` 优先于 home 级。

---

## 6. 用 checklist 组装审查清单

`checklist` 与 `template` 共享同一套插件/链/屏蔽语义，主要差异见 [第二部分 J 节](#j-checklist-与-template-的差异)。这里给一个最小示例。

入参路径 `skills/aet-req-analysis/scripts/_templates/req-analysis/checklist.md`（注意是 `checklist.md`，不是 `artifact.md`）：

```markdown
# 需求分析审查清单

- [ ] {{intro-check}}
- [ ] {{scenario-check}}
```

写插件 a 的组件 `~/.aet/design/a/req-analysis/components/intro-check.md`（注意内容写在 frontmatter 的 `checklist:` 字段，不是 body）：

```markdown
---
checklist: 需求背景已明确，且与项目目标对齐
---

（正文被忽略——checklist 子命令只读 frontmatter 的 `checklist:` 字段）
```

激活（`~/.aet/design/design.json`）：

```json
{ "plugin": "a" }
```

生成：

```bash
node skills/aet-design-env/scripts/aet-design-env.mjs checklist skills/aet-req-analysis/scripts/_templates/req-analysis
```

输出：

```
# 需求分析审查清单

- [ ] 需求背景已明确，且与项目目标对齐
- [ ] [Missing component: scenario-check]
```

stderr 同步打印 `Warning: Component not found in chain a + fallback <path>: scenario-check`。

**要点**：占位符 `{{name}}`（无 `,level`）；缺组件会留 `[Missing component: name]` 占位符 + stderr 告警（与 template 一致）；不做标题层级调整、不做章节自动编号、不做 metadata 自动 prepend。

---

## 7. 用 check 审计配置

故意破坏配置后跑 `check`：

| 故障 | 触发 | check 输出 | exit |
|---|---|---|---|
| `design.json` 写成 `{ not json` | malformed JSON | `[ERROR] ~/.aet/design/design.json: Failed to read active plugin ...: Unexpected token ...` | 1 |
| `a → b → a` | 循环依赖 | `[ERROR] (active chain): Circular plugin dependency detected: a -> b -> a` | 1 |
| `~/.aet/design/abandoned/` 空文件夹 | ghost 文件夹 | `[WARNING] ~/.aet/design/abandoned/: ghost plugin folder (no plugin.json, no template-set subdirs with content)` | 0 |
| `connector/` 只有 `plugin.json` | passthrough 插件 | `[INFO] ~/.aet/design/connector/: passthrough plugin (only plugin.json, no template-set subdirs)` | 0 |

**要点**：check 扫描 2 级（项目 + home），不审计 `artifact.md` / `checklist.md` 是否在链上、不审计占位符能否解析——因为 check 不知道调用方会传哪个模板集，这些由 `template` / `checklist` 自身在运行时检测；ERROR → exit 1；WARNING/INFO → exit 0。完整规则详见 [第三部分](#第三部分用-check-审计配置)。

---

# 第二部分：语法与 API 参考

## A. 插件目录结构

### 2 级就近查找 + 入参路径兜底

| 层级 | 路径 | 说明 |
|---|---|---|
| 1（项目） | `{project}/.aet/design/<plugin>/<templateSet>/<rel>` | 项目级覆盖；优先 |
| 2（home） | `{home}/.aet/design/<plugin>/<templateSet>/<rel>` | 用户级覆盖 |
| 兜底（入参） | `<template-set-path>/<rel>` | 链终止后单层兜底 |

`{project}` = `process.cwd()`；`{home}` = `os.homedir()`；`<template-set-path>` = CLI 入参；`<templateSet>` = `basename(<template-set-path>)`。

### 文件需求表（在模板集子目录下）

| 文件 | 必需性 | 作用 |
|---|---|---|
| `artifact.md`（template） / `checklist.md`（checklist） | 链上至少一个插件要有，否则入参路径要有 | 骨架文档，含 `{{component}}` 占位符。链上第一个有此文件的插件提供骨架；链终止回到入参路径兜底；两层均无 → exit 1。 |
| `components/<name>.md` | 可选 | 组件。template 模式读 frontmatter + 正文；checklist 模式只读 frontmatter 的 `checklist:` 字段。`.aet` 后缀有语义。 |
| `components/metadata.md` | 可选（template 专用） | 元数据块（自动 prepend，`update_time:` 自动填当前时间）。checklist 模式忽略。 |
| `plugin.json` | 可选 | 插件级配置（在**插件根**，不在模板集子目录下）。`depends_on` + `shields`（`Record<templateSet, componentName[]>`）共存于同一文件。同一插件用单个 `shields` 对象为不同模板集声明不同屏蔽列表。 |

### `pluginExists` 语义

插件"存在" = 2 级中**任一级**有该插件目录（不论内部有什么文件）。

---

## B. plugin.json Schema

`plugin.json` 位于**插件根**（`<plugin>/plugin.json`，不在模板集子目录下）。`depends_on` 与 `shields` 共存于同一文件，2 级就近查找（项目 → home）。

```json
{
  "depends_on": "shared",
  "shields": {
    "req-analysis": ["legacy", "deprecated"],
    "req-design": []
  }
}
```

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `depends_on` | `string \| null` | `null` | 链上下一个插件名。`null` 或缺省 = 终止。 |
| `shields` | `Record<string, string[]>` | `{}` | 按模板集名分组的屏蔽组件列表。键 = 模板集名（即 `<templateSet>` 子目录名）；值 = 屏蔽的组件名数组。运行时只读取与当前模板集匹配的那个数组；其他键在该模板集下被忽略。 |

### 校验规则（每条违反 → ERROR）

1. JSON 解析失败 → `Failed to read plugin config for '<name>' (<path>): <reason>`
2. 顶层不是对象 → `plugin.json is not an object: <path>`
3. `depends_on` 非 string 也非 null → `plugin.json 'depends_on' must be a non-empty string or null: <path>`
4. `depends_on` 是空字符串 → 同上
5. `shields` 非 object（如 string、array） → `'shields' must be an object mapping template-set name to array of strings (got <type>)`
6. `shields` 是数组而非对象 → 同上（数组的 `typeof` 也是 `'object'`，schema 校验显式拒绝数组类型）
7. `shields["<setName>"]` 非 array → `'shields["<setName>"]' must be an array of strings (got <type>)`
8. `shields["<setName>"]` 数组里有非字符串项 → `'shields["<setName>"]' entries must be strings (found <type>)`
9. `shields["<setName>"]` 数组里有空字符串项 → `'shields["<setName>"]' entries must be non-empty strings`

### 区分：passthrough vs ghost

- **passthrough 插件**：只有 `plugin.json`（声明 `depends_on`，可含 `shields`），无任何模板集子目录含内容（artifact.md 或 components/*.md）。check 报 INFO。
- **ghost 文件夹**：无 `plugin.json`，无任何模板集子目录含内容。check 报 WARNING。
- **正常插件**：有模板集子目录含内容。无 issue。

---

## C. design.json Schema

`design.json` 位于 `.aet/design/design.json`（项目）或 `~/.aet/design/design.json`（home）。

```json
{ "plugin": "a" }
{ "plugin": null }
```

| 字段 | 类型 | 必需 | 说明 |
|---|---|---|---|
| `plugin` | `string \| null` | 是 | 当前激活的插件名（链入口）。非空字符串；`null` = **显式禁用链**（等同无 design.json：空链 → 入参路径兜底）。 |

### 解析规则

1. **项目级优先**：项目级 `design.json` 存在即权威，malformed → ERROR（不回退 home）。
2. **home 级兜底**：项目级不存在时，读 home 级。
3. **两层都无，或任一层显式 `plugin: null`**：链为空，直接使用入参路径作为完整模板集（无屏蔽、无 [Missing component]，除非入参路径自身缺组件）。**不报错**——这是合法的禁用方式。

### 校验规则

| 触发 | 级别 | 信息 |
|---|---|---|
| JSON 解析失败 | ERROR | `Failed to read active plugin (<path>): <reason>` |
| 顶层不是对象 | ERROR | `design.json is not an object: <path>` |
| `plugin` 字段缺失 | ERROR | `design.json 'plugin' field is required (set to a plugin name, or null to disable the chain): <path>` |
| `plugin` 为空字符串或非字符串非 null 类型（数字、数组、对象、布尔） | ERROR | `design.json 'plugin' field must be a non-empty string or null (use null to disable the chain): <path>` |
| `plugin: null` | —（合法） | 不报错：链被显式禁用，等同无 design.json |
| `plugin: "<name>"` 但 `<name>` 插件不存在 | ERROR | `Active plugin '<name>' not found at either level (project .aet/design/, home ~/.aet/design/)` |

### 注：CLI 不覆盖 design.json

`template` / `checklist` 的入参是路径（不是插件名）。**总是读 design.json 决定激活插件**——CLI 不能覆盖。

---

## D. artifact.md / checklist.md 与占位符语法

骨架文档（template 用 `artifact.md`；checklist 用 `checklist.md`）含 `{{...}}` 占位符标记组件插入点。

### 占位符语法（template 模式）

```
{{componentName}}
{{componentName,level}}
{{<!-- any HTML comment -->componentName,level}}
```

- **`componentName`**：限 `[a-zA-Z0-9-.]+`（字母、数字、连字符 `-`、点 `.`）。
- **`.aet` 后缀有语义**：`{{intro.aet,2}}` 解析到 `components/intro.aet.md`（与 `components/intro.md` 是两个不同文件，不混淆）。
- **`,level`**：可选，必须是 1-6 的整数。越界（<1 或 >6）或非数字 → stderr 告警并回退到组件自身的 `heading_level`。
- **HTML 注释**：占位符内部可嵌 `<!-- ... -->`，组装前会被剥离（用于在骨架里给占位符加注释而不影响渲染）。
- **空占位符 `{{}}` 或不匹配语法**：替换为空字符串（不报错）。
- **`{{metadata}}`**（template 专用）：特殊占位符，返回空字符串。metadata 由链上第一个有 `components/metadata.md` 的插件提供，自动 prepend 到文档顶部，不需要占位符。

### 占位符语法（checklist 模式）

```
{{componentName}}
```

只支持 `{{name}}`，**不支持 `,level`**；HTML 注释剥离仍生效（剥光后必须严格匹配 `^[a-zA-Z0-9-.]+$`，否则返回空字符串）。

### 占位符替换流程

```text
for each {{...}} in skeleton:
  rawContent = strip HTML comments + trim
  if empty → return ''
  match against allowed pattern
  if no match → return ''
  componentName = match[1]
  (template only) if componentName == 'metadata' → return ''
  result = resolveComponent(chain, setName, fallbackPath, componentName)
  if result.kind == 'shielded' → return ''           (silent skip; both modes)
  if result.kind == 'missing':
      (template)  → stderr warning + return '[Missing component: <name>]'
      (checklist) → stderr warning + return '[Missing component: <name>]'
  if result.kind == 'found':
      (template)  → apply heading_level adjustment
      (checklist) → return string content as-is
```

---

## E. 组件 frontmatter 与标题层级（template 专用）

`components/<name>.md` 是 frontmatter + Markdown 正文：

```markdown
---
heading_level: 2
---

## Intro
组件正文
```

### `heading_level` 字段

- 类型：整数 0-6，默认 2。
- **0** = 不调整正文，原样插入（标题层级、`#` 数量都不变）。
- **1-6** = 组件正文的"标称层级"（即正文里 `##` 的实际语义层级）。

### 层级调整算法

占位符的 `level`（若给）优先于组件 `heading_level`。组装时把组件正文里**每个标题**的 `#` 数量按 `toLevel - fromLevel` 平移，结果 clamp 到 1-6。非标题行不变。

```text
diff = toLevel - fromLevel
for each line:
  if line is heading (^(#{1,6})\s(...)):
    newLevel = clamp(currentLevel + diff, 1, 6)
    output: '#'.repeat(newLevel) + ' ' + title
  else:
    output: line unchanged
```

### 校验告警（stderr）

- `heading_level` 非数字 → `Warning: Invalid heading_level '<val>' in component <name>, using default 2`
- `heading_level` 越界（<0 或 >6）→ `Warning: heading_level <val> out of range (0-6) in component <name>, using default 2`
- 占位符 `level` 非数字 → `Warning: Invalid target level '<val>' for component <name>, using component's heading_level`
- 占位符 `level` 越界（<1 或 >6）→ `Warning: Target level <val> out of range (1-6) for component <name>, using component's heading_level`

> checklist 模式无 `heading_level` 概念；frontmatter 中除 `checklist:` 外的字段都被忽略。

---

## F. 章节自动编号（template 专用）

组装完成后（所有占位符替换之后、最终 trim 之前），对 H2/H3/H4 自动编号：

| 原文 | 编号后 |
|---|---|
| `## Title` | `## §N Title` |
| `### Title` | `### N.M Title`（无 §） |
| `#### Title` | `#### N.M.K Title`（无 §） |

- H1/H5/H6 不动。
- 计数器在每个 H2 处重置（H2 → `§N`；H3 → `N.M`；H4 → `N.M.K`）。
- 编号发生在 `addSectionNumbers(artifact)` 调用，是 BYTE-LOCKED 到 assemble-template.mjs 的稳定行为。
- 即使组件的 `heading_level: 0`，若其正文形成了 H2/H3/H4，仍会被编号。

> checklist 模式不做章节编号。

---

## G. metadata 自动处理（template 专用）

链上**第一个有 `components/metadata.md` 的插件**提供元数据。链终止后回到入参路径 `<template-set-path>/components/metadata.md` 兜底。两层均无 → 不 prepend，不报错。

### 自动 prepend

- 在占位符替换**之前** prepend 到文档顶部。
- metadata 内部不应有占位符（占位符替换发生在 prepend 之后，但 metadata 是 prepend 的内容，不参与替换）。

### `update_time:` 自动填当前时间

匹配正则 `/^update_time:\s*.*/m`，替换为 `update_time: <YYYY-MM-DD HH:MM:SS (UTC+X)>`。

### 永不被屏蔽

`shields` 仅作用于 `components/*` 的其他组件；`components/metadata.md` 永不被屏蔽。

### 示例 metadata.md

```markdown
---
title: 需求分析文档
version: 1.0
update_time: PLACEHOLDER
---

## 文档信息
本节由插件 a 提供
```

> checklist 模式不做 metadata 自动 prepend。

---

## H. 依赖链与屏蔽语义

### 链构造

```text
buildChain(activePlugin):
  chain = []
  visited = set()
  current = activePlugin
  while current:
    if current in visited → throw "Circular plugin dependency detected: <chain> -> <current>"
    if !pluginExists(current) → throw "Active plugin '<current>' not found at either level (project .aet/design/, home ~/.aet/design/)"
                            or "Dependency '<current>' (declared by plugin '<last>') not found at either level ..."
    visited.add(current); chain.push(current)
    config = loadPluginConfig(current)
    current = config?.depends_on ?? null
  return chain
```

### 组件查找（含入参路径兜底）

```text
resolveComponent(chain, setName, fallbackPath, componentName):
  for P in chain (a → b → c → ...):
    file = resolvePluginTemplateFile(P, setName, 'components/<name>.md')  # 2 级查找
    if file exists → load + return { kind: 'found', content, source: P }  # P 自身屏蔽豁免
    config = loadPluginConfig(P)                              # 读 <P>/plugin.json
    if config?.shields?.[setName]?.includes(componentName) → return { kind: 'shielded' }  # 静默跳过
    # 否则继续下一个插件
  # 链终止 → 回到入参路径兜底
  fallbackFile = join(fallbackPath, 'components', '<name>.md')
  if exists(fallbackFile) → load + return { kind: 'found', content, source: '(fallback)' }
  return { kind: 'missing' }  # stderr 告警 + [Missing component: <name>]
```

template 与 checklist 共用同一套 `resolveComponent` 逻辑；区别仅在"加载后如何提取内容"：template 读 frontmatter + body 并做层级调整；checklist 只读 frontmatter 的 `checklist:` 字符串。

### 屏蔽场景表

| 场景 | a 的 shields[base] | a 有组件？ | b 有？ | 入参有？ | 结果 |
|---|---|---|---|---|---|
| 正常提供 | （无） | 是 | — | — | 用 a 的 |
| 链上查找 | （无） | 否 | 是 | — | 用 b 的 |
| 兜底查找 | （无） | 否 | 否 | 是 | 用入参的（source='(fallback)'） |
| 缺失 | （无） | 否 | 否 | 否 | `[Missing component: name]` + stderr |
| 自豁免 | `[X]` | 是 | — | — | 用 a 的（自身屏蔽豁免） |
| 穿透屏蔽 | `[X]` | 否 | 是 | 是 | 静默跳过（屏蔽穿透到 b 和入参） |
| 部分穿透 | `[X]` | 否 | 否 | 是 | 静默跳过（屏蔽穿透到入参） |
| 屏蔽无意义 | `[X]` | 是 | — | — | 用 a 的（同自豁免） |

### 屏蔽对象

**仅 `components/*`**。`artifact.md`、`checklist.md` 与 `components/metadata.md` 永不被屏蔽——链上第一个有它们的插件提供（链终止回到入参路径兜底；两层均无 → artifact / checklist 报错 exit 1，metadata 静默不 prepend）。

---

## I. 错误与退出码表

| 触发条件 | 行为 | stderr | exit |
|---|---|---|---|
| 无 design.json（项目 + home 均无） | 链为空，直接使用入参路径作为完整模板集 | （无） | 0 |
| design.json `plugin: null`（任一层） | 链被显式禁用，等同无 design.json：直接使用入参路径作为完整模板集 | （无） | 0 |
| design.json malformed / not-object / `plugin` 字段缺失 / `plugin` 非字符串非 null（含空字符串） | 报错 | `Error: Failed to read active plugin (<path>): <reason>` / `design.json is not an object: <path>` / `design.json 'plugin' field is required (set to a plugin name, or null to disable the chain): <path>` / `design.json 'plugin' field must be a non-empty string or null (use null to disable the chain): <path>` | 1 |
| plugin.json malformed / schema 违反 | 报错 | `Error: Failed to read plugin config for '<name>' (<path>): <reason>` 等 | 1 |
| 循环依赖（a → b → a） | 报错 | `Error: Circular plugin dependency detected: a -> b -> a` | 1 |
| 链上插件不存在 | 报错 | `Error: Active plugin '<name>' not found at either level (project .aet/design/, home ~/.aet/design/)` 或 `Error: Dependency '<dep>' (declared by plugin '<parent>') not found at either level ...` | 1 |
| 链 + 入参路径均无 artifact.md / checklist.md | 报错 | `Error: artifact.md not found in any plugin of chain: a -> b -> ... nor in fallback path <path>`（checklist 同理） | 1 |
| 占位符 `{{name}}` 在链上 + 入参路径均无且无屏蔽 | 插入占位符 + 告警 | `Warning: Component not found in chain <chain> + fallback <path>: <name>` | 0 |
| 占位符 `{{name}}` 被屏蔽且链上 + 入参路径均无 | 静默跳过 | （无） | 0 |
| `heading_level` / `level` 非法（template 专用） | 告警 + 回退默认 | `Warning: Invalid ...` | 0 |

---

## J. checklist 与 template 的差异

`checklist` 与 `template` 共享同一套插件/链/屏蔽/design.json 解析/2 级查找 + 入参路径兜底语义，仅在以下 4 处不同：

| 维度 | template | checklist |
|---|---|---|
| **骨架文件名** | `artifact.md` | `checklist.md` |
| **组件内容来源** | frontmatter + 正文（按 `heading_level` 做层级调整） | 仅 frontmatter 的 `checklist:` 字段（字符串） |
| **占位符语法** | `{{name,level}}`（`level` 可选 1-6） | `{{name}}`（无 `level`） |
| **后处理** | metadata 自动 prepend + `update_time` 自动填 + 章节自动编号（H2→`§N`、H3→`N.M`） | 无 metadata prepend、无章节编号 |

**相同的部分**：

- design.json 解析（项目 > home，malformed → ERROR）、`buildChain`、`resolveComponent`（链顺序、自身屏蔽豁免、穿透屏蔽、入参路径兜底）。
- 缺组件时均 `[Missing component: name]` + stderr 告警；被屏蔽时均静默跳过。
- plugin.json schema 与校验规则、错误与退出码、`check` 审计行为完全一致。

`checklist` 子命令的入参路径示例：`skills/aet-req-analysis/scripts/_templates/req-analysis`（与 template 共用同一目录，靠骨架文件名 `checklist.md` 区分）。一个插件可同时为 template 提供 `artifact.md`、为 checklist 提供 `checklist.md`，两者在同一模板集子目录下共存。

---

# 第三部分：用 check 审计配置

## A. check 子命令概览

```bash
node skills/aet-design-env/scripts/aet-design-env.mjs check [project-root]
```

- **无参**：扫描 `process.cwd()` 作为项目。
- **带参 `<project-root>`**：chdir 到该路径再扫描（路径必须存在且是目录，否则 exit 1 + stderr `path does not exist` / `not a directory`）。

### 扫描范围

**2 级**（项目 `.aet/design/` + home `~/.aet/design/`）。**不扫描 skill `_templates/`**（属于调用方 skill 的责任，check 不知道哪个 skill 会调用 template/checklist）。

### 不审计的内容

- **`artifact.md` / `checklist.md` 是否在链上存在**：per-template-set 检查，check 不知道调用方会传哪个模板集。
- **`{{name}}` 占位符能否解析**：同上。

这些由 `template` / `checklist` 自身在运行时检测并报错/告警。

---

## B. 输出格式

### stdout（每行一个问题）

```
[SEVERITY] path: message
```

`SEVERITY` ∈ `{ERROR, WARNING, INFO}`。无问题时 stdout 为空。

### stderr（汇总）

```
<error_count> error(s), <warning_count> warning(s), <info_count> info.
```

无问题时输出 `No issues found.`

### 退出码

| 情形 | exit |
|---|---|
| 有 ERROR | 1 |
| 仅 WARNING / INFO / 无问题 | 0 |
| 路径参数不存在或非目录 | 1 |

---

## C. 检查规则详表

| 级别 | 触发 | 信息 |
|---|---|---|
| ERROR | design.json malformed JSON | `Failed to read active plugin (<path>): <reason>` |
| ERROR | design.json 不是对象 | `design.json is not an object: <path>` |
| ERROR | design.json `plugin` 字段缺失 | `'plugin' field is required (set to a plugin name, or null to disable the chain)` |
| ERROR | design.json `plugin` 为空字符串或非字符串非 null 类型（数字、数组、对象、布尔） | `'plugin' field must be a non-empty string or null (use null to disable the chain)` |
| —（合法） | design.json `plugin: null` | 不报 issue：链被显式禁用，等同无 design.json（空链 → 入参路径兜底） |
| ERROR | plugin.json malformed JSON | `Failed to read plugin config for '<name>' (<path>): <reason>` |
| ERROR | plugin.json 不是对象 | `plugin.json is not an object: <path>` |
| ERROR | 插件根 `depends_on` 非 string 也非 null | `plugin.json 'depends_on' must be a non-empty string or null: <path>` |
| ERROR | `plugin.json` `shields` 非 object（如 string、array） | `'shields' must be an object mapping template-set name to array of strings (got <type>)` |
| ERROR | `shields["<setName>"]` 非数组 | `'shields["<setName>"]' must be an array of strings (got <type>)` |
| ERROR | `shields["<setName>"]` 数组里有非字符串项 | `'shields["<setName>"]' entries must be strings (found <type>)` |
| ERROR | `shields["<setName>"]` 数组里有空字符串项 | `'shields["<setName>"]' entries must be non-empty strings` |
| ERROR | 链循环依赖 | `Circular plugin dependency detected: a -> b -> a` |
| ERROR | 链上 `depends_on` 指向不存在的插件 | `Dependency '<dep>' (declared by plugin '<parent>') not found at either level (project .aet/design/, home ~/.aet/design/)` |
| ERROR | 激活插件自身不存在 | `Active plugin '<name>' not found at either level (project .aet/design/, home ~/.aet/design/)` |
| WARNING | 无 design.json（项目 + home 均无） | `no design.json at project or home — no plugin chain active; \`template\` path-arg template-set used directly` |
| WARNING | ghost 插件文件夹（无 plugin.json 且无任何模板集子目录含 artifact.md 或 components/*.md） | `ghost plugin folder (no plugin.json, no template-set subdirs with content)` |
| INFO | passthrough 插件（只有 plugin.json，无任何模板集子目录含内容） | `passthrough plugin (only plugin.json, no template-set subdirs)` |

---

## D. 常见问题排查

### 1. design.json malformed

**症状**：`[ERROR] ~/.aet/design/design.json: Failed to read active plugin ...: Unexpected token ...`
**原因**：JSON 语法错误（多了逗号、漏了引号等）。
**修复**：用 `jq . ~/.aet/design/design.json` 验证语法；修正后重跑 `check`。

### 2. 循环依赖

**症状**：`[ERROR] (active chain): Circular plugin dependency detected: a -> b -> a`
**原因**：`a/plugin.json` 的 `depends_on` 指向 b，`b/plugin.json` 的 `depends_on` 指向 a。
**修复**：检查链的预期方向，把至少一个 `depends_on` 改为 `null` 或指向终止插件。

### 3. 断链（broken depends_on）

**症状**：`[ERROR] (active chain): Dependency 'ghost' (declared by plugin 'a') not found at either level ...`
**原因**：`a/plugin.json` 声明 `depends_on: "ghost"`，但 `ghost` 插件文件夹在项目 + home 均不存在。
**修复**：在 `~/.aet/design/ghost/` 或 `{project}/.aet/design/ghost/` 创建该插件；或修正 `depends_on` 名字。

### 4. 激活插件自身不存在

**症状**：`[ERROR] (active chain): Active plugin 'a' not found at either level ...`
**原因**：`design.json` 写 `{ "plugin": "a" }`，但项目 + home 都没有 `a/` 文件夹。
**修复**：创建该插件，或修改 `design.json` 的 `plugin` 字段指向已存在的插件。

### 5. ghost 文件夹

**症状**：`[WARNING] ~/.aet/design/abandoned/: ghost plugin folder (no plugin.json, no template-set subdirs with content)`
**原因**：某文件夹下既无 `plugin.json`，也无任何含 `artifact.md` 或 `components/*.md` 的模板集子目录。可能是误建空文件夹，或残留的旧文件夹。
**修复**：删除该文件夹；或补全内容使其成为正常插件。

### 6. passthrough 插件（INFO，非问题）

**症状**：`[INFO] ~/.aet/design/connector/: passthrough plugin (only plugin.json, no template-set subdirs)`
**说明**：该插件只有插件根 `plugin.json`（声明 `depends_on`，可含 `shields`），无任何模板集子目录含内容。这是**合法**的——它是链上的中间节点，仅用于声明依赖关系与屏蔽规则。INFO 仅作为提示，不需修复。

---

## E. CI/CD 集成

### 基本模式：先 check 再 template / checklist

```bash
# 在 CI 中：
node skills/aet-design-env/scripts/aet-design-env.mjs check
node skills/aet-design-env/scripts/aet-design-env.mjs template skills/aet-req-analysis/scripts/_templates/req-analysis > doc.md
node skills/aet-design-env/scripts/aet-design-env.mjs checklist skills/aet-req-analysis/scripts/_templates/req-analysis > checklist.md
```

- `check` 失败（exit 1）会阻断 CI。
- `check` 通过（exit 0）后 `template` / `checklist` 生成文档。

### 严格模式：把 WARNING 也当失败

```bash
output=$(node ... check 2>&1)
if echo "$output" | grep -qE '\[(ERROR|WARNING)\]'; then
  echo "$output"
  exit 1
fi
node ... template skills/aet-req-analysis/scripts/_templates/req-analysis > doc.md
```

### 项目级覆盖优先

如果项目级 `.aet/design/design.json` 存在，CI 不需要 home 级配置。把 `.aet/design/` 提交到项目仓库，CI 在 fresh checkout 后直接可用。

---

## 附录：实测验证案例

本附录展示一个完整的端到端实测配置，作为模型行为的参考实现。所有文件路径、CLI 命令、输出均为真实运行结果（cwd = skill root；Node.js 20+；macOS / Linux 均可复现）。

### 测试目标

验证 5 个核心机制在真实配置下端到端工作：

1. **链式查找** — 插件 a 覆盖 + 插件 b 扩展按链顺序生效
2. **入参路径兜底** — 链终止且无插件提供时回到入参路径
3. **屏蔽穿透** — a 屏蔽的组件被静默跳过（无占位符、无告警、无错误）
4. **metadata 自动 prepend + `update_time` 自动填**
5. **章节自动编号** — H2→`§N`、H3→`N.M`（如 `§7` → `7.1`）

### 插件布局（`~/.aet/design/`）

```
~/.aet/design/
├── design.json              # {"plugin": "a"}
├── a/
│   ├── plugin.json          # {"depends_on": "b", "shields": {"req-analysis": ["data-constraints.aet"]}}
│   └── req-analysis/
│       └── components/
│           └── basic-information.aet.md    # 覆盖
├── b/
│   ├── plugin.json          # {"depends_on": null}
│   └── req-analysis/components/
│       ├── scenario-analysis.aet.md      # 扩展
│       └── clarification-records.aet.md # 扩展
└── ghost/                   # 空文件夹，演示 WARNING
```

入参路径（基础模板集，由调用方 skill 自带）：

```
skills/aet-req-analysis/scripts/_templates/req-analysis/
├── artifact.md              # 含 9 个占位符：{{basic-information.aet,2}} {{scenario-analysis.aet,2}} {{data-constraints.aet,2}} 等
└── components/
    ├── basic-information.aet.md      # 被插件 a 覆盖
    ├── scenario-analysis.aet.md      # 同名时插件优先于路径
    ├── clarification-records.aet.md # 同上
    ├── requirements-list.aet.md      # 由路径兜底
    ├── functional-impact.aet.md      # 由路径兜底
    ├── data-constraints.aet.md       # 被 a 屏蔽 → 静默跳过
    ├── acceptance-plan.aet.md        # 由路径兜底
    └── metadata.md                   # 链上无 → 用路径兜底
```

`basename` = `req-analysis`，与各插件下子目录名匹配。

### `check` 输出

```
$ node scripts/aet-design-env.mjs check
[WARNING] /Users/<user>/.aet/design/ghost: ghost plugin folder (no plugin.json, no template-set subdirs with content)

No errors. 1 warning(s), 0 info.
$ echo $?
0
```

行为解读：

- 检测到 `ghost/` 文件夹（无 `plugin.json` + 无任何模板集子目录含内容）→ WARNING
- 链 `a → b` 有效（无循环依赖、无断链）→ 不报 ERROR
- home 有 `design.json`（项目无）→ 不报 "no design.json" WARNING
- exit 0（无 ERROR）

### `template` 输出（关键摘录）

```
$ node scripts/aet-design-env.mjs template skills/aet-req-analysis/scripts/_templates/req-analysis
---
...metadata...
update_time: 2026-07-25 09:40:28 (UTC+8)        ← metadata 自动 prepend + update_time 自动填
---

## §1 基本信息（来自插件 a 的覆盖）          ← 来自插件 a 覆盖
- 项目名称：测试项目
- 版本：v1.0

## §2 场景分析（来自插件 b 的扩展）          ← 来自插件 b 扩展
- 场景 1：用户登录

## §3 需求列表                                ← 来自入参路径兜底
[原 req-analysis 模板 需求列表 内容...]

## §4 功能影响                                ← 来自入参路径兜底
[原 req-analysis 模板 功能影响 内容...]

## §5 验收方案                                ← 来自入参路径兜底
[原 req-analysis 模板 验收方案 内容...]

## §6 附录                                    ← artifact.md 字面 `## 附录`

## §7 澄清记录（来自插件 b 的扩展）          ← 来自插件 b 扩展
- 澄清 1：需求 X 的具体含义

### 7.1 [XXX]                                 ← artifact.md 字面 `### [XXX]`，编号为 §7 的 7.1
[Appendix content]
$ echo $?
0                                              ← exit 0（无硬错误，stderr 空）
```

注：artifact.md 中 `{{data-constraints.aet,2}}` 占位符位于功能影响（§4）与验收方案（§5）之间，但插件 `a` 的 `shields["req-analysis"]: ["data-constraints.aet"]` 命中 → 静默跳过，§4 与 §5 直接连续，无 `[Missing component: data-constraints.aet]` 占位符，无 stderr 告警。

### 行为解读（5 大机制）

| 机制 | 验证点 | 实测结果 |
|---|---|---|
| 链式查找 | §1 来自 a、§2/§7 来自 b | ✓ 输出含"来自插件 a/b"标记 |
| 入参路径兜底 | §3/§4/§5 内容来自真实 req-analysis 模板集 | ✓ 内容与 `_templates/req-analysis/components/{requirements-list,functional-impact,acceptance-plan}.aet.md` 一致 |
| 屏蔽穿透 | `data-constraints.aet` 被 a 屏蔽 → 静默跳过 | ✓ §4 与 §5 之间无数据约束章节；无 `[Missing component]` 占位符；stderr 空 |
| metadata 自动 prepend | `update_time` 字段自动填当前时间 | ✓ `update_time: 2026-07-25 09:40:28 (UTC+8)` |
| 章节自动编号 | H2→`§N`、H3→`N.M` | ✓ §1..§7、§7.1 |

### "无 design.json"对照实验

临时移除 `~/.aet/design/design.json` 后再跑同一命令：

```
$ node scripts/aet-design-env.mjs template skills/aet-req-analysis/scripts/_templates/req-analysis
---
...metadata...
---

## §1 基本信息                                ← 现在用入参路径兜底（原 req-analysis 模板内容）
### 1.1 项目背景
[原 req-analysis 模板的 项目背景 内容...]
$ echo $?
0
```

`check` 输出对照：

```
$ node scripts/aet-design-env.mjs check
[WARNING] .../ghost: ghost plugin folder ...
[WARNING] (no design.json): no design.json at project or home — no plugin chain active; `template` path-arg template-set used directly

No errors. 2 warning(s), 0 info.
$ echo $?
0
```

行为解读：

- 链为空 → `template` 直接用入参路径作为完整模板集，无覆盖、无屏蔽、无 ERROR
- §1 内容变回原 req-analysis 模板（而非插件 a 的"测试项目"覆盖）
- `check` 加 1 条 "no design.json" WARNING（不报 ERROR）
- exit 0（`template` 与 `check` 都 exit 0）

---

实测配置可作为新手参考实现：复制本附录的文件树到 `~/.aet/design/`，从 skill root 运行上面的两条命令即可复现全部行为。

---

本文档与代码同步维护。如有疑问，参考 `scripts/src/{util,template,check,checklist}.ts` 的实现。
