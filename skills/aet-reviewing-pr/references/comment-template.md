# PR 评论模板(LLM 参考此模板写最终评论)

> 本文档是 `aet-reviewing-pr` 跑完 review 后,**LLM 直接照此模板撰写**最终评论 `summary.md` 和 audit 用 `internal.md`。
>
> 评论统一**用中文写**(无论 PR description 是什么语言 —— 项目当前以中文 PR review 为主要场景;后续如需多语言可在 SKILL.md 注明 override)。

---

## 一、评论整体结构(7 段)

按下面的顺序输出。**节标题、图标、文字风格都尽量与模板一致**(确保 run-to-run 视觉一致)。

```markdown
{verdict.icon} **AET Review: {verdict.label}**

### 📝 这个 PR 做了什么
{prSummary.headline}

**主要改动:**
- {prSummary.mainChanges[0]}
- {prSummary.mainChanges[1]}
- ...

### ✨ 亮点 ({N})

> **🌟 {praiseFinding[0].title}** · `{file}:L{line}` · 维度 {axisIcon} {axisLabel}
>
> {praiseFinding[0].body}

> **🌟 {praiseFinding[1].title}** · ...
>
> {praiseFinding[1].body}

### 🎯 reviewer 重点关注 ({N})

> **{severityIcon} {topFinding[0].title}**
>
> 📁 `{file}:L{line}` · 维度 {axisIcon} {axisLabel} · 风险面 {faceIcon} {faceLabel}
>
> {topFinding[0].body}

> **{severityIcon} {topFinding[1].title}**
>
> 📁 `{file}:L{line}` · ...
>
> {topFinding[1].body}

### 🗂️ 风险面热点

本 PR 触及以下高敏感区域:

- **{faceIcon} {faceLabel}** — {faceHint}
  - 涉及文件: `{file1}`, `{file2}`, ...
- ...

### 📋 分轴评审结果

#### {axisIcon} {axisLabel} ({N})

> **{severityIcon} {finding.title}** · `{file}:L{line}` · {faceIcon} {faceLabel}
>
> {finding.body}

> **{severityIcon} {finding.title}** · ...
>
> {finding.body}

#### (其他 axes,按 axis 顺序遍历)

**Clean axes (无 finding):** {axisIcon} {axisLabel} · {axisIcon} {axisLabel} · ...

### 🛡️ 安全检查

- [{x|space}] 无硬编码密钥 / token / API key
- [{x|space}] 输入校验存在(用户输入边界、API 入参)
- [{x|space}] 授权 / 鉴权检查到位
- [{x|space}] 无 SQL / XSS / 命令注入风险
- [{x|space}] 敏感数据未泄露到日志

### 🧪 测试覆盖检查

- [{x|space}] 新增 / 修改代码有对应单元测试
- [{x|space}] 边界条件覆盖(空、null、极值)
- [{x|space}] 异常 / 错误路径有测试
- [{x|space}] 测试名称描述行为而非实现

### 📁 文件级摘要 ({N} 个文件)

- `{file}` +{adds}/-{dels} [{flags}] — {severitySummary or "✓ clean"}
- ...

---
<sub>AET PR review · 评审基于{sourceNote}{hiddenNote}</sub>
```

## 二、各节填写细则

### 1. Verdict(首行)

根据**可见的** findings(`filtered: true` 和 `confidence < threshold` 的不计入)计算:

| 条件 | verdict.icon | verdict.label |
|---|---|---|
| 至少 1 条 `blocking` | ⛔ | `BLOCKING - 不建议合并` |
| 无 blocking,至少 1 条 `important` | ⚠️ | `NEEDS ATTENTION - 需重点关注` |
| 都是 question/nit/suggestion/learning/praise | ✅ | `LGTM - 可以合并` |

> 注: `question` 不触发 BLOCKING / NEEDS ATTENTION —— 它表达"reviewer 不确定,想问 author",不是要求改动。

### 2. 📝 PR 摘要

- **headline**: 2-3 句话,**描述性**(做了什么、为什么、怎么做),**不评价**(不写"做得好"/"质量高")
- **mainChanges**: 3-5 条 bullet,**具体到文件/模块层级**
  - ❌ 不写 "重构代码 / 完善功能" 这种空话
  - ✅ 写 "新增 `agents/doc/index.js` 定义 doc agent" / "删除 `platform/package-lock.json`(子包不再独立管理)"
- 全中文,即使代码标识符 keep English

