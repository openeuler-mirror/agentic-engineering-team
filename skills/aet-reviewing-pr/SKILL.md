---
name: aet-reviewing-pr
description: AET PR review orchestrator - runs end-to-end review on an AtomGit PR with 5-class risk-face grading on top of a 7-axis review. Calls aet-reviewing-code as the review kernel; this skill handles PR-business (fetch metadata, worktree, risk-face judgement, comment assembly, posting). Final comment written in Chinese, formatted per references/comment-template.md.
---

# AET PR Review

End-to-end review for an AtomGit PR. **Composition of two skills**:

- **`aet-reviewing-code`** (the kernel): the actual code review — 7 axes, structured findings, confidence scoring, language-specific checks
- **`aet-reviewing-pr`** (this skill): the PR-business — fetch PR metadata, manage worktree, **risk-face judgement** (PR-specific increment), assemble the markdown comment, post it back

## Language Detection and Response

- 与用户的对话用 user input 的语言
- **最终 PR 评论 + internal.md**: **统一中文**(per `references/comment-template.md`)

## When to Use

- User invokes `/aet-pr review <id>` (the unified PR slash command — see `commands/pr.md`)
- User says "review this PR" / "review PR #N" / "评审 PR #N" in natural language
- A PR number or URL is provided

## Prerequisites

- `.aet/config.json` is configured (`pr-api.js` needs token / owner / repo)
- Local repo is the PR target repo or its fork (otherwise → api-diff degraded mode)
- `aet-reviewing-code` skill is available (used as kernel)

## Workflow

### Step 1: Parse input → PR number, with cross-project pre-flight

