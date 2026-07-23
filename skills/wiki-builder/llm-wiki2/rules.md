---
name: llm-wiki2
description: >-
  Solution Two: build a retrieval-friendly Wiki from a local project repository.
  Automatically scans project source code and documentation, extracts key content
  such as API docs, configuration explanations, and architecture information,
  generates structured concept/entity/summary pages, and builds cross-references,
  supporting natural-language Q&A based on the Wiki content.
---

# Local Project Wiki — Solution Two

> Build a retrieval-friendly Wiki from a local project repository.

## Environment requirements

- **Python 3** (the scaffold script depends only on the standard library; no third-party packages)

Before running, check the environment. If the requirement is not met, ask the user whether to
install it; proceed with installation once the user agrees.

## Tool reference

| Tool | Purpose |
|------|---------|
| [Obsidian](https://obsidian.md) | IDE for browsing the wiki; graph view shows the relationships |
| `scripts/scaffold.py` | Initialize a new wiki directory tree |
| `scripts/lint_wiki.py` | Health check (dead links, orphan pages, missing index entries) |

---

## Build from scratch

1. Determine the wiki topic and name from the user's input (e.g. if the user says "给 XX 项目建
   wiki", the name is based on XX).
2. Determine the wiki root directory (default: `wiki-<topic-name>/` under the current directory,
   or as specified by the user).
3. Run the scaffold script directly to create the directory structure:
   ```bash
   PYTHONIOENCODING=utf-8 python scripts/scaffold.py <wiki-root> "<topic title>"
   ```
4. Tell the user the directory has been created.
5. Enter the ingest flow (see [ingest](#ingest) below).

## Incremental update

1. Determine the wiki root directory from the existing wiki directory provided by the user.
2. The user provides the local directory of the source code.
3. Enter the ingest flow (see [ingest](#ingest) below), skipping the scaffold initialization step.
4. Show the user the update result (new/changed pages, etc.).
5. Tell the user they can start querying; jump to Retrieval and Query.

---

## ingest

First copy the contents of the local source directory provided by the user into `wiki/raw/`
(placing them into different subdirectories by content type), generate or update
`wiki/raw_manifest.json` (recording the md5 of each file), then execute the four phases below
in order to complete page creation and self-validation:

| raw/ subdirectory | Content type | Example |
|-------------------|--------------|---------|
| `articles/` | Docs, manuals, architecture notes, config references | `.md` files under `docs/` |
| `notes/` | README, project intro, short notes | `README.md`, `PROJECT_INTRODUCTION.md` |
| `papers/` | Papers, research reports | — |
| `source/` | **Source files** (entry files, core modules, config files, etc.) | `src/index.ts`, `src/plugin-config.ts`, `package.json`, `tsconfig.json` |
| `refs/` | Pointer files for large binary files | Pointer files rather than binary copies |

> **Source-file selection criteria** (placed in `raw/source/`): ingest only
> **high-information-density** source files — entry files, core architecture definitions,
> Agent definitions, config schemas, tool registries, key type definitions. Skip pure
> implementation details (such as tool internals, helper functions, test code).

### ⏸️ Phase 1: Classification and confirmation

**Only classify; do not start creating pages yet.**

1. Scan all files under `raw/` and read `raw_manifest.json` (if present).
2. Compute the md5 for each file and compare with the manifest, marking the change status:
   - **New**: files not present in the manifest
   - **Changed**: files whose md5 does not match the manifest record
   - **Unchanged**: files whose md5 matches the manifest; skip these
   - **Skip**: low-value files (e.g. tests/, binaries, etc.)
3. Update `raw_manifest.json` with the latest md5 for all files.
4. Draft a Wiki page generation plan (which concept pages, entity pages, summary pages).
5. Organize the classification result and the page plan, then display them directly to the user
   (do NOT use the `question` tool).

⛔ **Stop here! Wait for user input:**
   - If the user proposes adjustments (e.g. "跳过文件 X"、"合并 A 和 B") → modify per the
     user's request, then **re-display the modified result** and wait for user input again.
   - If the user confirms (e.g. "确认"、"继续"、"可以") → enter Phase 2.

### Phase 2: Create pages

Pages may only be created after the user confirms.

1. Fully read all raw files in `raw/*` (all subdirectories: articles, notes, source, papers,
   refs) that are relevant to the target pages. Every **key information point** in each raw file
   (such as entry, build, dependencies, configuration, parameters, interface definitions, data
   structures, etc.) must be covered by the corresponding wiki page; files must not be skipped
   because of their type (e.g. source code, config files).
2. Handle by file-change type:
   - New file → create the Wiki pages per the steps below
   - Changed file → update the corresponding Wiki pages per the steps below
   - Duplicate content (an identical or similar file already processed in the current batch) →
     skip; record it in the summary and log
2. Create `wiki/summaries/<slug>.md` (200–400 words — key points, not a rewrite).
3. Create or update the relevant concept pages in `wiki/concepts/`. Follow the
   divide-and-conquer principle: if a concept page would exceed 1200 words, split it rather
   than cramming.
4. Create or update entity pages in `wiki/entities/` for newly referenced people/tools/papers/
   organizations.
5. Update `wiki/index.md` so new pages appear under the correct categories.

### ⏸️ Phase 3: Result summary and confirmation

6. **Output a summary to the user** (display directly; do NOT use the `question` tool),
   including:
   - Ingested content (files + wiki pages created/updated)
   - Skipped content (files + reason)
   - Duplicate content (files + the corresponding existing pages)
   - Remaining files (if any), e.g. "131 files still unprocessed"
   - **A recommendation on whether to continue ingesting**: assess the value density of the
     remaining files

⛔ **Stop here! Wait for user input:**
   - If the user proposes adjustments → modify per the user's request, then **re-display the
     modified result** and wait for user input again.
   - If the user confirms → enter Phase 4.

### Phase 4: Self-validation and wrap-up

7. Write the log:
   `## [HH:MM] ingest | <slug> — <one-line description> (N new pages, M updated, K duplicates)`.
   For batch processing, record a complete summary.
8. Run self-validation (see [Self-validation](#self-validation) below).
9. After self-validation passes, first display the list of ingested raw files, the corresponding
   Wiki page list, and the full Wiki directory structure.
10. Generate a basic project introduction (200–400 words) based on the ingested content so someone
    unfamiliar with the project can get an initial understanding. Show it directly to the user.
11. Remind the user they can start asking questions.

## Self-validation

Runs automatically after ingest completes. Two parts:

**1. Run the lint script**:
`PYTHONIOENCODING=utf-8 python scripts/lint_wiki.py <wiki-root>` — automatically checks and
fixes structural issues such as dead links, orphan pages, and missing index entries.

**2. AI quality check**: AI automatically checks and fixes what lint cannot cover:
- **Completeness**: does every ingested raw file have a corresponding Wiki page?
- **Coverage**: have key concepts been turned into pages; are there obvious gaps?
- **Conformance**: are pages kept within the 400–1200 word range?
- **Format consistency**: are code blocks and heading levels well-formed?

---

## Retrieval and Query

Answer questions based on the Wiki content rather than relying on general knowledge.

**Steps**:
1. Read `wiki/index.md`. Scan relevant pages by category.
2. Fully read the identified pages; follow first-level wikilinks.
3. If the Wiki does not have enough material, state the gap honestly and suggest an ingest path;
   **do NOT bypass this by going to `raw/` or the project's original directory to find the answer**.
   You must wait for the user to decide whether to supplement with more ingestion before continuing.
4. Synthesize the answer, citing pages inline with `[[Page Name]]`.
5. Save to `outputs/queries/<YYYY-MM-DD>-<question-slug>.md` and tell the user it has been saved
   to this path.
6. If the answer has lasting value → promote a cleaned-up version to `wiki/concepts/` and add it
   to `index.md`.
7. Write the log: `## [HH:MM] query | <question-slug>`.

## compile

Restructure the wiki content based on the existing `raw/` materials — including splitting
over-large pages, merging near-duplicate pages, and rebuilding `index.md`.

**When to run**: when the Wiki has gone through many ingests and the page count and structure
have become messy, proactively remind the user whether to run a compile to tidy up. Trigger
scenarios include:
- Similar pages appearing across batches that should be merged
- So many pages that the `index.md` structure is no longer clear
- The user explicitly says "清理一下 Wiki"

**Steps**:
1. Read `CLAUDE.md`, `wiki/index.md`, and all files in the target subtree.
2. For each page exceeding ~1200 words: plan a split into `concepts/<topic>/` with an index +
   sub-pages. Confirm the plan with the user before writing.
3. For each pair of near-duplicate pages: propose a merge. Rewrite after confirmation.
4. Regenerate `wiki/index.md`, ensuring each page is listed exactly once.
5. Write the log: `## [HH:MM] compile | <what was done — files involved, splits, merges>`

---

## `wiki/index.md` format

The LLM rebuilds `index.md` on each compile and updates it on each ingest. Format:

```markdown
# Index — <topic>

> One sentence describing the wiki's scope.

## 🔖 Navigation
- [[#Concepts]] · [[#Entities]] · [[#Summaries]] · [[#Open Questions]]

## Concepts
### <category A>
- [[concepts/Foo]] — one-line summary
- [[concepts/Bar/index|Bar]] — (folder split) one-line summary
    - [[concepts/Bar/aspect-1]] — ...
    - [[concepts/Bar/aspect-2]] — ...

### <category B>
- ...

## Entities
- [[entities/Andrej Karpathy]] — AI researcher, author of the llm-wiki pattern

## Summaries (chronological)
- 2026-04-09 — [[summaries/llm-wiki-gist]] — Karpathy's original Gist

## Open Questions
- Q1: ...
```

Rules:
- Every wiki page must appear exactly once in `index.md`. `Self-validation` enforces this.
- Folder-split concepts show the hierarchy via indentation.
- `index.md` + `CLAUDE.md` are what the AI reads at the start of every session.

## `log/` format

See `references/log-guide.md`. Minimum requirements:

- One file per day: `log/YYYYMMDD.md`
- The H1 is the date; each entry uses an H2: `## [HH:MM] <operation> | <one-line description>`
- Operation types: `compile`, `ingest`, `query`, `promote`, `split`, `scaffold`

Quick history search: `grep -rh "^## \[" log/ | tail -20`.

## References

- `references/schema-guide.md` — what `CLAUDE.md` should contain
- `references/article-guide.md` — how to write good wiki articles (length, wikilinks, mermaid,
  math formulas, divide-and-conquer)
- `references/log-guide.md` — the `log/` folder spec
- `references/tooling-tips.md` — installing Obsidian, viewing the graph, using the Web Clipper