### 2.5 ✨ 亮点

- **内容来源**: 所有 `severity: 'praise'` 的 finding(无论它原本属于哪个 axis)
- **格式**: 与分轴评审同样的 `>` blockquote 卡片;每条 finding 顶行 `**🌟 {title}** · {file}:L{line} · 维度 {axisIcon} {axisLabel}`(若无 file 省略),空行后接 body
- **数量**: 不设上限。如果 LLM 评出 5+ 条 praise,都列出来(亮点节越丰富,review 越不像"挑刺")
- **空集**: 无 praise → **整节省略**(不写"无亮点")
- **去重**: praise findings **不**再出现在下方 📋 分轴评审节(避免重复;它们已经在亮点节展示了)

### 3. 🎯 reviewer 重点关注

- 数量: **1-3 条**,选自 LLM mark `topPriority: true` 的 findings
- 选择原则:
  - 1 条 blocking → 它就是首要
  - 多条 blocking → 选 1-3 个最严重 / 影响面最大的
  - 无 blocking、有 important → 选 2-3 条触及风险面或关键路径的 important
  - 都是 nit/suggestion → 选 1 条特别值得说的,或不出此节(renderer 退化到 severity 排序前 3)
- 格式: 每条 finding 作为 **`>` blockquote 卡片**(与分轴评审同样视觉,放在上方独立强调,内容全展开,无折叠)
- 每条 finding blockquote 内的结构(逐行):
  - 第 1 行: `**{severityIcon} {title}**` (粗体)
  - 第 2 行: `📁 {fileMeta} · 维度 {axisIcon} {axisLabel} · 风险面 {faceIcon} {faceLabel}` (元信息)
  - 第 3 行起: `{body}` (详细描述,可多段)
  - 没 file 的 finding(如 PR-quality)省略 fileMeta
  - 没 face 的 finding 省略 faceMeta
  - axis 总是有

### 4. 🗂️ 风险面热点

- 列出 `allFaces`(全 PR 触及的 unique faces 集合)
- 每个 face: 用**人类友好标签**(见下表),给 hint,列涉及文件
- 若 PR 没触及任何 face,**整节省略**(不要写"无风险面")

### 5. 📋 分轴评审结果

- 按 `AXIS_ORDER` 顺序遍历(见下表),每个 axis 一个 `####` 子节
- 每条 finding 用 `>` blockquote 包(默认全展开,无折叠;左侧 vertical bar 让 finding 间视觉分明)
- finding 内首行结构: `**{severityIcon} {title}** · `{file}:L{line}` · {faceIcon} {faceLabel}`;空行后写 body
- **空 meta 段省略,不留空 separator**(与 §3 同规则):无 line 时写 `file`(不写 `:L`);无 file 时整段 fileMeta 省略;无 face 时 faceMeta 省略。**严禁** 出现 `· · ·` 或行尾 `· `
- **title 不重复 severity 文字**:`severityIcon` 已在行首,title 是问题陈述本身。❌ `**⛔ BLOCKING — xxx**` → ✅ `**⛔ xxx**`(也别写 `IMPORTANT —` / `SUGGESTION —` / `FIX:`)
- 同一 axis 内,findings 按 severity 降序排
- **`praise` finding 不进此节** —— 它们都在 ✨ 亮点节展示(§ 2.5)。渲染前先 dedup,**严禁**同一条 praise 既出现在 ✨ 亮点又出现在分轴评审
- **`risk-face` axis 也算一个 axis**(虽然它不是 7 维之一,而是 PR-business 增量),放最后
- **Clean axes**: 把所有「无可见 finding」的 axes 用一行列出(让 reviewer 知道这些维度查过了没问题)
  - `risk-face` axis 不进 Clean 列表(它不是「7 维之一」)

### 5.5 🛡️ 安全检查 / 🧪 测试覆盖检查(静态 checklist)

两个固定 checklist,LLM 根据已 emit 的 findings 自动填 `[x]` / `[ ]`:

**🛡️ 安全检查**(每条对照 axis 2 / security 的发现):

| Item | 填 `[ ]` 当... |
|---|---|
| 无硬编码密钥 / token / API key | 有 security finding 提及"凭证 / token / key 出现在源码" |
| 输入校验存在(用户输入边界、API 入参) | 有 security finding 提及"缺输入校验 / 注入风险" |
| 授权 / 鉴权检查到位 | 有 security finding 提及"缺鉴权 / 越权" |
| 无 SQL / XSS / 命令注入风险 | 有 security finding 显式提及 injection |
| 敏感数据未泄露到日志 | 有 security finding 提及"日志包含敏感数据" |

