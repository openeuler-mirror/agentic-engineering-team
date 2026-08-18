---
name: claude-obsidian
description: >-
  Plan 5: Build an engineering architecture navigation Wiki from a local or online code repository. Scan project source code and documentation,
  organize modules, components, dependencies, data flows, and build/deployment flows, record key design decisions, and establish a project knowledge base for ongoing retrieval.
---

# Engineering Repository Navigation Wiki - Plan 5

> A lightweight cross-CLI subset based on claude-obsidian for generating an engineering navigation Wiki for local or online code repositories.

## Use Cases

Prefer this plan when the user's goal is to understand an engineering repository for the first time. Typical questions include:

- 项目整体架构是什么？
- 入口、核心模块、组件边界在哪里？
- 数据流、请求流、构建/部署流如何串起来？
- 关键依赖、配置、设计决策是什么？
- 后续提问时希望从已整理的 Wiki 中检索，而不是每次重新读源码。

## Environment Requirements

- Python 3
- Python standard library only

This plan has no default dependency on the Claude Code plugin, Obsidian CLI, MCP, Bash, Ollama, `.vault-meta`, or Obsidian plugins.

## Wiki Root Rules

`<wiki-root>` is the Wiki root for this plan.

- If the user explicitly provides an output directory, use it as `<wiki-root>`.
- If the user does not specify `<wiki-root>`, determine it using the scenario rules in "From Scratch", step 2. There are three scenarios: "online repository", "local repository cwd≠repository path", and "local repository cwd=repository path".
- Do not automatically add another `wiki/`, `vault/`, or `repo-name/` layer as the root unless the user explicitly requests it. In step 2, the "cwd=local repository path" scenario creates a `claude-obsidian-wiki/` subdirectory by default, which is the explicit exception to this rule.

## Directory Structure

Generated after initialization:

```text
<wiki-root>/                          # Knowledge base root, common parent of .raw/, wiki/, and CLAUDE.md
├── CLAUDE.md                         # Scope, page types, operating rules, and writing constraints for this Wiki
├── .raw/                             # Raw repository snapshot directory, storing only source files awaiting ingestion, not generated Wiki pages
│   ├── .manifest.json                # Ingestion manifest, recording source file hashes, planned times, and created/updated pages
│   └── <project-name>/               # Source copy of one repository, where online repositories are cloned and local projects are copied
├── wiki/                             # AI-organized engineering navigation Wiki pages
│   ├── index.md                      # Main index, where every generated page should appear once
│   ├── hot.md                        # Hot cache, recording recent context, latest progress, and next-step recommendations
│   ├── log.md                        # Operation log, recording actions such as scaffold, ingest, query, and lint
│   ├── overview.md                   # Project overview, describing purpose, technology stack, and reading path
│   ├── modules/                      # Module pages, recording high-level repository modules and responsibility boundaries
│   ├── components/                   # Component pages, recording key classes, services, commands, plugins, or reusable parts
│   ├── decisions/                    # Decision pages, recording architecture choices, tradeoffs, constraints, and historical reasons
│   ├── dependencies/                 # Dependency pages, recording important external dependencies, runtimes, builds, and integrations
│   ├── flows/                        # Flow pages, recording cross-module request, data, build, and deployment paths
│   ├── concepts/                     # Concept pages, recording domain and technical concepts needed to understand the project
│   ├── entities/                     # Entity pages, recording named repositories, tools, organizations, services, and products
│   ├── questions/                    # Persistent question pages, preserving valuable answers and investigation conclusions
│   └── meta/                         # Metadata directory, preserving lint reports, maintenance notes, and other management pages
└── outputs/                          # Non-core Wiki output directory
    └── queries/                      # Query result archive, preserving one-off answers or answers awaiting promotion
```

## Tool Entry Points

All scripts are under `scripts/` in this plan's directory:

| Script | Purpose |
| ------ | ------ |
| `scripts/scaffold_wiki.py` | Initialize the engineering repository Wiki skeleton |
| `scripts/plan_ingest.py` | Scan the repository and generate a candidate ingestion plan (opt-out mode, including the review bucket) |
| `scripts/query_context.py` | Return hot/index/page candidates to read for a query |
| `scripts/lint_wiki.py` | Check structural issues, broken wikilinks, index gaps, and empty pages |

Command examples:

