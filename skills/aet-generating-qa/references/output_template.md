# Output Template

This is the exact Markdown template to follow for the generated Q&A file. The Q&A pairs are **grouped by Q&A category** (e.g., 产品介绍 / 安装配置 / API 使用 / 调试调优 …), and the set of categories is decided in Step 2 from what the source actually contains. Use the same heading levels, the same metadata block at the top, and the same `**来源**` tag format on its own line.

---

```markdown
# Q&A — <项目或资料名称>

> 由 qa-generator skill 自动生成  
> 生成日期: <YYYY-MM-DD>  
> Q&A 对数: <N>  
> 章节分布: <分类A> <countA> / <分类B> <countB> / <分类C> <countC>  
> 来源: <local-path | cloned from <remote-url>>

## <Q&A分类 1，例如"产品介绍">

### Q1. <question>

<answer paragraph(s). Self-contained. Mentions concrete identifiers,
file paths, config keys, command flags — whatever the source actually
contains. If a code snippet helps, include it in a fenced block.>

**来源**: `path/to/file.ext:42`

### Q2. <question>

<answer>

**来源**: `path/to/file.ext:18`, `path/other.ext:7`

## <Q&A分类 2，例如"安装配置">

### Q3. <question>

<answer>

**来源**: `path/to/file.ext:88`

## <Q&A分类 3，例如"API 使用">

### Q4. <question>

<answer>

**来源**: `lib/some.js:55`

...

## 覆盖范围说明

本份 Q&A 覆盖以下分类及对应来源：

- **产品介绍** — 来自 `Readme.md` 第 1-60 行、`package.json` 的 description 字段
- **安装配置** — 来自 `package.json` 的 engines/files 字段、`.env.example`
- **API 使用** — 来自 `lib/*.js` 中导出的公开方法
- **调试调优** — 来自 `lib/error.js` 与 `docs/troubleshooting.md`

以下部分未覆盖（说明原因）：

- <e.g., vendor/ 目录下的第三方代码 — 不属于项目自身逻辑>
- <e.g., dist/ 与 *.min.js — 自动生成的构建产物>
- <e.g., src/legacy/ 模块 — 已在 README 中标注为弃用，未生成问答>
- <e.g., "部署运维" 分类 — 源材料中无部署/运维相关内容，未生成该章节>
```

---

## Notes on Each Section

### Metadata block

- Use the fields exactly: `由 qa-generator skill 自动生成`, `生成日期`, `Q&A 对数`, `章节分布`, `来源`.
- `章节分布` lists the Q&A categories you actually produced, with the pair count for each, separated by ` / `. Order categories in the order they appear in the file. Do **not** include categories with 0 pairs here — those go in `覆盖范围说明`.
- `来源` is either `local-path` (absolute or relative to the user's working directory) or `cloned from <remote-url>` when the source was a remote repo.
- If you cloned into a temp directory, the temp path itself is not relevant to the user — what matters is the remote URL it came from.

### Category sections

- One `## <category>` heading per chosen Q&A category. Use the source's own terminology for category names when possible (e.g., if the README calls it "Quick Start", use "快速入门 (Quick Start)" not "起步指引").
- Inside each category section, pairs use `### Q<N>. <question>` — numbering runs **sequentially across the whole file** (Q1, Q2, ..., QN), not per-section. This lets users cite a pair by its global number.
- Pair count per category is whatever the source actually supports — 1 pair is valid, do not pad. The only rule: a category with 0 pairs should be dropped entirely (no empty `##` heading); 0-pair categories go in `覆盖范围说明` only.

### Each Q&A pair

- Heading: `### Q<N>. <question>` — N runs from 1 to N, sequentially.
- Answer paragraph(s) immediately follow the heading, no blank line in between (or one blank line, be consistent within the file).
- End with the `**来源**` tag on its own line. Use backticks around the path:line. If multiple locations, comma-separated inside a single backtick group: `` `a.ts:1`, `b.ts:2` ``. **Always use forward slashes `/` in paths**, even when the source was on Windows — convert `src\auth.ts` → `src/auth.ts` before writing.
- Do not add a horizontal rule (`---`) between pairs — it pollutes the Markdown outline.

### Coverage notes section

- Always include this section, even if everything was covered.
- For covered categories, list each category with the source locations that fed it.
- For "未覆盖", be honest. List:
  - Files/directories intentionally skipped (vendored, generated, deprecated).
  - **Categories from the palette that the source didn't support** (e.g., "部署运维" 分类 — 源材料中无部署/运维相关内容). This is the same honesty that drives the 0-count categories in the metadata, just stated here for the reader.

## Forbidden Variations

- Do not omit the metadata block.
- Do not use the question-form axis (事实/概念/操作/调试/最佳实践/边界/反推) as section headings. Section headings are Q&A categories. The form axis is internal only.
- Do not number pairs per-section (Q1 in each section). Numbering is global.
- Do not put the `**来源**` tag inside the answer paragraph — it must be on its own line.
- Do not use `Source:` / `来源：` (English or wrong colon). Always `**来源**: ` with a half-width colon and bold.
- Do not invent line numbers. If you can't pin a line, cite the file path alone. Always use forward slashes `/` in paths (convert Windows backslashes before writing).
- Do not include a category in `章节分布` with 0 pairs — those go only in `覆盖范围说明`.