**🧪 测试覆盖检查**(每条对照 axis 3 / testing 的发现):

| Item | 填 `[ ]` 当... |
|---|---|
| 新增 / 修改代码有对应单元测试 | 有 testing finding 显式说"缺测试 / 未覆盖" |
| 边界条件覆盖(空、null、极值) | 有 testing finding 提及"边界没测" |
| 异常 / 错误路径有测试 | 有 testing finding 提及"错误路径没测" |
| 测试名称描述行为而非实现 | 有 testing finding 提及"测试名拼实现细节" |

- **默认值**: 没有反例就填 `[x]`(乐观确认 reviewer 查过了);找到反例才打 `[ ]`
- **目的**: 让 reviewer 一眼看到 LLM 都具体查过哪些项,不是只看 Clean axes 一行抽象描述
- **空集**: 整 PR 在这两个 axis 都无 finding 时,checklist 全 `[x]`(也要写,而不是省略)

### 6. 📁 文件级摘要

- 普通 `###` 节,不折叠
- 每个文件一行: `\`{filename}\` +{adds}/-{dels} [{flags}] — {severitySummary}`
- `flags` 包含 `new_file` / `renamed_file` / `deleted_file` / `too_large` 中为 truthy 的(用逗号分隔)
- `severitySummary`: 按 severity 顺序排列,如 "⚠️ 2 🟡 1",若无 finding 写 `✓ clean`
- 顺序与 `files` 列表保持一致

### 7. Footer

- 一行 `<sub>` 包裹
- 包含: 是否本地 worktree / API diff 模式 · 被隐藏 finding 数(若有)
- 例: `<sub>AET PR review · 评审基于本地 worktree · 另有 3 条 finding 被隐藏(confidence < 70 或假阳性),完整记录在 internal.md</sub>`

---

## 三、Severity / Axis / Risk-face 标签表

### Severity(7 档)

| 档 | icon | upper-case label | 用法 |
|---|---|---|---|
| `blocking` | ⛔ | `BLOCKING` | 必须修才能合并 |
| `important` | ⚠️ | `IMPORTANT` | 强烈建议修,需讨论 |
| `question` | ❓ | `QUESTION` | reviewer 不确定/想问 author(vs `suggestion` 是 reviewer 知道更好做法) |
| `nit` | 🟡 | `NIT` | 小事,不阻塞 |
| `suggestion` | 🔵 | `SUGGESTION` | 替代方案/想法 |
| `learning` | 📚 | `LEARNING` | 教育性评论,无需 action |
| `praise` | 🌟 | `PRAISE` | 做得好,鼓励(进 ✨ 亮点节) |

### Axis(分轴评审顺序 + 中文标签 + icon)

按此顺序遍历:

| order | axis 字段值 | icon | 中文标签 |
|---|---|---|---|
| 1 | `functionality` | 🔧 | 功能正确性 |
| 2 | `security` | 🛡️ | 安全 |
| 3 | `testing` | 🧪 | 测试覆盖与质量 |
| 4 | `readability` | 📖 | 可读性 / 可维护性 |
| 5 | `performance` | ⚡ | 性能 |
| 6 | `style` | 🎨 | 风格 / 约定 |
| 7 | `pr-quality` | 📦 | PR 整体质量 |
| 8 | `risk-face` | 🗂️ | 风险面 (PR 业务) |

未知 axis 字段值,用 `·` 作 icon,原值作 label。

### Risk-face(5 类,人类友好标签 + hint)

| face 字段值 | icon | 中文标签 | hint |
|---|---|---|---|
| `auth` | 🔐 | 认证 / 授权 | 安全语义、token / session 处理 |
| `schema` | 🗄️ | 数据库 schema | migration 是否向后兼容,有无回滚方案 |
| `mass-delete` | 🗑️ | 大量删除 | 引用是否都迁移,是否需要 deprecation |
| `external-api` | 🌐 | 对外 API | API contract 是否破坏,client 需要同步升级吗 |
| `ci-cd` | ⚙️ | CI / CD 流水线 | 项目模板 / 流水线兼容性,默认值变化的影响 |

项目专属 face(从 `.aet/config.json` / `CLAUDE.md` 来):用项目自定义的 icon / 标签 / hint,若都没有,用 `·` + face 名字 + 空 hint。

---

