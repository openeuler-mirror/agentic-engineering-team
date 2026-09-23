---
文档版本: 0.1
更新日期: 2026-08-26
---

# 用户指导 · 模板可配置功能

## 1. 是什么

需求分析与设计在生成文档时，并不是靠"Agent 自己脑补一份 Markdown"，而是通过 **`aet-design-env` 技能的 `template` / `checklist` 子命令，动态组装一份文档骨架**：

```
node skills/aet-design-env/scripts/aet-design-env.mjs template skills/aet-req-analysis/references/_templates/req-analysis
node skills/aet-design-env/scripts/aet-design-env.mjs checklist skills/aet-req-analysis/references/_templates/req-analysis
```

一条命令同时承担两件事：

- **`template`（生成）**：组装"生成什么内容"的文档骨架（`artifact.md` + `components/*.md`）；
- **`checklist`（审查）**：组装"该文档要接受哪些评审检查项"的清单（`checklist.md` + 每个组件 frontmatter 里的 `checklist:` 字段）。

**核心对象：模板集（template set）**，如 `skills/aet-req-analysis/references/_templates/req-analysis/`：

```
req-analysis/
├── artifact.md                # 文档骨架：占位符 {{组件名,层级}} 的摆放顺序
├── checklist.md               # 审查清单骨架：占位符 {{组件名}} 的摆放顺序
└── components/                # 组件库：每个"章节"是一个可插拔文件
    ├── metadata.md            # 元数据块（自动 prepend，update_time 自动填）
    ├── basic-information.aet.md
    ├── scenario-analysis.aet.md
    ├── requirements-list.aet.md
    ├── functional-impact.aet.md
    ├── data-constraints.aet.md
    ├── acceptance-plan.aet.md
    ├── clarification-records.aet.md
    └── business-rules.aet.md
```

设计文档（需求设计模板集 `req-design`）同样如此，含 `module-changes`、`interface-design`、`dfx`、`core-workflow` 等组件。

---

## 2. 为什么

"模板 + 组件 + 占位符"这套机制解决的是**文档体例与内容方法论**的漂移问题：

1. **产物体例统一** —— 所有需求分析说明书长一个样（基本信息 → 场景 → 需求列表 → 功能影响 → …），评审人员一眼就能找到要看的部分；
2. **"模板一套、检查项另一套"的撕裂** —— 生成用 `artifact.md`、审查用 `checklist.md`，两者**共用同一批组件文件**，组件正文与 frontmatter 的 `checklist:` 字段**共址演化**，不会出现"生成的模板说 A，检查清单却查 B"；
3. **团队/项目可定制而不改核心代码** —— 中软、RTOS、汽车电子等不同行业体例不同；通过**插件（plugin）分层覆盖**，团队不改 AET 内核就能换体例；
4. **确定性** —— 条目层级自动平移、H2/H3/H4 自动编号、元数据 `update_time` 自动填充，全部由脚本保证，不依赖模型"心情"。

---

## 3. 怎么定制

### 3.1 先理解四层查找（2 级就近 + 入参兜底）

`template` / `checklist` 拿到 `<template-set-path>`（入参路径）后，会先看 **`design.json`** 决定"激活插件链"，然后按链逐层找组件文件：

| 层级 | 路径 | 谁维护 | 优先级 |
|---|---|---|---|
| 1（项目） | `{project}/.aet/design/<plugin>/<templateSet>/<rel>` | 项目团队（提交进仓库） | 高 |
| 2（home） | `~/.aet/design/<plugin>/<templateSet>/<rel>` | 个人 / 团队通用（跨项目复用） | 中 |
| 兜底（入参） | `<template-set-path>/<rel>` | AET 技能自带的基线模板集 | 低 |

`<templateSet>` 必须等于入参路径的**目录名**（如 `req-analysis`）。`rel` 指 `artifact.md` / `components/xxx.md` 等相对路径。

**激活插件**由 `<project>/.aet/design/design.json` 或 `~/.aet/design/design.json` 决定：

```json
{ "plugin": "a" }        // 激活插件 a，按 a → depends_on → … 的链查找
{ "plugin": null }       // 显式禁用链：直接用入参路径作为完整模板集
```

