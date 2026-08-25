# Q&A Taxonomy

This reference defines how to classify generated Q&A. The skill uses **two orthogonal axes** — only one of them appears in the output file.

## Axis 1 — Q&A Category (主轴，决定输出章节)

This is the axis users care about. Each Q&A pair is tagged with a **Q&A category** drawn from what the source actually contains. The set of categories is **not fixed** and **not a quota** — you decide it in Step 2 (source map) based on what the input material actually covers, then group the output file by these categories as `##`-level sections. Every run can produce a different category set; the same category list across very different inputs is a smell that you are forcing a template instead of reading the source.

### Why the category set is not fixed

Different inputs produce very different natural categories. A library has "API 使用"; a CLI tool has "命令行参数"; a deployment runbook has "部署运维"; a research paper has "方法与实验". Hardcoding a universal list would force weak pairs into categories the source doesn't support. The list below is **a palette of common categories — a reference for naming, not a checklist to fill**. **Priority order: (1) use a palette name as-is when the source supports it; (2) rename a palette entry to match the source's terminology only if the palette name fits imperfectly; (3) coin a brand-new category name ONLY when no palette entry covers the topic at all.** Jumping to step 3 when step 1 or 2 would work is a smell — you pick only the ones the source actually supports, but you must check the palette exhaustively before coining. A run that produced all 10 palette categories would be a red flag that you did not actually read the source; a run that produced zero palette categories and only coined names is an equal red flag that you skipped the palette.

### Common category palette

| Category | When the source supports it | Typical question shape |
|---|---|---|
| 产品介绍 | README intro, project description, "what is this" (includes architecture overviews — architecture is part of "what this project is") | 项目是干什么的、解决什么问题、整体架构是什么、与 X 有什么区别 |
| 安装配置 | INSTALL doc, `package.json` engines, env vars, config files | 怎么装、需要什么环境、某个配置项的默认值 |
| 快速入门 | Quick Start section, examples/ directory | 最小可用例子、第一次怎么跑通、怎么跑测试看是否正常 |
| API 使用 | Public exports, function signatures, type defs | 某个函数的签名、参数、返回值、用法 |
| 命令行参数 | CLI flags, `program.option(...)` calls | 某个 flag 的作用、长短形式、默认值 |
| 集成扩展 | plugin/extension points, hooks, lifecycle | 怎么嵌入到 Y、扩展点在哪、hook 触发顺序 |
| 部署运维 | Dockerfile, k8s manifests, deploy scripts | 怎么部署、健康检查、扩缩容 |
| 调试调优 | troubleshooting docs, error codes, perf notes | 某报错怎么办、性能瓶颈、日志位置 |
| 约束限制 | LIMITATIONS doc, `// TODO`/`// FIXME`, unsupported use cases | 不支持什么、有什么上限、不能怎么用 |
| 版本演进 | CHANGELOG, release notes, deprecation notices | 哪个版本引入、什么时候改的、已弃用什么、迁移路径 |

### How to pick categories for a given input

In Step 2 while building the source map, also walk this checklist:

1. For each palette entry above, ask: "Does the source actually contain material that answers questions in this category?" If yes → include the category; if no → skip it.
2. If the source has a coherent topic that none of the palette entries name well (e.g., a paper has "实验设置", a game has"关卡设计"), coin a new category name. Use the source's own terminology where possible.
3. **Don't preset the category count or the per-category pair count.** Both are downstream of how much the source actually supports. A 30-line readme might yield 2 categories × 3 pairs each; a 5k-line codebase might yield 6 categories × 10-15 pairs each. There is no "minimum 3 categories" or "minimum 2 pairs per category" rule — if the source only supports 1 category with 1 pair, that's the honest output.
4. A category with only 1 pair is **valid**. Do not fabricate a second pair to fill the section, and do not fold it into a sibling just to avoid the orphan. Single-pair categories are honest signal that the source has limited material on that topic.
5. **Granularity: a Q&A category = one coherent topic, not one document heading.** A single coherent-topic document is ONE category, not one category per section. Merge test: ask — can ANY single topic name cover all the candidate categories? If yes → merge into one. Only split when no single topic name can cover them (genuinely distinct topic areas, not just different document sections). The SKILL.md version of this test is a hard gate requiring one check before Step 2B presentation.