## 四、Confidence 过滤(用 `confidenceThreshold`,默认 70)

写评论前先过滤一遍 findings 列表:

```
visible = findings.filter(f =>
  !f.filtered AND (f.confidence === undefined OR f.confidence >= confidenceThreshold)
)
```

- **`filtered: true`**: false-positive 已标(SKILL Step 5a 的 revise 或 Step 8 self-filter 标的)→ 不进评论,只进 internal.md
- **`confidence < threshold`**: LLM 自评不够自信 → 不进评论,只进 internal.md
- 没 confidence 字段(结构性 finding,如 deleted_file)→ 永远可见(若没被 filtered)

被隐藏的数量写进 footer:
```
另有 {hiddenCount} 条 finding 被隐藏(confidence < {threshold} 或假阳性),完整记录在 internal.md
```

---

## 五、Internal.md 模板(同时维护,供 audit)

internal.md 给 agent / 二次工具看,包含**所有** findings 包括隐藏的,加 tag 标识:

```markdown
# PR #{N} Internal Review (AET)

> 这是 AET 内部完整 review 产物,包含元数据 / 决策依据 / 全部 finding。
> 给 LLM agent / 二次工具 / audit 用,不直接发给开发者。

## Meta
- PR: {title}
- State: {state} (draft={draft})
- Source: `{head.repo.full_name}:{head.ref}` @ `{head.sha.slice(0,12)}`
- Target: `{base.repo.full_name}:{base.ref}` @ `{base.sha.slice(0,12)}`
- Code-source mode: **{codeSource}**
- Verdict: {verdict.icon} {verdict.label}
- 风险面 (PR-wide): `{face1}`, `{face2}`, ...

## PR Summary (LLM-written)
{prSummary.headline}

### Main changes
- {mainChanges[0]}
- ...

## 变更文件 ({N})
- `{file}` +{adds}/-{dels} [{flags}] → 风险面: [{faces}]
- ...

## Findings ({total} 总数, {visible} 显示在评论, {hidden} 隐藏)

### [1] {severityIcon} {SEVERITY} — {title} {tags}
- File: `{file}:L{line}`
- 风险面: `{face}`
- 评审维度: `{axis}`
- Confidence: {confidence}/100
- 过滤原因: {filterReason if filtered}

{body}

### [2] ...
```

`{tags}` 是状态标:
- `[TOP PRIORITY]` 若 `topPriority: true`
- `[FILTERED 假阳性]` 若 `filtered: true`
- `[LOW CONFIDENCE {conf}<{threshold}]` 若 confidence 低于阈值

---

## 六、Anti-patterns(反面教材)

❌ **节顺序乱搞** — 把 findings 放在 PR 摘要前。**首屏必须先看到 verdict + 摘要**,再看 findings。

❌ **重点关注里塞 5 条以上** — 重点关注的本意是「reviewer 进来就看这几个」。塞太多就失去意义,变成「分轴评审」的简化版。**严格控制 1-3 条**。

❌ **用 deleted_file 这种字段值出现在评论里** — 那是程序员字段名。用「`[deleted_file]`」之类的 inline tag 标识可以,但**不要**写成「文件标志为 deleted_file = true」这种机器化句子。

❌ **filtered finding 漏出来** — 如果一个 finding 被 mark `filtered: true`,**绝对不能**出现在评论可见区(包括分轴评审、重点关注、风险面热点)。只能出现在 internal.md。

❌ **PR 摘要写评价** — 摘要要描述性,不评价。「本 PR 质量优秀」/「实现得很好」都是不合适的摘要内容。把评价留到 🌟 praise 类 finding 里写。

❌ **title 里重复写 severity** — `severityIcon`(⛔ / ⚠️ / 🔵 / 🟡 / ❓ / 📚 / 🌟)已经在行首表达了 severity。title **不要**再写 `BLOCKING — `、`IMPORTANT — `、`SUGGESTION — `、`FIX: ` 这些前缀,直接写问题本身。

❌ **空 meta 段留 `· · ·` 或末尾 `· `** — finding 无 file / 无 face / 无 line 时,**整段 meta 省略**,不是显示空 separator。`**🟡 title** · · ·` 这种行是 bug,渲染时漏检测了。

❌ **`praise` finding 在分轴评审节又出现一次** — praise 严格只在 ✨ 亮点节展示。如果它也出现在「📋 分轴评审 → #### 📖 可读性」这类子节里,就是重复了 —— 渲染前必须 dedup。