### 3.2 最小定制：一个插件覆盖一个组件

假设你想把"基本信息"组件换成你们公司的写法。

**第 1 步**：在 home（个人）或项目（团队共享）建插件目录：

```
~/.aet/design/
├── design.json                 # { "plugin": "myco" }
└── myco/
    └── req-analysis/           # ★ 目录名必须匹配入参路径 basename
        └── components/
            └── basic-information.aet.md
```

**第 2 步**：写覆盖组件（frontmatter 声明 `heading_level`，正文跟组件标题）：

```markdown
---
heading_level: 2
---

## 基本信息（本公司体例）

### 背景

[公司要求的背景字段…]
```

**第 3 步**：重新组装即生效——`template` 组装时，"链上第一个有该文件"的插件提供它（本例为 `myco`），入参路径的同名组件被覆盖；`checklist` 组装时间理会读取该组件 frontmatter 的 `checklist:` 字段。

> **验证**：先跑 `node skills/aet-design-env/scripts/aet-design-env.mjs check` 审计配置；再跑 `template` / `checklist` 看输出与 exit code。

### 3.3 插件协议（plugin.json / design.json / shields）

| 文件 | 位置 | 字段 | 语义 |
|---|---|---|---|
| `design.json` | `.aet/design/design.json`（项目）或 `~/.aet/design/design.json`（home） | `plugin: string\|null` | 激活插件名（链入口）；`null` = 显式禁用链。项目级优先 |
| `plugin.json` | 插件根 `<plugin>/plugin.json` | `depends_on: string\|null` | 链上下一个插件名；`null`/缺省 = 链终止 |
| `plugin.json` | 同上 | `shields: { "<templateSet>": ["组件名"] }` | **屏蔽**：阻止链上后续插件提供该组件；屏蔽者自身若有则不屏蔽自身（自豁免）。仅 `components/*` 可屏蔽 |

```json
// ~/.aet/design/myco/plugin.json
{
  "depends_on": "shared",
  "shields": { "req-analysis": ["data-constraints.aet"] }
}
```

- **依赖链**：`a → b → c → …`，查找按链顺序，第一个有该组件的插件提供；链终止后回入参路径兜底；
- **屏蔽**：`shields` 是"阻止后续查找"而非"删除组件"。屏蔽者自身没有该组件 → 静默跳过该章节（不留 `[Missing component]`、不报错）；
- **缺失**：链上 + 入参路径都没有 → 输出 `[Missing component: 组件名]` 占位符 + stderr 告警（exit 仍为 0）；
- **循环依赖 / 断链 / 配置损坏**：`template` / `checklist` 报错 exit 1；`check` 子命令可提前审计。

### 3.4 格式协议（占位符 / 标题层级 / 编号 / metadata）

**template（生成）侧的占位符**：

```
{{componentName}}                # 无层级 → 用组件自身 heading_level
{{componentName,level}}          # 显式指定目标层级（1-6）
{{<!-- 注释 -->componentName,2}} # 占位符内可带 HTML 注释，组装前剥离
```

- `.aet` 后缀有语义：`{{intro.aet,2}}` → 解析到 `components/intro.aet.md`（与 `intro.md` 是两个不同文件）；
- 组件 frontmatter 的 `heading_level: 0-6` 定义"标称层级"；占位符 `level` 优先。组装时把组件里**每个标题**的 `#` 数量按 `toLevel - fromLevel` 平移并 clamp 到 1-6，非标题行不变；
- 组装完成后自动编号：H2 → `## §N`，H3 → `### N.M`，H4 → `#### N.M.K`（H1/H5/H6 不动）；
- `{{metadata}}` 是特殊占位符：由链上第一个有 `components/metadata.md` 的插件提供，**自动 prepend 到文档顶部**，`update_time:` 字段自动填当前时间；metadata 永不被屏蔽。

**checklist（审查）侧只支持**：

```
{{componentName}}                # 不支持 ,level
```

只读取组件 frontmatter 的 `checklist:` 字段（正文被忽略）；不做标题调整、不做编号、不做 metadata prepend。