```bash
PYTHONIOENCODING=utf-8 python scripts/scaffold_wiki.py <wiki-root> "<项目标题>" --repo-url <url>
PYTHONIOENCODING=utf-8 python scripts/plan_ingest.py <wiki-root> <repo-path> --write-manifest
PYTHONIOENCODING=utf-8 python scripts/query_context.py <wiki-root> "<问题>" --top 5
PYTHONIOENCODING=utf-8 python scripts/lint_wiki.py <wiki-root>
```

In Windows PowerShell, use directly:

```powershell
$env:PYTHONIOENCODING = "utf-8"
python scripts/scaffold_wiki.py <wiki-root> "<项目标题>"
```

## Candidate Selection Model (Opt-Out)

This plan uses the **Opt-Out candidate selection model**: include all files by default, and hard-exclude only binary, generated, cache, VCS, and oversized files.

### Two-Stage Filtering

- **Stage 1 (`should_skip()` + `classify_candidate()`)**:
  - `should_skip()` performs hard exclusion: binary extensions, generated/dependency/cache/VCS paths, and files >512KB. Excluded files are marked `status: skip`.
  - `classify_candidate()` assigns confidence to the remaining files:
    - `confidence: high`: The filename is in `CANDIDATE_NAMES` (such as README.md, SKILL.md, or AGENTS.md), is under a known directory in `CANDIDATE_PARTS` (such as docs/, src/, skills/, or test/), or is a root-level file with a known extension.
    - `confidence: review`: The file is not under a known directory or among known names. These files **remain candidates**, but the agent must decide their disposition bucket by bucket at the hard checkpoint.
  - The `summary` output contains five buckets: `new` (new high-confidence files), `changed`, `unchanged`, `review` (candidates requiring review), and `skip` (hard exclusions).

- **Stage 2 (the "Do Not" filter)**:
  - Perform file-level filtering on `high` and `review` candidates, distinguishing ingest / summarize / skip_after_confirm.
  - This is the main stage for the agent's judgment. Stage 1 no longer decides admission, and Stage 2 must assign a final state to every confirmed file.
  - See the "Do Not" section below for file pattern matching rules.

### Terminology

- **Candidate list (candidate)**: All files not excluded by `should_skip()`. It includes both `high` and `review` confidence levels. Script output records hashes for every candidate.
- **Review candidate**: A candidate file not under a known directory (`CANDIDATE_PARTS`) or among known filenames (`CANDIDATE_NAMES`). Display it as a separate bucket at the hard checkpoint, where the agent decides ingest / summarize / skip_after_confirm. **review does not mean skip**. The agent must not silently skip review candidates and must assign each a file-level final state.
- **Bucket**: A candidate set grouped by path and purpose. Buckets are for display and confirmation only. They do not authorize ingesting or skipping an entire bucket.
- **Ingestion candidates**: The remaining set after the candidate list, including review candidates, passes the second "Do Not" filter. Files excluded by the second filter must retain file-level reasons.
- **Confirmed ingestion set (confirmed)**: The final set of ingestion candidates after user confirmation in step 6. Confirmation must be at file level or at the file level within a bucket. Do not confirm only a "plan", "purpose", or "all" slogan.
- **Ingested (`ingested`)**: A file in the confirmed set whose source was actually read, whose Wiki pages were created or updated, and whose manifest entry contains `ingest_status: ingested` plus `pages_created` / `pages_updated` evidence.
- **Summarized (`summarized`)**: A file in the confirmed set whose source was actually read, but whose content was merged into a module, directory, or catalog page. The manifest must record `ingest_status: summarized`, `evidence_page`, `evidence_kind: aggregate`, and a summary note.
- **Skipped after confirmation (`skipped_after_confirm`)**: A file in the confirmed set that, after another judgment, should not be written to the Wiki. The manifest must record `ingest_status: skipped_after_confirm` and a file-level `skip_reason`, and the decision must be described in `wiki/log.md`.
- **Pending (`pending`)**: A file in the confirmed set that has not yet received one of the three results above. Do not claim ingestion is complete while pending files exist.

Do not mix the terms above. "Candidate list" ≠ "ingested". The number of candidate files output by `plan_ingest` is not the number actually ingested. Agent completion, the number of generated pages, and a passing lint also do not mean the confirmed set is complete. Every confirmed file must ultimately reach one of `ingested`, `summarized`, or `skipped_after_confirm`.

## Coverage Evidence Rules