- `review 226` / `#226` / `评审 PR 226` → 226 (PR id sourced from local `.aet/config.json`'s `owner`/`repo`)
- `https://atomgit.com/<owner>/<repo>/merge_requests/226` → 226

**Cross-project pre-flight (mandatory when a URL was provided)**:

Extract `<owner>/<repo>` from the URL and compare against `.aet/config.json`'s `owner`/`repo`.

- **Match (strict owner/repo equality)** → proceed. This is the same project or a known fork relationship; Step 3 sorts out where the head SHA lives.
- **No match** → **REFUSE outright**. Don't fall through to api-diff — pr-api is bound to the local config, so it would silently fetch the wrong PR or 404. Tell the user verbatim:

> This PR lives on `<url-owner>/<url-repo>`, but your local config points to `<config-owner>/<config-repo>`. AET PR review needs to run from the target project's local checkout — its `.aet/config.json`, `CLAUDE.md`, language conventions, and risk-face definitions all matter for an accurate review.
>
> Either:
> 1. `cd` into a local checkout of `<url-owner>/<url-repo>`, ensure `.aet/config.json` is set up there, and retry
> 2. Use AtomGit's web `/ai review` directly on the PR for a basic platform-side review

**Note on the match check**: it's strict **owner/repo** equality, not just repo name — `acme/api` and `widgets/api` share a repo name but are unrelated projects. Cross-fork scenarios where the PR's *head* lives on a different fork (e.g. `Lexie-7/jiuwenclaw` PR'd into `openJiuwen/jiuwenclaw`) are handled in Step 3; the URL itself almost always points to the **base** repo (where the PR was opened), not the head fork, so URL match = base match = "this is my project's PR".

### Step 2: Fetch PR metadata + file list (via pr-api) + pre-flight

Two `pr-api` subcommand calls — fetch raw PR data into local JSON files. **No 中间 orchestrator;all logic here is yours.**

```bash
mkdir -p .aet/reviews/pr-<id>
node skills/aet-operating-pr/scripts/platform/bin/pr-api.js get-pr <id> --format json > .aet/reviews/pr-<id>/pr.json
node skills/aet-operating-pr/scripts/platform/bin/pr-api.js get-pr-files <id> --format json > .aet/reviews/pr-<id>/files.json
```

**Pre-flight checks**:
- Read `pr.json`. If `pr.state !== "open"` → skip review entirely, tell user PR is closed/merged.
- If `pr.draft === true` and user didn't pass `--include-draft` → skip, tell user it's a draft.

**Context budget heads-up**: `files.json` for large PRs (≥ 5 files / ≥ 2 languages / `wc -l files.json` ≥ 2000) can flood the main-thread context. When that holds, **Step 4 (kernel), Step 5b (risk-face), and Step 5d (PR summary) are independent and should be dispatched as parallel subagents** — issue multiple Agent tool calls in a single message; each subagent loads `files.json` / worktree on its own, and the main thread only collects structured finding JSON. For small PRs, run inline — subagent spawn overhead isn't worth it. See the "Concurrency strategy (subagent)" sections in Step 4 (kernel) and Step 5 for fan-out details.

**No markdown files written by this step.** Markdown rendering is your job in Step 6 (guided by `references/comment-template.md`).

### Step 3: Get the PR head SHA local, then worktree

Read `.aet/reviews/pr-<id>/pr.json` to extract:
- `pr.head.sha` — the commit hash we want to review
- `pr.head.repo.full_name` — e.g. `Lexie-7/jiuwenclaw` (may be on a fork, possibly on a different platform)
- Head URL — prefer `pr.head.repo.html_url` / `clone_url` / `ssh_url` if present; otherwise fall back to `https://atomgit.com/<full_name>.git`

**The decision is binary**: can git find the head SHA in its local object database? Worktree if yes, api-diff if no.

The old logic ("match remote else degrade") conflated **means** (remote config) with **end** (SHA reachability). It broke cross-fork PRs where the head repo isn't a configured remote but the URL is fetchable — common when the PR comes from a different fork of the same project, or even a fork on a different platform (e.g. PR's head on AtomGit while your local mirror is on GitCode).

**Stage A — make the SHA local** (cheap → expensive, fall through on failure):

```bash
SHA="<pr.head.sha>"
FULL_NAME="<pr.head.repo.full_name>"
HEAD_URL="<resolved-head-url-from-pr.json-or-constructed>"

# 1) Already in object DB (previously fetched, or reachable via some branch)?
if git cat-file -e "$SHA" 2>/dev/null; then
    : # have it; nothing to do
# 2) Existing remote matches the head repo?
elif git remote -v | grep -q "$FULL_NAME"; then
    REMOTE=$(git remote -v | grep "$FULL_NAME" | head -1 | awk '{print $1}')
    git fetch "$REMOTE" "$SHA" 2>/dev/null || true
# 3) Direct URL fetch (handles fork-of-the-same-project, cross-platform fork, etc.)
else
    git fetch "$HEAD_URL" "$SHA:refs/aet-review/pr-<id>" 2>/dev/null || true
fi
```

**Stage B — verdict**:

```bash
if git cat-file -e "$SHA" 2>/dev/null; then
    # local-worktree mode
    git worktree remove --force .aet/reviews/pr-<id>/checkout 2>/dev/null || true
    rm -rf .aet/reviews/pr-<id>/checkout
    git worktree add --detach .aet/reviews/pr-<id>/checkout "$SHA"
    # codeSourceMode = 'local-worktree'
else
    # codeSourceMode = 'api-diff degraded'
    # aet-reviewing-code will work from patch.diff text in files.json instead of full files;
    # note this in your final ctx so the footer can show "评审基于 API diff(降级)"
fi
```

**Why direct-URL fetch instead of `git remote add` then fetch**: the temp-ref pattern (`refs/aet-review/pr-<id>`) keeps `git remote -v` clean across many PR reviews. Cleanup is one line in Step 8. If you'd rather see the remote in `git remote -v` for debugging, swap step 3 to `git remote add atomgit-<owner>-<repo>-tmp <HEAD_URL>` + `git fetch <name> <SHA>` — and remember to `git remote remove` in Step 8.

### Step 4: Invoke `aet-reviewing-code` skill (the actual review kernel)

**Action now**: fire the Skill tool with `name: aet-reviewing-code`. Do not read source files yourself before this — the kernel exists precisely to do per-file × per-axis review with the right guides; if you preload files yourself you're duplicating its job.

The kernel runs in the **same conversation context as you** (Skill loads its SKILL.md into this thread; it shares everything you've built so far — `pr.json`, `files.json`, worktree paths). Make sure those artifacts are in place from Steps 2–3 before invoking. The kernel's own SKILL.md handles per-file × per-axis enforcement, language-guideline consultation, and self-filtering — you don't brief it on any of that.

It returns a list of structured findings: `severity`, `axis`, `confidence` (0-100), `file`, `line`, `title`, `body`, and self-marked false-positives (`filtered=true` with `filterReason`).

**Anti-pattern**: if you find yourself using the `read` tool on source files inside Step 4, stop — that's the kernel's job. Invoke the Skill instead.

### Step 5: PR-business judgement (revise structural + emit risk-face + judge mass-delete + write PR summary + pick top priorities)

This is where the PR-specific increment lives. Five sub-tasks.

**Concurrency strategy (subagent)** — recommended when the main thread is context-tight on a large PR:

5b and 5d are independent and pull from non-overlapping data sources (both work off `files.json` + worktree). **Issue 2 Agent tool calls in a single message** to run them in parallel:
- **Subagent A** — runs 5b (risk-face classification). Inputs: `files.json` path, worktree path, `references/risk-faces.md`. Returns: `{facesByFile, allFaces, riskFaceFindings: [...]}`
- **Subagent B** — runs 5d (PR summary). Inputs: `pr.json` path, file metadata from `files.json` (no patch bodies). Returns: `{prSummary: {headline, mainChanges: [...]}}`

5a is usually light (a handful of `deleted_file` decisions) — keep it on the main thread. 5c (large in-place deletion) likewise stays on main. 5e (top-priority pick) must run **after** subagent A, kernel findings, and 5a have all settled — it cannot be parallelized. 5f (static checklist) runs last; it inspects the full finding set.

#### 5a. Emit structural (deleted_file) findings + classify severity (CRITICAL — don't skip)

For each file in `files.json` where `patch.deleted_file === true`, emit a structural finding into your in-memory ctx. **Classify severity based on actual file type / role** — don't default to `important` blindly.

**Consult [`references/structural-revise-decision-table.md`](references/structural-revise-decision-table.md)** — it has the 10-row decision table mapping file type → severity action (downgrade to `nit`/`filtered` for benign deletions like lock files / generated artifacts; upgrade to `blocking` for migrations / auth / schema).

Workflow:
1. Read `.aet/reviews/pr-<id>/files.json`,filter to entries with `patch.deleted_file === true`
2. For each, classify the deleted file path/type using the decision table
3. Emit a finding `{ axis: 'risk-face', face: 'mass-delete', severity, filtered, filterReason, file, title, body }` into your ctx
4. Apply the same spirit to any other structural signal you spot (e.g. `too_large` files)

#### 5b. Risk-face classification (emit new findings from worktree content)

> **Boundary note**: `aet-reviewing-code` (the kernel) never fills the `face` field — it always returns `face: null` for every finding. Risk-face classification is **exclusively this skill's job**. You don't need to dedupe / merge with kernel face values; just fill them in fresh here.

Consult `references/risk-faces.md` for the 5 default faces (`auth`, `schema`, `mass-delete`, `external-api`, `ci-cd`) and any project-specific faces declared in `CLAUDE.md`. For each file, decide which face(s) it touches based on **actual content**. Build:

```js
facesByFile = {
  'src/auth/middleware.ts': ['auth'],
  'migrations/2026_05_add_users.sql': ['schema'],
};
allFaces = [...new Set(Object.values(facesByFile).flat())];
```

For each file with `≥1` face, emit a finding:

```js
{
  severity:   'important',
  face:       <primary face>,
  axis:       'risk-face',
  confidence: 90,  // adjust based on certainty
  file:       'src/auth/middleware.ts',
  line:       null,
  title:      '{face} 风险面变更,建议人工重点审查',
  body:       '本文件命中 {face} 风险面...\n建议确认: <face-specific hint>',
}
```

**Watch for `references/risk-faces.md`'s "Common false flags"** — a doc file about auth doesn't actually touch auth. Don't emit if the file is a false flag.

#### 5c. Large in-place removal judgement

For each file with significant `removed_lines` (project-context threshold: ≥50 small project / ≥200 monorepo / ≥1000 generated):

- **Suspicious** (real logic removed, PR description doesn't mention it) → emit `important` finding, `axis: 'risk-face'`, `face: 'mass-delete'`
- **Benign** (extraction same PR, vendored→dep swap, generated) → don't emit, or emit `learning`

#### 5d. PR Summary (写"这个 PR 做了什么")

Based on PR title, body, and what you've seen of the diff content, write:

```js
prSummary = {
  headline: '2-3 句话:这个 PR 做了什么、为什么、怎么做(高层)',
  mainChanges: [
    '3-5 个 bullet,具体到文件/模块层级',
    '示例: 新增 agents/doc/ 子目录,定义 doc agent 的 prompt 和 routing',
    '示例: 重构 update-pr.js 把 65 行的 execute 方法拆分',
    '示例: 删除 platform/package-lock.json (子包不再单独管理依赖)',
  ],
};
```

**全中文,描述性不评价**。"质量高 / 实现得好"这种评价话不进 PR 摘要 —— 留给 🌟 praise 类 finding。

#### 5e. Top priorities (挑 1-3 条最重要的)

从可见 findings(过滤掉 `filtered: true` 和 `confidence < 70`)中挑 **1-3 条** mark `topPriority: true`:

- 1 条 blocking → 它就是首要
- 多条 blocking → 挑 1-3 个最严重 / 影响面最大
- 无 blocking,有 important → 挑 2-3 条触及风险面或关键路径
- 都是 nit/suggestion → 选 1 条特别值得说的(不勉强)

#### 5f. Static checklist (安全 / 测试)

After all findings are settled (5a-5e), fill the 2 static checklists for the comment-template's "🛡️ 安全检查" / "🧪 测试覆盖检查" sections (see `references/comment-template.md` §5.5 for full rules).

Default each item to `[x]` (LLM confirms it checked). Flip to `[ ]` only when a **visible** finding (in `visibleFindings`, post-filter) contradicts the item:

- 🛡️ 5 items: 凭证泄露 / 输入校验 / 鉴权 / 注入风险 / 日志敏感数据 — flip `[ ]` if a `security` finding flagged the corresponding issue
- 🧪 4 items: 单元测试 / 边界 / 错误路径 / 测试命名 — flip `[ ]` if a `testing` finding flagged the corresponding issue

Store as `securityChecklist` / `testingChecklist` arrays in your in-memory ctx for Step 6 to render.

### Step 6: Write summary.md + internal.md following `references/comment-template.md`

**This is where you write the actual PR comment.** Read `references/comment-template.md` for the full format spec — it defines section structure, severity/axis/risk-face label tables, filtering logic, and the internal.md template.

Two files to write (use the **Write** tool directly):

```
.aet/reviews/pr-<id>/summary.md      ← PR comment body (posted in Step 7)
.aet/reviews/pr-<id>/internal.md     ← full audit log including filtered/hidden findings — audit/debug only
```

**Both files in Chinese**, regardless of PR description language.

#### 6a. Apply confidence filtering FIRST

Split findings into 3 buckets before rendering:
- `filtered: true` → **ONLY internal.md** (tag `[FILTERED 假阳性]`); never summary.md
- `confidence < confidenceThreshold` (default 70) → **ONLY internal.md** (tag `[LOW CONFIDENCE N<70]`)
- Everything else → **visible** → summary.md AND internal.md

#### 6b. summary.md MUST have these sections in this order

Hard checklist — do not reorder, do not skip required sections:

| # | Section | Required? |
|---|---|---|
| 1 | Verdict line: `{icon} **AET Review: {LABEL}**` | always |
| 2 | `### 📝 这个 PR 做了什么` (headline + 主要改动 bullets) | always |
| 3 | `### ✨ 亮点 ({N})` | only if ≥1 visible praise — else **整节省略**, do NOT write "无亮点" |
| 4 | `### 🎯 reviewer 重点关注 ({N})` | 1-3 `topPriority` findings as `>` blockquote |
| 5 | `### 🗂️ 风险面热点` | only if `allFaces` non-empty — else **整节省略** |
| 6 | `### 📋 分轴评审结果` (per-axis `####` + `**Clean axes:**` line) | always |
| 7 | `### 🛡️ 安全检查` + `### 🧪 测试覆盖检查` | always; render checklists from Step 5f |
| 8 | `### 📁 文件级摘要 ({N} 个文件)` | always |
| 9 | `<sub>` Footer | always |

#### 6c. Rendering rules that get missed most often

- **Title NEVER contains severity text.** `severityIcon` is rendered separately; `title` is just the problem statement. ❌ `**⛔ BLOCKING — auth bypass**` → ✅ `**⛔ auth bypass**`. Also avoid `IMPORTANT —`, `SUGGESTION —`, `FIX:`, etc.
- **Empty meta segment is omitted entirely — no dangling separators.** No `· · ·`, no trailing `· `. Examples:
  - file + axis + face → `**🟡 title** · `file:L10` · 🔧 功能正确性 · 🔐 认证`
  - file + axis, no face → `**🟡 title** · `file:L10` · 🔧 功能正确性`
  - axis only (no file, no line) → `**🟡 title** · 维度 🔧 功能正确性`
- **`praise` findings appear ONLY in ✨ 亮点 — never duplicated in 📋 分轴评审.** Dedup by hand before rendering §6.
- **`filtered` findings NEVER leak to summary.md.** Only internal.md.

#### 6d. Self-check before posting (Step 7)

Walk this pass on the rendered summary.md — fix and rewrite if any fails:

1. Verdict icon/label matches highest visible severity? (blocking → ⛔ BLOCKING, important → ⚠️ NEEDS ATTENTION, else ✅ LGTM)
2. All "always" sections from 6b table present, in order?
3. No finding title contains leaked severity words ("BLOCKING", "IMPORTANT", "SUGGESTION", "FIX:")?
4. No blockquote meta line has `· · ·` or ends with `· `?
5. Every praise finding appears in ✨ 亮点 only — not also in 📋 分轴评审?
6. No `filtered: true` finding is visible in summary.md?

### Step 7: Post comment

```bash
node skills/aet-operating-pr/scripts/platform/bin/pr-api.js add-comment <id> --body-file .aet/reviews/pr-<id>/summary.md
echo "add-comment exit code: $?"
```

**判定成功/失败**：
- **成功**：退出码为 0（`$? -eq 0`）。stdout 输出 comment 数据（`--format json` 时为合法 JSON，默认 concise 时为格式化数据）。
- **失败**：退出码非零（`$? -ne 0`），stderr 输出 `✗ add-comment failed: <error>`。

**⚠️ 重试策略（强制）**：
- **仅在退出码非零时重试**（`$? -ne 0`），重试上限 2 次；超过则向用户报告失败，不得继续重试。
- **禁止以"stdout 为空"判断失败**。add-comment 成功时 stdout 可能在 quiet 模式下极简，但退出码为 0 即表示成功。以空 stdout 作为失败判据会导致同一份评审总结被重复推送。

- User chose "auto-post by default" (spike decision round 2)
- For MVP, recommend running `--dry-run` on first few PRs to validate finding quality
- If user passed `--dry-run` / `--no-post`, skip this step

### Step 8: Clean up the worktree (local-worktree mode only)

```bash
git worktree remove --force .aet/reviews/pr-<id>/checkout

# If Step 3 Stage A step 3 used direct-URL fetch, also drop the temp ref:
git update-ref -d refs/aet-review/pr-<id> 2>/dev/null || true
```

Fallback on failure:

```bash
rm -rf .aet/reviews/pr-<id>/checkout
git worktree prune
```

### Step 9: Report

Tell the user (in their input language):
- Verdict (BLOCKING / NEEDS ATTENTION / LGTM)
- Number of findings + severity distribution + axis breakdown
- Risk faces hit
- Artifact paths (`.aet/reviews/pr-<id>/`)
- Comment numericId (if posted)

## Edge Cases & Failure Handling

- **Cross-fork PR**: no local remote for PR head → api-diff mode, footer shows "API diff(降级)"
- **PR is draft**: skipped by default. `--include-draft` to force.
- **PR is closed/merged**: refuse to review.
- **`too_large` file**: `aet-reviewing-code` skips diff parsing; only mass-delete / risk-face surface-level hints emitted.
- **Local fetch fails**: degrade to api-diff; don't hard-fail.

## References

| File | Purpose |
|---|---|
| [`references/comment-template.md`](references/comment-template.md) | **PR 评论的最终模板** — Step 6 写 markdown 文件时必读。包含 7 段结构、severity/axis/risk-face 标签表、internal.md 模板、anti-patterns |
| [`references/risk-faces.md`](references/risk-faces.md) | 5 类风险面 policy 文档 — Step 5b 用 |
| [`references/structural-revise-decision-table.md`](references/structural-revise-decision-table.md) | deleted_file finding revise 决策表 — Step 5a 用 |

For severity rubric, 7-axis checklist, false-positive filter, language guidelines — those live in [`aet-reviewing-code/references/`](../aet-reviewing-code/references/) (they belong to the review kernel).

## Examples

### Example 1: User says "review PR 226"

1. **Step 1**: prn=226
2. **Step 2**: `pr-api get-pr 226 > pr.json` + `pr-api get-pr-files 226 > files.json`,pre-flight check on pr.json
3. **Step 3**: parse pr.json head SHA + URL; try cheap-to-expensive paths (`git cat-file -e` → existing remote `git fetch` → direct URL `git fetch <url> <sha>:refs/aet-review/pr-226`); final `git cat-file -e` verdict → local-worktree mode or api-diff degraded; `git worktree add --detach`
4. **Step 4**: invoke `aet-reviewing-code` Skill on `.aet/reviews/pr-226/checkout/{...}` → 7-axis findings with confidence
5. **Step 5**: revise structural; emit risk-face per file; judge large removals; write prSummary; mark topPriority on 1-3 findings
6. **Step 6**: read `references/comment-template.md`, then **Write** summary.md + internal.md (in Chinese) — apply confidence filtering, follow the §6b section checklist, then run the §6d 6-point self-check
7. **Step 7**: `pr-api add-comment 226 --body-file .aet/reviews/pr-226/summary.md`; 检查 `$? -eq 0` 则成功，`$? -ne 0` 才重试（上限 2 次）
8. **Step 8**: `git worktree remove --force .aet/reviews/pr-226/checkout`
9. **Step 9**: report back to user

### Example 2: "Review but don't post"

Same as Example 1, skip Step 7. Tell the user the artifact is at `.aet/reviews/pr-226/summary.md` for inspection.
