---
name: aet-generating-qa
description: Generate structured Chinese Q&A pairs from local files, local repositories, or remote Git repository URLs. Use this skill whenever the user wants to produce Q&A pairs, FAQ items, question-answer datasets, or knowledge-base question sets from any source — including docs, code, markdown, notebooks, or whole repos. Trigger on phrases like "生成问答", "生成 Q&A", "生成QA对", "做一份FAQ", "提取问答", "出题", "generate Q&A", "build FAQ", "create question answer pairs", "extract Q&A", "问答对生成", "知识库问答", "RAG问答数据". Also trigger when the user provides a local path or a repository URL (github.com / gitee.com / atomgit.com / git@ URL / owner/repo shorthand) and asks for any kind of question-answer extraction, FAQ generation, study cards, interview prep, or exam-style questions. Even if the user does not say "Q&A" explicitly, if their intent is to turn a codebase or document into a set of questions with answers, use this skill.
---

# Q&A Generator

Turn any input — local files, a local repository, or a remote Git repository URL — into a structured Markdown file of Chinese question-answer pairs. Every answer is grounded in concrete evidence taken from the source and is annotated with a `**来源**: <relative-path>:<line>` tag so a human reviewer can verify each claim.

## Design Principles

1. **Source-grounded answers.** Every answer must trace back to a specific line in the source material. If you cannot find a verifiable source, do not invent one — either rephrase the question so the source is clear, or drop the question. This skill exists to produce trustworthy Q&A, not plausible-sounding hallucinations.
2. **Coverage follows the source.** What gets asked depends entirely on what the source actually contains — never force a fixed set of question types or Q&A categories. A pure docs repo has no debug paths to probe; a config reference has no API surface. Cover what the source supports, skip what it doesn't, and tell the user in the report what was skipped and why. See `references/qa_taxonomy.md` for the question-form checklist (internal use only, not rendered in output).
3. **Chinese interaction — CRITICAL.** Every user-facing message — `question` tool prompts, headers, options, info messages, the final completion message, error messages — MUST be in Chinese. The Q&A content itself is also Chinese by default. Code identifiers, file paths, and command snippets inside answers stay in their original form.
4. **Respect scale.** A 5-file docs folder and a 50,000-commit monorepo are very different problems — pick the right exploration depth based on input size (see Step 1A scale check).
5. **Filter for Q&A-worthy material.** Not all source content is worth a Q&A pair — only public API, configs, docs, error paths, and design decisions are. Private internals, repetitive boilerplate, and test files themselves don't generate pairs even if present in the source (see Step 2 filter checklist).

## Inputs

The user may provide any of the following. Detect the type automatically; do not require the user to declare it.