- `sources:` frontmatter should list specific file paths. Do not write directories, globs, or unrecoverable descriptions such as "30+ docs".
- If a page summarizes multiple source files, enumerate those files in frontmatter, or provide a machine-readable `source_groups` code block on the page listing `included` and `excluded` files and their reasons.
- Subagents, parallel agents, and direct manual ingestion must all return or record the same file-level ledger: `files_read[]`, `files_summarized[]`, `files_skipped[]`, `pages_created[]`, `pages_updated[]`, and `coverage_notes`.
- The manifest is the authoritative ledger of coverage facts. For confirmed files, the only allowed final states are `ingested`, `summarized`, and `skipped_after_confirm`. An entry with empty `pages_created` / `pages_updated` and no `ingest_status` is considered incomplete.
- `wiki/hot.md`, `wiki/log.md`, and `wiki/index.md` must not say "full ingestion complete" unless a coverage audit proves that the confirmed set has no pending files.
- Paths must be resolvable from the Wiki root (wiki-root-relative), preserving UTF-8 and original filenames. When paths contain Chinese, spaces, or special characters, do not replace exact paths with mojibake or otherwise corrupted paths.
- Repository snapshot files have the form `.raw/<repo-name>/<repo-relative-path>`, for example: `.raw/witty-diagnosis-agent/src/agents/AGENTS.md`
- Write URLs as complete URLs.
- For files from other source directories, use paths relative to the Wiki root.
- `sources` paths must not use repository-root-relative paths (such as `src/agents/AGENTS.md`, which cannot be resolved from the Wiki root) or absolute local paths (such as `D:\...`). This constraint also applies to frontmatter `sources:` and ledger `files_read[]`.

## From Scratch

1. Confirm the target repository source: a local path or an online repository link.
2. Confirm `<wiki-root>`. Use the user's specified value when provided. Otherwise determine it by scenario:
    - Online repository: use the current working directory as `<wiki-root>`.
    - Local repository, when the current working directory is not the local repository path: use the current working directory as `<wiki-root>`.
    - Local repository, when the current working directory is the local repository path: create a `claude-obsidian-wiki/` folder in the current working directory as `<wiki-root>` (create it if absent), keeping Wiki output separate from the repository source files and out of the repository root.
3. Run `scripts/scaffold_wiki.py` to create the skeleton.
4. Place the repository's original files in `<wiki-root>/.raw/<project-name>/`:
    - Online repository: after obtaining user permission, clone it to `<wiki-root>/.raw/<repo-name>/`.
    - Local project: copy the project files to `<wiki-root>/.raw/<project-name>/`.
5. Use the directory from step 4 as `<repo-path>`, then run `scripts/plan_ingest.py <wiki-root> <repo-path> --write-manifest` to generate a candidate ingestion plan (hash registration + confidence labels), without writing pages directly. The output contains five buckets: `new` / `changed` / `unchanged` / `review` / `skip`. Script output is not the final value judgment.
6. **[Coverage gap self-check]** Before displaying the candidate list, the agent must perform a coverage self-check:
    - Enumerate the `skip` bucket and check whether any documentation files (`.md`, `SKILL.md`, `AGENTS.md`, `README`) were excluded. If so, handle them according to the exclusion reason: for oversized files, create a pointer or excerpt; for an erroneous `SKIP_PARTS` path match (such as an `.md` file under `build/` or `dist/`), manually promote the file to a candidate and record the reason.
    - Enumerate directories in the `review` bucket and check whether they contain project-specific but important content (such as skills/, playbooks/, or references/). If so, display the exact user-visible label "建议优先 ingest".
    - Include the self-check results in the step 7 display.
7. **[Hard checkpoint, must not skip]** Pause and end this round here. Use the following requirements to compose the response, render the resulting content in Chinese, and do not display these English instruction bullets verbatim:
   - Counts by `status × confidence × bucket` (high-new / high-changed / high-unchanged / review / skip);
   - A file-level list and recommended action (`ingest` / `summarize` / `skip`) for every `high` candidate bucket, not only source-code buckets containing more than 100 files;
   - **Display the `review` bucket separately**: group files by directory and provide a recommended action (ingest / summarize / skip_after_confirm) and reason for each group; never skip the review bucket wholesale, and decide bucket by bucket or file by file;
   - Group skip entries by reason (binary / generated / dependency / cache / VCS / size / autogenerated lockfile);
   - When any bucket contains more than N candidate files (100 recommended), provide a subplan containing a recommended representative subset to ingest, a recommended summarize/skip list, and reasons; never skip the entire subtree;
   - The recommended confirmed set for this run at file level, with a reason for every entry, plus the pages or aggregate pages expected as output.
   This gate must not be bypassed on grounds such as "the user already selected a plan / confirmed the purpose" or "autonomy / persistence"; **plan selection confirmation ≠ file-level ingestion confirmation**. Do not proceed to step 8 until the user explicitly confirms.
