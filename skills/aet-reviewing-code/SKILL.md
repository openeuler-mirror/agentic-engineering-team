---
name: aet-reviewing-code
description: 7-axis code review skill - covers functionality / security / testing / readability / performance / style / overall quality. Returns structured findings with 6-tier severity + axis + confidence. Used both standalone (review a file/dir/project) and as a kernel by aet-reviewing-pr (PR-level orchestration).
---

# AET Reviewing Code

7-axis code review skill. Reviews any combination of files (single file / directory / whole project / a list of changed files passed from a PR). Returns **structured findings** ready to be rendered into a report or aggregated by a higher-level orchestrator (e.g. `aet-reviewing-pr`).

## Language Detection and Response

Automatically detect the language of user input and respond in the same language.

## When to Use

- User asks to review code (file / directory / project)
- A higher-level orchestrator (e.g. `aet-reviewing-pr`) invokes this skill on a worktree to get code findings
- You need a structured review across all 7 axes (not just security / bad-smell)

## Inputs

The skill accepts:
- **Scope**: `--file <path>` | `--dir <path>` | `--files <list>` | (default: whole project)
- **Optional PR context**: `--pr-context <json>` containing `{ title, description, base_ref, files_changed: [...] }`. When supplied, axis 7 (PR overall quality) is reviewed; otherwise it's skipped.

## Output