| Input form | Examples | Handling |
|---|---|---|
| Local file path | `D:\docs\spec.md`, `./README.md` | Read directly. If it is a single doc, base Q&A on that doc alone. |
| Local directory path | `D:\repos\myproj`, `.` | Treat as a local repository. Walk the tree, analyze code + docs. |
| Git HTTPS / SSH URL | `https://github.com/o/r.git`, `git@github.com:o/r.git` | Clone (shallow) into a temp dir, then analyze. |
| `owner/repo` shorthand | `anthropics/claude-code` | Expand to `https://github.com/<owner>/<repo>.git` and clone. |
| Web URL on a supported platform | `https://github.com/o/r`, `https://gitee.com/o/r`, `https://atomgit.com/o/r` | Append `.git` (or use the platform's clone URL) and clone. |

If the input is ambiguous (e.g., a path that does not exist locally but looks like `owner/repo`), try local first, then remote. If both fail, ask the user to clarify.

For Windows environments, prefer the bundled `scripts/clone_repo.ps1` to perform the clone so that temp-directory cleanup and shallow-clone flags are handled consistently.

## Workflow

### Step 0 — Clarify only what's missing (no default-asking)

Do **not** run a fixed battery of `question` prompts. Most fields have sensible defaults and the user has already typed what they want in their initial message — re-asking "是否继续？" or "用默认值吗？" is friction.

Apply this rule instead: for each of the four scope fields, check if the user's initial message already supplied a value. If yes, use it silently. If no, use the default silently. **Only ask via the `question` tool when a field is missing AND you genuinely cannot proceed without it.**

| Field | Default (used silently if user didn't specify) | When to actually ask |
|---|---|---|
| Input source | — (no default) | **Always ask if not detected** from the initial message. Use `question` with a single free-text prompt (in Chinese): "请提供输入源：本地路径、本地仓库目录，或远程仓库地址（github/gitee/atomgit URL 或 owner/repo 简写）。" If detected correctly, never ask "是否继续？" — just proceed. If the detected form is ambiguous (e.g., `owner/repo` could be local-or-remote), try local first; if it fails, fall back to remote; if both fail, then ask. |
| Pair count | Determined by source material (estimated after Step 2 source map; no fixed preset) | Only ask if the user explicitly requested a specific count but didn't give a number. Otherwise: do not pick a number up front — produce as many quality pairs as the source actually supports, and tell the user in Step 2B how many you estimate. The number is a downstream result, not an input. |
| Q&A categories | (no default — decided in Step 2B from source material) | Never ask here. Step 2B handles category selection/confirmation. |
| Output path | Local file/dir input → `qa-output.md` in the same directory; Remote repo input → `$env:USERPROFILE\qa-output.md` (user home, avoids landing in the working dir like `C:\Windows\System32`) | Only ask if the default path would overwrite an existing file. Otherwise use the default silently and tell the user in the Step 5 report where the file was written. |

When you proceed silently with defaults, **state in one line at the top of Step 1** what you detected and what defaults you're using — e.g., "输入源：远程仓库 `https://github.com/tj/commander.js`（将浅克隆到临时目录）；Q&A 数量：由源材料决定（不预设固定值，Step 2 估算、Step 2B 与你确认）；输出：`C:\Users\<you>\qa-output.md`；Q&A分类：由源材料决定并在 2B 确认。如需修改请回复。" — this gives the user a one-shot chance to correct, without blocking on a `question` call.

### Step 1 — Acquire the source material

#### 1A. Local file or directory

- Use `glob` to enumerate files. Sensible defaults:
  - Include: `**/*` for small inputs (<200 files).
  - For larger trees, first list top-2-level structure with `glob` (`*`, `*/`), then drill into the most relevant subdirectories.
- Always skip:
  - `.git/`, `node_modules/`, `vendor/`, `dist/`, `build/`, `target/`, `.next/`, `__pycache__/`, `.venv/`, `venv/`, `.idea/`, `.vscode/`, `.cache/`, `tmp/`, `logs/`, `coverage/`
  - Any binary blobs (`.png`, `.jpg`, `.zip`, `.lock`, minified bundles).
- Read text files with the `read` tool. For very large files, read in windows (use `offset`/`limit`).

**Scale check after enumeration** — once you know the file count and approximate total text size, sanity-check against these buckets:

| Scale | Signals | What to do |
|---|---|---|
| Tiny | **< 5 files AND < 200 lines total** (both must hold) | Proceed normally, but in Step 2 estimate pair count honestly — a 30-line doc will likely yield 3-5 pairs, not 20. Tell the user up front. |
| Medium | 5-200 files, fits comfortably in context | Proceed normally. |
| Large | 200-2000 files OR > 100k lines | You cannot read everything. In Step 2, sample strategically: README + manifest files + the top-level entry of each major module + the most-referenced files. Write the `.qa-sourcemap.md` scratch file. Tell the user "由于仓库较大（X 文件 / Y 行），采用采样分析策略，重点覆盖 <列表>，未覆盖 <列表>。" |
| Huge | > 2000 files OR > 500k lines | Same as Large, but be even more aggressive about sampling. Consider narrowing to one sub-tree — ask the user "源材料规模很大（X 文件），是否聚焦在某个子目录？" before proceeding. |

If the user explicitly asked for N pairs (e.g., "生成 50 对") but the source scale is Tiny and can only support 5, **tell them in Step 2B** — don't silently produce 50 weak pairs. The estimate you present in Step 2B should reflect this scale reality.

#### 1B. Remote Git repository

1. Run the bundled clone script:
   ```powershell
   & "<skill-dir>\scripts\clone_repo.ps1" -Remote <url-or-shorthand> [-Dest <temp-dir>]
   ```
   The script normalizes `owner/repo`, GitHub/Gitee/AtomGit web URLs, and `git@` SSH URLs, does a `--depth=1` shallow clone, and prints the local path of the cloned tree.
2. If the clone fails (auth required, private repo, network), surface the exact git error to the user in Chinese and ask whether to provide credentials or switch to a local path. Do not silently fall back. **If auth is the issue**, suggest the user either (a) provide a PAT through the URL (`https://<PAT>@github.com/o/r.git`), (b) configure git credential helper beforehand, or (c) clone manually elsewhere and pass the local path instead. Don't try to handle credentials inside the skill — that's the user's environment to manage.
3. Once cloned, treat the local clone as in 1A.

### Step 2 — Build a source map and propose Q&A categories

Before generating questions, build a mental (and optionally written) **source map** so each question can be tied to a precise location. The map covers:

- Project type and tech stack (README, `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `pom.xml`, …).
- Directory layout — top-level folders and what they hold.
- Core modules and their entry points.
- Public API surfaces (exported functions/classes, REST endpoints, CLI commands).
- Configuration files and their important knobs.
- Any embedded docs (`.md`, `docs/`, `README*`, docstrings, JSDoc).

For small inputs this map fits in your head; for large repos write a brief outline to a scratch file (e.g., `<workspace>/.qa-sourcemap.md`) listing each category + the file paths and line ranges that support it. **Step 3 will reference this file when picking targets and citing sources** — without it, large-repo answers will lose accurate line numbers.

**Filter for Q&A-worthy material before picking categories — MANDATORY, every input.** Run this filter on every input regardless of size or type; a single short document is NOT an excuse to skip it — single-doc inputs are exactly where near-duplicate variants hide and get over-produced, so they need the filter the most. For Large/Huge repos, run it on the sampled slice from Step 1A. Not everything in the source is worth a Q&A pair. A 50k-line codebase may only have ~5% Q&A-worthy content — the rest is boilerplate, internals, or tooling that no real user would ask about. Estimate pair count from the Q&A-worthy slice, not the raw source size.

Before picking categories, internally produce two lists (do **not** display these to the user — they are a self-check): (a) the Q&A-worthy slice — what stays, with the source lines that support each item; (b) the filtered-out list — what you removed or merged, and why. If the filtered-out list is empty, you almost certainly under-applied the filter — re-check for near-duplicate variants and trivia before proceeding.

Q&A-worthy (use for picking categories + estimating counts):

- Public API surfaces — exported functions/classes, REST endpoints, CLI commands
- Configuration files and their user-facing knobs (env vars, config keys, default values)
- Documentation — README, docs/, docstrings, JSDoc that explains usage
- Typical usage patterns visible in the `examples/` directory or documented usage snippets in README — these are first-class Q&A-worthy material.
- Error paths, failure modes, limitations the user will actually hit
- Design decisions where the source evidences the "why" (comments, ADRs)

Not Q&A-worthy (skip even if Step 1A didn't filter them):

- Private/internal implementation details — private methods, internal state machines. If a behavior is observable from the public surface, ask about that instead.
- Repetitive boilerplate — merge to 1 representative pair ("典型 reducer 的写法是什么？"), not 10 near-duplicate pairs.
- Non-answer-source files — test files, type stubs (`*.d.ts`, `*.gen.ts`), lint/CI configs. You may read tests to reverse-engineer typical usage for picking targets, but never cite a test assertion line as `**来源**` — cite the implementation. (The `examples/` directory, by contrast, IS first-class Q&A-worthy.)

The pair-count estimate you produce in this Step 2 (and confirm in Step 2B) is based on the Q&A-worthy slice after this filter — never on raw line count. A 5k-line codebase that's 80% boilerplate may have the same Q&A-worthy surface as a 500-line curated API reference.

**Also propose the Q&A categories here, not generate them yet.** Based on what the source actually contains, pick a **candidate set** of Q&A categories for this run. Q&A categories are concrete, source-specific topics — the actual names and which ones apply are decided by the source material, **not** by a fixed template. A library's source naturally yields `API 使用` / `约束限制`; a CLI tool's yields `命令行参数`; a research paper yields `方法与实验` — these are examples, not a checklist to fill. The full palette (only as a reference, not a quota) and the rule for picking categories are in `references/qa_taxonomy.md` (Axis 1). The rule of thumb: include a category only if the source actually contains material for it — a pure docs repo shouldn't have a `部署运维` section with fabricated pairs. If the source has a coherent topic none of the palette names cover, coin a new category name using the source's own terminology.

**Don't preset the category count or the per-category pair count.** Both are downstream of how much the source actually supports. A 30-line readme might yield 2 categories with 3 pairs each (6 total); a 5k-line codebase might yield 6 categories with 10-15 pairs each (60-90 total). A category with only 1 pair is **valid** — do not fabricate a second pair to fill it, and do not fold it into a sibling just to avoid the orphan. Single-pair categories are honest signal that the source has limited material on that topic. Similarly, the total pair count is whatever the source supports after self-checking — never pad to hit a target.

This Step 2 produces only the **candidate list** + the source material that supports each category + a **rough estimate of pair count per category** (which you'll confirm with the user in Step 2B). The list is **not final** — it goes to Step 2B for user confirmation before any Q&A pair is generated.

**Granularity merge test — MANDATORY hard gate before Step 2B.** If your candidate list has >1 entry, you must produce (internally, not displayed to the user) one check: can ANY single topic name cover all candidate categories? If yes → merge into one category (pair estimate = sum) before presenting in Step 2B. Only split when no single topic name can cover them — i.e., genuinely distinct topic areas, not just different document sections. **Red flag**: if your candidates mirror the source's section headings 1:1, you almost certainly need to merge — headings index document structure, not topic areas. The conceptual rule is in `references/qa_taxonomy.md` rule 5.

### Step 2B — Confirm Q&A categories with the user (default gate)

This is the **default gate** between proposing categories and generating pairs — by default, you present the candidate categories to the user as plain text in the chat, then wait for the user to reply. (Skip conditions are listed at the end of this step.) Do **not** use the `question` tool's option-picker here — the user explicitly wants to type free-form feedback like "同意" / "OK" / "通过" / "把 X 改成 Y" / "加一个 Z" / "去掉 X" / "把 X 和 Y 合并".

**Presentation format** (output as a single Chinese message, no tool call):

```
已根据本次源材料识别出以下 Q&A分类（候选）。这是按源材料实际内容挑出来的，不是固定模板，因此可能跟其他输入跑出来的分类集合不同：

1. <分类A> — <一句话说明支撑来源，如"来自 Readme.md 第 1-60 行 + package.json description">（预估 <countA> 对）
2. <分类B> — <来源说明>（预估 <countB> 对）
3. <分类C> — <来源说明>（预估 <countC> 对）
...

合计预估 <N> 对。这只是估算——源材料实际能支撑几对要等 Step 3 self-check 完才知道，最终可能多可能少。

请确认：
- 回复"同意"/"OK"/"通过"等确认词 → 我会按此清单生成 Q&A
- 回复修改意见（如"加一个 X 分类"、"把 Y 改成 Z"、"去掉 X"、"X 合并到 Y"、"X 多挖点"）→ 我会按意见调整后重新呈现
```

**Feedback loop**:

- If the user replies with a confirmation phrase (`同意` / `OK` / `通过` / `可以` / `没问题` / `继续` / `go` / `确认` etc.), the candidate list is **frozen** and you proceed to Step 3.
- If the user replies with modification instructions, interpret them and produce an updated candidate list, then present it again in the same format. **Apply only the latest round's instructions** — if the user said "加 X" in round 1 then "去掉 X" in round 2, the final list has no X. Do not remember and re-apply superseded instructions.
- If the user's feedback is ambiguous (e.g., "X 看起来不太对" without a clear instruction), ask one short clarifying question in chat — don't guess.
- If the user has gone many rounds without confirming but each round brings a modification, keep iterating — multi-round refinement is legitimate. Only if you see **two consecutive rounds with no concrete change** (e.g., the user just keeps asking "你确定吗？"), ask explicitly: "是要我按当前清单生成，还是再调整？请回复'同意'或具体修改意见。" Don't trap the user in an infinite loop, but don't push them to freeze either.

**What the user is allowed to change**:

- Add a new category (you should sanity-check it's supported by the source; if the source doesn't actually contain material for it, **do not fabricate pairs to fill it** — that violates the skill's "never pad" principle. Instead tell the user "源材料中未发现支撑『<分类>』的内容，可以选择跳过，或提供补充材料（路径/URL），我读到后再加入候选清单。").
- Rename a category (e.g., "把 'API 使用' 改成 '接口参考'").
- Remove a category (you should warn if removal loses material — "去掉 '约束限制' 会丢失 lib/error.js 中的边界信息，确认吗？").
- Merge two categories (e.g., "把 '安装配置' 和 '快速入门' 合并为 '上手指南'").
- Rebalance pair counts per category (e.g., "API 使用多挖点，到 10 对"). **Treat the user's number as a preference to dig deeper, not a hard target.** If the source material can only support fewer pairs after deeper mining, the final output will be fewer — tell the user in Step 5 what was actually produced and why it came in under the preference. Do not fabricate pairs to hit the user's number.

After confirmation, briefly echo the frozen plan back to the user (one line: "已确认：<分类列表>，共 N 对，开始生成 Q&A。") so they know the loop closed, then proceed to Step 3.

**Skip-this-step condition**: any of the following lets you freeze the candidate list yourself and skip the interactive loop, going straight to Step 3. In all cases, mention in the final Step 5 report that the category plan was auto-frozen without user confirmation, and why.

- The user said in their initial message something explicit like "不要问我，直接出" / "全自动跑完" / "don't ask, just go".
- The user already specified the category list (or a single category) in their initial message (e.g., "生成产品介绍和 API 使用两个分类的 Q&A" or "只出 API 使用分类"). **Important**: even when freezing from the user's list, you still must source-check each category against the source material (same rule as "Add a new category" above). If the user-specified list contains a category the source doesn't actually support, drop that category and tell the user in Step 5 ("用户指定了『<分类>』但源材料无支撑内容，已跳过"). Do not fabricate pairs to honor the user's list — the "never pad" principle wins over "respect the user's list".

### Step 3 — Generate Q&A pairs

For each pair, follow this loop:

1. **Pick a target** from the Q&A-worthy slice (Step 2's filter output) — use `.qa-sourcemap.md` if Step 2 wrote one. Spread across the slice, grouped by confirmed categories from Step 2B. **If you can't find a new uncovered target, stop early** — don't reach into filtered-out material just to keep producing pairs.
2. **Formulate a Chinese question** that a real user would ask. Use natural phrasing, not "According to line 42, what is…". Vary the **question form** (事实/概念/操作/调试/最佳实践/边界/反推 — see `references/qa_taxonomy.md` Axis 2) within each category so a section isn't all "X 是什么？".
3. **Compose a Chinese answer** that is:
   - Self-contained (the answer alone, without seeing the source, is meaningful).
   - Specific (mentions concrete identifiers, file paths, config keys, command flags — whatever the source actually contains).
   - Verifiable (the reader can open the cited source location and confirm).
4. **Attach a source tag** in this exact format, on its own line right after the answer:
   ```
   **来源**: `path/to/file.ext:42`
   ```
   - Use the path **relative to the input root** (the cloned repo root, or the user-provided directory). **Always use forward slashes `/`** even on Windows — Markdown link compatibility and cross-platform consistency both favor `/`. Convert `src\auth.ts` → `src/auth.ts` before writing the tag.
   - For multiple source locations, comma-separate on the same `**来源**` line: `**来源`: `a.ts:1`, `b.ts:2` ``.
   - Line numbers must point at the actual line that supports the claim. If you genuinely cannot pin a line (e.g., a directory-level convention), use the path alone without `:N`. Never fabricate a line number.

5. **Self-check the pair** before moving on:
   - Is the question answerable from the source alone? (Not from general knowledge.)
   - Does the answer avoid speculation beyond what the source says?
   - Is the source tag pointing to a real line you read?
   - **Re-read the cited source line(s) right now** (use `read` with `offset`/`limit` if the file isn't already in context). Confirm the line's content actually supports the answer's specific claim. If the line says something weaker or different than what your answer asserts, either fix the answer to match the line, fix the source tag to point at a better line, or drop the pair. This is a hard gate, not a soft suggestion — the skill's value is verifiability.

If a pair fails the self-check, either fix it or drop it. Do not keep weak pairs just to hit a count target — there is no count target. Quality beats padding. A run that ends up with fewer pairs than the Step 2B estimate is fine; tell the user in Step 5 which planned pairs got dropped and why.

### Step 4 — Write the output Markdown file

Use the template in `references/output_template.md`. Key points:

- Top of file: metadata block with source summary, generation date, total pair count, **章节分布** (Q&A categories with their pair counts), and how the source was obtained (local path / cloned from <url>).
- Body: pairs **grouped by Q&A category** as `## <category>` sections, each containing `### Q<N>. <question>` pairs. Numbering runs **sequentially across the whole file** (Q1, Q2, ..., QN) — not per-section — so users can cite a pair by its global number.
- Each pair: answer paragraph(s) below the heading, then the `**来源**` tag line on its own line.
- End of file: a "## 覆盖范围说明" section noting (a) which source files fed each category, (b) which files/dirs were intentionally skipped by Step 1A (vendored, generated, deprecated, binary), (c) any palette category the source didn't support (e.g., "部署运维 — 源材料无支撑内容"), and (d) material present in the source but filtered out by Step 2's Q&A-worthy filter — private internals, boilerplate (merged to 1 pair), test files / type stubs / lint configs (not cited as source). One line per type is enough.

Write the file using the `write` tool to the path chosen in Step 0 (silent default or user-specified).

### Step 5 — Report to the user

After writing the file, output a concise **Chinese** completion message (the message the user sees must be in Chinese per Design Principle #3) containing these bullets:

- Where the file was written (absolute path).
- 章节分布 breakdown by pair count, using the Step 2B-frozen final plan. If the user modified the candidate list in Step 2B, note what changed. If actual output has a clear gap from the estimate (0-pair categories must be explained; non-zero but clearly fewer than estimated should also be explained), state what self-check dropped and why.
- The temp clone directory, if one was created, and that it has been cleaned up (the clone script handles cleanup; if you cloned manually, remove the temp dir before reporting).
- One or two highlights — the most representative pair and its source location — so the user has a quick sanity check.

## Failure Modes to Avoid

- **Inventing sources.** Never write a `**来源**` tag for a line you did not actually read. If you cannot find a source, do not produce the pair.
- **Generic answers.** "This function does authentication" is useless. "This function validates a JWT bearer token and attaches the decoded payload to `req.user` (src/auth.ts:18-31)" is useful.
- **Over-citing one file.** If 25 of 30 answers cite the same file, your coverage is bad. Diversify across the source map.
- **Re-asking for defaults.** If the user already specified values, do not re-prompt.
- **Leaving temp clones behind.** Always clean up cloned repos once the Q&A file is written.

## References (load on demand)

- `references/qa_taxonomy.md` — Q&A-category palette + question-form checklist. Read before Step 2.
- `references/output_template.md` — Output Markdown template. Read once before Step 4.

## Scripts

- `scripts/clone_repo.ps1` — Normalizes any remote-git input (shorthand, web URL, HTTPS, SSH), runs a shallow clone to a temp directory, and prints the local path. Run it when the input is a remote repository.