8. After user confirmation, read the confirmed source files and write or update Wiki pages. Every confirmed file must be recorded as `ingested`, `summarized`, or `skipped_after_confirm`; do not silently omit any file. When delegating to subagents, require a file-level ledger according to the "Coverage Evidence Rules", and explicitly include the `sources` path format and example in the prompt (`.raw/<repo-name>/<repo-relative-path>`, such as `.raw/witty-diagnosis-agent/src/agents/AGENTS.md`). Do not use ambiguous wording such as only "relative path" or "repo path".
9. Update `wiki/index.md`, `wiki/hot.md`, and `wiki/log.md`. The log must record the confirmed total, counts for each final state, and the number and paths of any remaining pending files.
10. **[Manifest closure]** Backfill `.raw/.manifest.json`: write `ingest_status` for every confirmed file. For source files whose pages were actually created or updated, write `pages_created` / `pages_updated`; for summarized source files, write `evidence_page`, `evidence_kind: aggregate`, and `evidence_note`; for source files skipped after confirmation, write `skip_reason`. Also mark source files referenced, summarized, or skipped by subagents synthesizing a subsystem. Do not leave gaps.
11. **[Coverage audit]** Before claiming completion, compare the confirmed set with manifest final states. If there are `pending` files, empty evidence, unresolvable paths, or confirmed files missing from the ledger, continue ingestion, add evidence, or report the blocker to the user. Do not write "full ingestion complete".
12. Run `scripts/lint_wiki.py <wiki-root>` as a self-check. The self-check proves only structural health; coverage completion must still be based on the audit in step 11.

## Incremental Updates

1. Identify the existing Wiki root and confirm that `CLAUDE.md`, `wiki/index.md`, and `wiki/hot.md` exist.
2. Obtain the updated local repository path.
3. Run `scripts/plan_ingest.py <wiki-root> <repo-path>` to compare against `.raw/.manifest.json`.
4. **[Coverage gap self-check]** Same as step 6 in From Scratch.
5. **[Hard checkpoint, must not skip]** Pause and end this round here. Use the following requirements to compose the incremental comparison response, render the resulting content in Chinese, and do not display these English instruction bullets verbatim:
   - Counts by `status × confidence × bucket`;
   - A file-level list and recommended action (`ingest` / `summarize` / `skip`) for every new / changed bucket, not only source-code buckets containing more than 100 files;
   - **Display the `review` bucket separately** for newly added review candidates;
   - Group skip entries by reason;
   - When any bucket contains more than N new or changed files (100 recommended), provide a subplan containing a recommended representative subset to update, a recommended summarize/skip list, and reasons; never skip the entire subtree;
   - The recommended confirmed update list for this run at file level, with a reason for every entry and the corresponding affected Wiki page or aggregate page.
   This gate must not be bypassed on grounds such as "the user already selected a plan / confirmed the purpose" or "autonomy / persistence"; **plan selection confirmation ≠ file-level update confirmation**. Do not proceed to step 6 until the user explicitly confirms.
6. After user confirmation, update only affected pages and synchronize `index.md`, `hot.md`, and `log.md`. Every confirmed update file must be recorded as `ingested`, `summarized`, or `skipped_after_confirm`. When delegating to subagents, require a file-level ledger according to the "Coverage Evidence Rules".
7. **[Manifest closure]** Backfill `.raw/.manifest.json`: write `ingest_status` for each confirmed update file. For source files whose pages were actually created or updated, write `pages_created` / `pages_updated` (`new` → `pages_created`, `changed` → `pages_updated`); for summarized source files, write `evidence_page`, `evidence_kind: aggregate`, and `evidence_note`; for source files skipped after confirmation, write `skip_reason`. Also mark source files referenced, summarized, or skipped by subagents synthesizing a subsystem. Do not leave gaps.
8. **[Coverage audit]** Compare the confirmed update set with manifest final states. If there are `pending` files, empty evidence, unresolvable paths, or confirmed files missing from the ledger, continue updating, add evidence, or report the blocker to the user. Do not write "update complete".
9. Run `scripts/lint_wiki.py <wiki-root>` as a self-check. The self-check proves only structural health; coverage completion must still be based on the audit in step 8.

## Query