A list of structured findings. Some fields are **kernel-set** (this skill's job); others are **orchestrator-set** (filled in later by callers like `aet-reviewing-pr`, marked below):

```js
{
  // ─── kernel-set (this skill fills these in) ───
  severity:   'blocking' | 'important' | 'question' | 'nit' | 'suggestion' | 'learning' | 'praise',  // `question` = reviewer 不确定/想问 author (vs `suggestion` = reviewer 觉得有更好做法)
  face:       null,         // always null in kernel mode — risk-face classification is PR-business, set by orchestrators (aet-reviewing-pr Step 5b). Kernel does NOT fill this.
  axis:       'functionality' | 'security' | 'testing' | 'readability' | 'performance' | 'style' | 'pr-quality',
  confidence: 0-100,        // self-assessed confidence; orchestrators hide findings below their threshold (default 70)
  file:       'path/to/file.ext',
  line:       42 | null,
  title:      'short problem description',
  body:       'detailed analysis + suggestion (markdown supported)',
  filtered?:  true,         // self-marked false-positive (kept for audit, hidden from final report)
  filterReason?: 'reason it was flagged then dismissed',

  // ─── orchestrator-set (e.g. aet-reviewing-pr; the kernel does NOT set these — no PR-wide context to judge) ───
  topPriority?: true,       // marked by orchestrator after seeing all findings, to highlight 1-3 most important in the final report
}
```

**How to tell which mode you're running in** (no CLI flag — judge from the invocation context):

- **Kernel mode** — the invocation brief explicitly asks for structured findings (e.g. `aet-reviewing-pr` Step 4 says *"Return mode: structured (returns a JSON array of findings)"*, or any programmatic caller spells out a structured return). Return only the JSON list above; **skip Step 9's Markdown report and Step 10**.
- **Standalone mode** — a human invoked you directly (slash command, natural language, no orchestrator brief). Also render the Markdown report (Step 9) and run Step 10 (Human Confirmation).

## Workflow

### Workflow at a glance

The step numbering and axis numbering don't line up — Step 4 alone covers four axes, and the per-language pass (Step 5) cuts across axes. Use this table to navigate:

| Step | Covers |
|---|---|
| Step 1 | Determine scope (no axis) |
| Step 2 | Axis 2 (security) — delegated to `aet-checking-security` |
| Step 3 | Axis 4 (readability) — delegated to `aet-checking-bad-smell` |
| Step 4 | Axes 1, 3, 5, 7 (4a/4b/4c/4d), with per-file × per-axis enforcement |
| Step 4.5 | Coverage self-check (mandatory) |
| Step 5 | Per-language pass (cross-axis; emits findings into axes 1/4/5) |
| Step 6 | Axis 6 (style) — mostly delegated to linters |
| Step 7 | Reference tables (lookup, not a discrete step) |
| Step 8 | Self-filter false positives |
| Step 9 | Return / Render |
| Step 10 | Human Confirmation (standalone mode only) |

### Step 1: Determine Review Scope

Resolve the target file set:

| Input | Behavior |
|---|---|
| `--file <path>` | Review only this file |
| `--dir <path>` | Review all source files under this path (recurse; skip vendor / node_modules / .git / dist / build / __pycache__) |
| `--files <list>` | Review exactly this list of files (typical for a PR's changed files) |
| (default) | Review all non-test, non-vendor source files in the project root |

**Read the target files** before proceeding (so subsequent axes have actual content to reason about).

### Step 2: Axis 2 (Security) — invoke `aet-checking-security` + consult `guides/security-review-guide.md`

Use the Skill tool to invoke the `aet-checking-security` skill on the target scope.

In parallel, **load** [`references/guides/security-review-guide.md`](references/guides/security-review-guide.md) (268 lines) — it has industry-vetted security checkpoints that complement the sub-skill's findings. After security-check returns, apply its checklist to each file as a second pass.

Map the returned severities (Critical / High / Medium / Low) to the 6 tiers — see [`references/severity-rubric.md`](references/severity-rubric.md). Tag each finding with `axis: 'security'`.

### Step 3: Axis 4 (Readability / Maintainability) — invoke `aet-checking-bad-smell` + consult `guides/code-quality-universal.md`

Use the Skill tool to invoke the `aet-checking-bad-smell` skill on the same target scope.

In parallel, **load** [`references/guides/code-quality-universal.md`](references/guides/code-quality-universal.md) (490 lines) — it has cross-language quality patterns the bad-smell sub-skill may miss. Apply as second pass.

Wait for completion (sequential, not parallel — keeps analysis focused). Map severities and tag each finding with `axis: 'readability'`.

### Step 4 — CRITICAL: Per-file × per-axis sweep for axes 1, 3, 5, 7

This is the heart of thorough review. **DO NOT** scan files at a surface level and call it done. The strict protocol:

```
for EACH file in scope:
  # Load language-specific guideline (Step 7 table) if not yet loaded for this file's ext
  # Load cross-cutting guide referenced below for each axis

  for EACH axis in [functionality, testing, performance, pr-quality]:
    Apply the relevant references to this file
    Emit 0..N findings (emit confidence honestly — 60-79 is OK,
      it lands in internal.md for audit)
    
  "Clean" output for a (file, axis) cell IS allowed, but ONLY after
  actively reading the file's content for that lens. If you skipped
  the file without reading, you must come back to it.
```

**Per-axis instructions** (perform 4a → 4d for EVERY file, do not short-circuit):

**Concurrency strategy (subagent)** — when to fan this sweep out:

Sequential file × axis on the main thread is fine for small PRs (< 5 files). But **once you cross 5+ files, or you'd be loading multiple heavy guides**, 4a and 4c are the two axes that benefit most from subagent isolation:

- **Axis 1 (functionality)** — pulls `common-bugs-checklist.md` (222 lines) plus file contents. Worth subagent-ing.
- **Axis 5 (performance)** — pulls `performance-review-guide.md` (819 lines) plus file contents. **The single heaviest guide — strongly recommend subagent.**
- **Axis 3 (testing)** — only inspects test-file existence and brief content; lightweight, keep on main thread.
- **Axis 7 (pr-quality)** — reads PR description + commit history; small data, keep on main thread.

Pattern: issue 2 Agent tool calls in a single message — one for axis 1, one for axis 5. Each subagent loads its guide + files internally and returns a structured finding list. Main-thread context saved ≈ 222 + 819 + N file contents (~1500–3000 lines).

#### 4a. Axis 1 (Functionality & Correctness) — consult `guides/common-bugs-checklist.md`

**Load** [`references/guides/common-bugs-checklist.md`](references/guides/common-bugs-checklist.md) (222 lines) — it enumerates 80+ common bug patterns by category. For each file:

- Does the code actually do what its docstring / surrounding comments / PR description (if supplied) claims?
- Walk the common-bugs-checklist: off-by-one, inverted boolean, null/empty handling, race conditions, resource leaks, error swallowing, missing state-machine cases.
- Boundary conditions: null / empty / extreme / concurrent / timeout / network-failure paths handled?

Tag findings with `axis: 'functionality'`.

#### 4b. Axis 3 (Testing & Quality Assurance) — coverage gap + test quality

**Coverage gap**: for each changed source file in scope, look at the worktree to see if a matching test file exists. Use language conventions (`foo.test.ts`, `test_foo.py`, `foo_test.go`, `__tests__/foo.test.ts`, `tests/test_foo.py`, etc.) and be aware of project-specific patterns (e.g. `verification/<name>-checks.ts`). Emit `important`-severity findings (`axis: 'testing'`) for missing tests on non-trivial source files.

**Skip** files that legitimately don't need tests: config, docs, generated artifacts, one-line refactors, `__init__.py` shims.

**Test quality**: for each test file already in scope, check:

- Do tests actually assert behavior, or merely "run the code" with `expect(result).toBeTruthy()` no-ops?
- Edge cases covered, or only happy path?
- Mocks reasonable (not mocking the thing under test)?
- Test names describe behavior, not implementation?

Tag findings with `axis: 'testing'`.

#### 4c. Axis 5 (Performance & Efficiency) — consult `guides/performance-review-guide.md`

**Load** [`references/guides/performance-review-guide.md`](references/guides/performance-review-guide.md) (819 lines) — frontend / backend / DB / algorithmic complexity / API performance. For each non-trivial changed code section:

- Apply the relevant performance section from the guide for this language/domain.
- Algorithmic complexity: O(n²) where O(n log n) would suffice?
- N+1 queries / un-indexed DB access?
- Synchronous I/O blocking an async runtime?
- Large allocations / un-streamed file reads?
- Cache opportunities being missed?

Tag findings with `axis: 'performance'`. Do NOT emit micro-optimizations (a `for` vs `forEach` choice doesn't warrant a finding).

#### 4d. Axis 7 (Overall PR Quality) — only if `--pr-context` was passed

Only run if the caller supplied PR metadata. Check:

- Is the PR scope focused, or a mixed bag of unrelated changes?
- Does the PR description clearly state what / why / how?
- Are commits clean (no `wip` / `fix typo` noise)?
- Is there a linked issue / design doc?

Tag findings with `axis: 'pr-quality'`. These findings should typically be `suggestion` or `nit` severity (rarely blocking).

### Step 4.5: Coverage self-check (MANDATORY before Step 5)

This step exists because LLMs (you) tend to skim files and skip axes without realizing it. Past failure: a real PR review on 7 files produced only 6 findings total — Steps 4a-4d were *nominally* run but several (file × axis) cells got silently skipped.

**Before declaring Step 4 done, write out this matrix explicitly** (as a scratch note, in your reasoning, or as a comment block):

```
                | functionality | testing | performance | pr-quality
fileA           |       ✓       |    ✓    |      ✓      |    n/a
fileB           |       ✓       |    ✓    |      ✓      |    n/a
fileC           |       ✓       |    ✓    |      ✓      |    n/a
...
```

Rules:
- `✓` = you actively read this file with this lens in mind (findings emitted or not)
- `✗` = NOT YET DONE → go back and do it
- `n/a` = legitimately not applicable. Only valid:
  - `pr-quality` column when `--pr-context` was NOT supplied (axis-level n/a — entire column)
  - For trivial files (config / docs / one-line changes) you can mark a row's `testing` cell `n/a` with a brief reason ("config — no behavior to test")
- **Do not advance to Step 5 with any `✗` cells.** Re-enter Step 4 and finish.

**Calibration reminder**: a confidence-70 finding is better than nothing. When you genuinely see something but feel only 70-79% sure, **emit it** — the orchestrator filters by confidence threshold for the visible comment and keeps the rest in internal.md for audit. Skipping out of fear of false positives starves the audit.

### Step 5: Per-file × per-language guideline pass — resolve standards via the script

The per-language guidelines are now **configurable, layered coding standards** resolved by
`scripts/resolve-standards.mjs` — the **same resolver and the same
`~/.aet/implement/.../language-standards/` data shared with `aet-implementing-requirement`**.
This guarantees code is reviewed against the exact standard it was (or should have been)
written to, including any company/project overrides.

**Always obtain the standard by running the script — never read the
`language-standards/<lang>.md` files directly** (only the script applies the layered
override order and reports which layer won):

```bash
node <skill path>/scripts/resolve-standards.mjs --files <comma-separated files in scope>
# framework variants the extension can't disambiguate:
node <skill path>/scripts/resolve-standards.mjs --langs django,react
```

Resolution order (highest priority first) — see Step 7 for the full layer list:

```
./.aet/implement/custom/language-standards/<lang>.md   项目自定义
./.aet/implement/aet/language-standards/<lang>.md       项目基线
~/.aet/implement/custom/language-standards/<lang>.md    公司自定义
~/.aet/implement/aet/language-standards/<lang>.md        公司基线 (安装时 seed)
```

The script's output header tells you, per language, **which layer won**; a language that
reports 「回退通用最佳实践」 has no standard at any layer → apply general principles from
[`review-template.md`](references/review-template.md) + the cross-cutting guides.

**Concurrency strategy (subagent)** — **the single biggest context win in this skill**:

Resolved standards can be large (python ~1000 lines, kotlin ~1000, react ~870, etc.). A PR
touching 3 languages would otherwise load 2000–3000 lines on the main thread.

**Pattern** — for each language touched by the PR, **spawn one subagent and run them all in parallel**:
- Subagent input: the file list for this language + the resolver command to run for it
  (e.g. `node <skill path>/scripts/resolve-standards.mjs --files a.py,b.py`). The subagent
  runs the script and consumes the resolved standard itself — the main thread never loads it.
- Subagent task: run the resolver, walk the resolved standard section by section against each
  file, return a structured finding list.
- Main thread: issue N Agent tool calls in a single message (one per language); collect N finding lists and merge.

Net effect: main thread holds **no language standard at all**; parallelism gives ≈ N × speedup.

**Single-language PRs**: skip the fan-out and run the resolver inline — subagent spawn overhead isn't worth it.

As you read the resolved standard, apply each section against the files of that language in scope. Each finding maps to an existing axis (most often axis 1, 4, or 5).

### Step 6: Axis 6 (Style & Conventions) — mostly delegate

Mostly delegated to project linters (filtered out — see [`references/false-positive-filter.md`](references/false-positive-filter.md)). Emit findings ONLY for:

- Project-convention violations linters can't catch
- Naming patterns that look idiomatic but cause confusion in this project's domain

Tag findings with `axis: 'style'`. These should rarely exceed `nit` severity.

### Step 7: Reference Tables (lookup, not a discrete step)

The tables below are referenced by Steps 4-6 to know **which file gets which guideline**. They are not a sequential step — they are lookup material.

#### Per-language standard (consulted in Step 5):

**You do not pick files from a table — the resolver does it.** Run
`scripts/resolve-standards.mjs --files <files>` and it maps each extension to a language
key via its `ext-map.json`, then resolves that key through the 4 override layers. The full
layer order:

```
1. ./.aet/implement/custom/language-standards/<lang>.md   项目自定义 (最高)
2. ./.aet/implement/aet/language-standards/<lang>.md       项目基线
3. ~/.aet/implement/custom/language-standards/<lang>.md    公司自定义
4. ~/.aet/implement/aet/language-standards/<lang>.md        公司基线 (安装时 seed,母本见 scripts/templates/language-standards/)
```

Default extension → language-key mapping (maintained in `ext-map.json`; same 17 baseline standards as before — TypeScript/JS, Python, Go, Rust, Java, Kotlin, C#, C++, C, Vue, Svelte, CSS/Less/Sass):

| Extension | language key |
|---|---|
| `.ts` `.tsx` `.js` `.jsx` `.mjs` `.cjs` | `typescript` (covers TS and JS) |
| `.py` | `python` |
| `.go` | `go` |
| `.rs` | `rust` |
| `.java` | `java` |
| `.kt` `.kts` | `kotlin` |
| `.cs` | `csharp` |
| `.cpp` `.cc` `.cxx` `.hpp` `.hh` | `cpp` |
| `.c` `.h` | `c` |
| `.vue` | `vue` |
| `.svelte` | `svelte` |
| `.css` `.scss` `.sass` `.less` | `css-less-sass` |

**Framework variants** the extension can't disambiguate — `django` (`.py` in a Django project), `react` (`.jsx`/`.tsx` in React), `angular`, `nestjs` (`.ts` in NestJS), `qt` (C++) — are not auto-detected; pass them explicitly with `--langs django,react` when the project context calls for them.

#### Per-axis cross-cutting guide (consulted in Steps 2/3/4):

| Step | Concern | Guide |
|---|---|---|
| Step 2 | Axis 2 (security) | [`guides/security-review-guide.md`](references/guides/security-review-guide.md) |
| Step 3 | Axis 4 (readability / code quality) | [`guides/code-quality-universal.md`](references/guides/code-quality-universal.md) |
| Step 4a | Axis 1 (functionality bugs / edge cases) | [`guides/common-bugs-checklist.md`](references/guides/common-bugs-checklist.md) |
| Step 4c | Axis 5 (performance) | [`guides/performance-review-guide.md`](references/guides/performance-review-guide.md) |
| (any) | Review feedback style / how to phrase findings | [`guides/code-review-best-practices.md`](references/guides/code-review-best-practices.md) |

These guidelines and guides are **adapted from `awesome-skills/code-review-skill`** (MIT-licensed; full license at `references/LICENSES/awesome-skills-code-review-skill.LICENSE`). They contain industry-vetted checkpoints — load them progressively as the file types in scope dictate.

If a language isn't listed, apply general principles from [`review-template.md`](references/review-template.md) + the cross-cutting guides.

### Step 8: Self-filter False Positives

Walk the merged findings list and **mark** (do NOT drop) any that fit `references/false-positive-filter.md` criteria:

```js
finding.filtered = true;
finding.filterReason = 'reason — e.g. issue not introduced by this PR, linter would catch, ...';
```

Keep filtered findings in the output for audit purposes. A downstream orchestrator (e.g. `aet-reviewing-pr`'s renderer) hides them from the user-facing comment but keeps them in `internal.md`.

### Step 9: Return / Render

**Kernel mode** (the invocation brief explicitly specified structured return — see "How to tell which mode you're running in" in the Output section): return the structured findings list. Done.

**Standalone mode** (default — human invoked directly): synthesize a Markdown report:

```markdown
# Code Review Report

## Executive Summary
- Files reviewed: N
- Findings: N total (blocking: X, important: X, nit: X, suggestion: X, learning: X, praise: X)
- Axes covered: functionality, security, testing, readability, performance, style, pr-quality
- Filtered (kept for audit): N

## Findings by Axis
### Functionality (N)
[finding list, sorted by severity desc]

### Security (N)
[...]

[... other axes ...]

## Top Priority Recommendations
The 5 highest-impact unfiltered findings, ranked by risk-to-effort ratio.

## Filtered Findings (audit only)
[brief list with file:line + filterReason]
```

### Step 10: Human Confirmation (standalone mode only)

After presenting the report, ask the user:
- Whether to generate detailed fix suggestions for a specific finding
- Whether to proceed with automated fixes for low-risk items

## References

| File | Purpose |
|---|---|
| [`references/severity-rubric.md`](references/severity-rubric.md) | 6-tier severity rubric + mapping from Critical/High/Medium/Low (AET-authored) |
| [`references/review-template.md`](references/review-template.md) | 7-axis review checklist + feedback style + tools + resources — **main body adapted from `SpillwaveSolutions/pr-reviewer-skill`** (source has no LICENSE; copied with attribution + caveat — see [`references/LICENSES/SpillwaveSolutions-pr-reviewer-skill.NOTICE.md`](references/LICENSES/SpillwaveSolutions-pr-reviewer-skill.NOTICE.md)). AET-authored sections: axis-coverage matrix, confidence-scoring rubric, severity mapping. |
| [`references/false-positive-filter.md`](references/false-positive-filter.md) | Exclude list for false-positive marking — Step 8 (AET-authored, adapted from `anthropic/claude-code-security-review`'s `findings_filter.py`) |
| [`scripts/resolve-standards.mjs`](scripts/resolve-standards.mjs) | Resolves the 17 per-language coding standards through 4 override layers (project → company → install-seeded baseline). **Shared logic with `aet-implementing-requirement`** (each skill keeps its own copy; standards data is shared in `~/.aet/implement/.../language-standards/`). Baseline master lives at repo `scripts/templates/language-standards/` — **adapted from [`awesome-skills/code-review-skill`](https://github.com/awesome-skills/code-review-skill)**, MIT License (full text seeded alongside in `LICENSES/`). |
| [`references/guides/*.md`](references/guides/) | 5 cross-cutting review guides (common-bugs / performance / security / code-quality / review-best-practices) — **adapted from `awesome-skills/code-review-skill`**, MIT License |
| [`references/LICENSES/`](references/LICENSES/) | Full license texts for adapted references |

## Relationship to other skills

- **`aet-checking-security`** (Step 2) and **`aet-checking-bad-smell`** (Step 3) — sub-skills this skill orchestrates. They handle axes 2 and 4 respectively.
- **`aet-reviewing-pr`** — higher-level orchestrator. Calls THIS skill as its review kernel, then layers on PR-business (risk-face grading from `pr-api`, comment posting via `add-comment`, etc.). PR-specific concerns (risk-face classification, mass-deletion threshold judgment) belong to `aet-reviewing-pr`, not here.