**组件正文里的 `<!-- condition -->` 指令**：控制哪些内容在哪个 Effort 下生成（如 `<!-- condition: Low=Skip, Medium=AsNeeded, High=Generate -->`）。这是"生成的协议"的一部分——**裁剪体例时注意保留这些注释**，否则会失去 Effort 分级行为。

### 3.5 怎么切换模板 / 组件形态（四选一）

| 想要的效果 | 操作 |
|---|---|
| 完全用 AET 基线体例 | 不写 design.json（或 `plugin: null`）→ 直接用入参路径模板集 |
| **项目级固定一支体例** | `.aet/design/design.json` + `.aet/design/<plugin>/`，提交进仓库，CI 全新 clone 即用 |
| **个人/团队通用体例**（跨项目复用） | `~/.aet/design/design.json` + `~/.aet/design/<plugin>/` |
| 叠加多个组件源 | 用 `depends_on` 连成插件链；用 `shields` 屏蔽不需要的基线条目 |

> 切换后**重新触发一次文档生成**即可（设计流程的 `sop-load-template` 每次都会重新组装模板）。改配置后用 `check` 子命令审计是最快的验证方式。

### 3.6 使用部分 AET 组件（组件内容跟随 AET 主线升级）

很多团队希望"体例自己定"，但又不希望与 AET 上游脱节。推荐模式是**分层混用**：

- **保留主动脉**：把 AET 基线模板集中的 `components/*` 组件当作**上游基线**，通过插件链 `depends_on` 引用它们（相当于"继承"）；
- **只覆盖差异**：插件里只放自己改写的那少数几个组件；其余组件从链上/入参路径继承；
- **组件内容跟随主线升级**：
  - 你在项目/home 层级**没有覆盖**的组件，走入参路径兜底 → **升级 AET 即自动获得新组件内容**（新方法论文本、新检查项）；
  - 你在插件层**覆盖过**的组件，升级 AET 时**不会**自动套用新内容——需要人工比对 AET 新版本与你的覆盖，手动合并（这是有意的：定制要稳定，上游变更不破坏你的体例）；
  - **屏蔽（shields）**是"我明确不要这个组件"，屏蔽状态升级 AET 后依旧生效；
  - **约定**：升级主线后，先用 `check` 审计、再用 `template` 重新组装，人工核对差异（特别是你覆盖过的组件），避免"旧体例 + 新检查项"不匹配。

> 一句话：**没覆盖的跟主线走，覆盖过的你自己负责合并，屏蔽的一直屏蔽。**

---

## 4. 审计与排查（`check` 子命令）

```bash
node skills/aet-design-env/scripts/aet-design-env.mjs check [project-root]
```

- 扫描 2 级：项目 `.aet/design/` + home `~/.aet/design/`（不扫技能自带 `_templates/`）；
- 输出 `[ERROR/WARNING/INFO] path: message`；有 ERROR → exit 1；
- 常见体检项：

| 输出级别 | 典型问题 |
|---|---|
| ERROR | `design.json` malformed / `plugin` 字段非法 / 循环依赖 / 断链 / 激活插件不存在 |
| WARNING | 无 design.json（警告链为空）、ghost 插件文件夹（无内容空目录） |
| INFO | passthrough 插件（只有 plugin.json，仅做依赖连线，合法） |

> 排查时对照输出定位到具体插件，修复后重跑 `template`。CI 里推荐"先 `check` 再 `template`/`checklist`"。

---

## 5. 常见问题

| 问题 | 处理 |
|---|---|
| 输出出现 `[Missing component: xxx]` | 链上 + 入参路径都没有该组件。检查模板集路径是否对、屏蔽是否误伤 |
| 想删除某个章节 | 用 `shields: { "<set>": ["那节"] }` 屏蔽（穿透后续查找），而不是删组件文件 |
| 想让所有新场景自动用我的体例 | 用 home 级 `design.json` + 插件；团队项目则用项目级并提交仓库 |
| 升级 AET 后体例没变化 | 因为你覆盖了那些组件（符合预期）；手动合并新版本内容 |
| 改完配置没效果 | 确认 `design.json` 的 plugin 字段存在且非 null；用 `check` 审计；确认 `<templateSet>` 目录名与入参 basename 一致 |