1. Run `scripts/query_context.py <wiki-root> "<问题>" --top 5`.
2. Read `wiki/hot.md` and `wiki/index.md` according to the returned `read_order`.
3. Read the candidate pages and follow first-level wikilinks.
4. Answer only from Wiki pages. If the material is insufficient, state the gap and recommend additional ingestion. Do not go to `.raw/` or the original repository on your own to find an answer.
5. If the answer has lasting value, save it to `outputs/queries/`, and promote it to `wiki/questions/` or update a relevant page when necessary.

## Self-Validation

Run structural lint after every creation, ingestion, or important update:

```bash
PYTHONIOENCODING=utf-8 python scripts/lint_wiki.py <wiki-root>
```

To save a report:

```bash
PYTHONIOENCODING=utf-8 python scripts/lint_wiki.py <wiki-root> --write-report
```

You must also perform a coverage self-check, manually or with a script:

- Every file in the confirmed set has `ingest_status` in the manifest.
- Every file with `ingest_status: ingested` has at least one `pages_created` or `pages_updated` entry.
- Every file with `ingest_status: summarized` has `evidence_page` and `evidence_note`.
- Every file with `ingest_status: skipped_after_confirm` has `skip_reason`.
- The completion wording in `wiki/hot.md` / `wiki/log.md` matches the manifest final-state counts.
- Any pending or unsubstantiated confirmed file is an error and must not be masked by lint 0 issues.
- `sources` path consistency: every page's `sources` entry is resolvable from the Wiki root, with repository snapshot files beginning `.raw/<repo-name>/`, and contains neither repository-root-relative paths nor absolute local paths.

## Do Not

### Default Exclusions (Only These Cases May Be Skipped)

- Do not enable Claude Code hooks, commands, agents, or the plugin manifest by default.
- Do not depend on Obsidian CLI, MCP, REST API, or `.vault-meta` by default.
- Do not copy the entire upstream claude-obsidian suite as the default plan.
- Do not directly read the original repository or `.raw/` during the query phase to fill answer gaps unless the user explicitly agrees to additional ingestion.

### File-Level Classification Rules

**Architecture signals (should be ingested, and must not be skipped wholesale as "implementation details"):**

- Entry files, registries, and route definitions: `index.ts`, `index.js`, `index.py`, `__init__.py`, `main.*`, `app.*`
- Type definitions and interfaces: `types.ts`, `types.py`, `schema.*`, `*.d.ts`
- Configuration builders and tool registries: `*.config.ts`, `*.config.js`, `register*.ts`, `registry.*`
- Plugin interfaces and agent prompt definitions: `plugin.*`, `agent.*`, `prompt.*`
- Project navigation documents: `AGENTS.md`, `SKILL.md`, `README.md`, `CLAUDE.md`
- Architecture design documents: `*-architecture*`, `*-design*`, `*-spec*`

**Implementation details (may be summarized or skip_after_confirm):**

- Test files: `*.test.ts`, `*.spec.js`, `*_test.go`, `test_*.py`, `conftest.py`
- Pure import forwarding files: files containing only `export * from` or `re-export`
- Repeated boilerplate: `__init__.py` (empty or containing only imports), `package-info.java`, `barrel files`
- Generated artifacts: `*.generated.*`, `*.min.js`, `dist/`, `build/`
- Dependency directories, build artifacts, test fixtures, binaries / resources

### Ban on Skipping Entire Subtrees

- Do not skip an entire subtree marked as a candidate by `plan_ingest` (such as more than 100 files under `src/<X>/`) as "implementation details". Split it into a "recommended representative subset for ingestion + recommended summary/skip list + reasons for each" plan and submit it to the user for judgment. Buckets with fewer than 100 files also require file-level confirmation and final-state records, but do not require a split subplan.
- **Do not skip the `review` bucket wholesale**: Review candidates may contain project-specific important content even though they are not under known directories (such as skills/ or playbooks/). The agent must inspect review candidates bucket by bucket and provide file-level ingest / summarize / skip_after_confirm decisions.

### Include by Default When Uncertain

- When you cannot determine whether a file is an architecture signal or an implementation detail, include it as a candidate by default (ingest or summarize); do not default to skip.
- When exclusion is necessary, record it as `skipped_after_confirm` and provide a file-level reason.
- After the user confirms full ingestion or confirms a bucket, do not silently exclude its files using default rules such as "implementation details", "test fixture", or "low value". When exclusion is necessary, record it as `skipped_after_confirm` and provide a file-level reason.

## Upstream Advanced Capabilities

The upstream claude-obsidian capabilities, including DragonScale, deterministic address, semantic tiling, transport detection, Obsidian integration, hooks, commands, and agents, may serve as reference material or future extensions. They are not part of this plan's default path.