The output file then has one `## <category>` section per chosen category, with `### Q<N>` pairs inside. Numbering runs sequentially across the whole file (Q1, Q2, ... QN) so users can cite a pair by its global number.

## Axis 2 — Question Form (副轴，不进入输出，仅用于自我检查)

This axis reminds you to **vary the form** of questions within each category. A "API 使用" section where every question is "X 函数的签名是什么？" is boring even if all answers are correct. Use this checklist internally while writing pairs in each category — make sure the section is not all one form.

| Form | Trigger words | When to use |
|---|---|---|
| 事实 (factual) | 是什么、有什么、值是多少 | Pin a concrete fact (signature, default, file path) |
| 概念 (conceptual) | 为什么、设计原因、与 X 的区别 | Explain a design choice the source evidences |
| 操作 (operational) | 怎么、如何、运行什么命令 | Step-by-step recipe from the source |
| 调试 (debugging) | 报错、失败、调用链、谁触发 | Failure mode, error path, recovery hint |
| 最佳实践 (best practice) | 推荐、什么时候用、反模式 | Recommended usage the source evidences |
| 边界 (boundary) | 不支持、限制、上限、超过 | Constraint, what X does not do |
| 反推 (reverse lookup) | 想实现 Y、用哪个 API | Goal → API mapping for onboarding |

This axis is **not** rendered in the output file, not in the metadata block, not in the Step 5 report. It is purely a self-checklist to keep each category's questions varied.

## Common Anti-Patterns

- **Trivia questions** that no real user would ask ("文件第 42 行是什么字符？"). The question has to make sense outside of a trivia game.
- **Yes/no questions** with one-word answers. Either rephrase to "在什么情况下 X 为真？" or expand the answer to include the why and when.
- **Speculation questions** ("作者为什么这样写？") where the source offers no evidence. Drop them. The skill's value is verifiability.
- **Duplicate questions** that probe the same fact with different phrasing. Self-check before writing each pair.
- **Hardcoded category list.** Don't force categories the source doesn't support. A pure docs repo shouldn't have a "部署运维" section with fabricated pairs. **A run that produced all 10 palette categories would be a red flag that you did not actually read the source.**
- **Over-coining new category names.** Before coining a new name, ask: can any palette entry cover this topic, even imperfectly? If yes, use the palette name (optionally renamed via priority step 2). A new name is justified only when the source has a coherent topic that no palette entry names well — not when the palette entry merely fits imperfectly. Imperfect fit is what priority step 2 (renaming) is for.
- **Single-pair categories are fine.** Do not fabricate a second pair to fill a section, and do not fold a 1-pair category into a sibling just to avoid the orphan. Single-pair categories are honest signal that the source has limited material on that topic. The only rule on category granularity: if a category has 0 pairs (i.e., you can't find any source-supported question for it), drop the category — don't keep an empty section heading.
- **Categories that are just synonyms for "Q&A".** Don't name a category `常见问题` or `FAQ` — that's the same concept as Q&A itself, not a content area. Categories must describe a topic the source covers (安装配置, API 使用, 调试调优, …), not the shape of the output.
- **Treating all source lines as Q&A-worthy.** A 50k-line codebase is not 50k lines of Q&A material — most of it is boilerplate, internals, or tooling that no real user would ask about. Filter to the Q&A-worthy slice (public API, configs, docs, error paths, design decisions) before estimating pair count. See SKILL.md Step 2 for the full filter checklist. Pair count follows the Q&A-worthy slice, not raw line count.
