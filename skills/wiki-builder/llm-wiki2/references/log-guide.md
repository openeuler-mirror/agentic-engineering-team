# Log Guide — the `log/` folder

The wiki's operation log is a **folder**, not a single file. One file per day, named
`log/YYYYMMDD.md`. This keeps individual files small, makes daily activity easy to browse,
and plays well with git diff.

## File naming

- Filename: `log/YYYYMMDD.md` (e.g. `log/20260409.md`)
- Regex: `^\d{8}\.md$`
- No other files are allowed at the top level of `log/`. `scripts/lint_wiki.py` flags stray
  files.

## File format

```markdown
# 2026-04-09

## [09:15] ingest | google-gemma-4-article
- Source: raw/articles/google-gemma-4.md
- Touched: 5 wiki pages
  - summaries/google-gemma-4 (new)
  - concepts/Gemma.md (updated)
  - entities/Google.md (updated)
  - entities/Gemma 4.md (new)
  - index.md (updated)

## [14:30] scaffold | Initialized topic knowledge base
- [[Claude Code Architecture]] → renamed to [[tech/claude-code/Claude_Code_Architecture]] in 2 files
```

Rules:
- One H1 per file, matching the filename's date in ISO format (`YYYY-MM-DD`).
- One H2 per operation, starting with `## [HH:MM] <operation> | <one-line description>`.
- Times are local, 24-hour.
- The body is a short bullet list summarizing the changes. Use wikilinks to the touched files.

## Operations allowed in the log

| Operation | When it appears | Example |
|---|---|---|
| `compile`  | Structural edits, splits, merges, index rebuild | `## [10:00] compile \| split Claude Code page into 7 sub-pages` |
| `ingest`   | New source added to `raw/`, wiki updated | `## [09:15] ingest \| google-gemma-4-article` |
| `query`    | Question answered, output file written | `## [11:20] query \| rag-vs-llm-wiki-tradeoffs` |
| `promote`  | Output promoted to `wiki/concepts/` | `## [11:35] promote \| RAG vs LLM Wiki (from query)` |
| `split`    | A single page split into a folder | `## [10:00] split \| Claude Code → claude-code/` |
| `scaffold` | Initial wiki setup | `## [08:00] scaffold \| Initialized topic knowledge base` |

## Quick grep

```bash
# All operations on a given day
cat log/20260409.md

# Recent activity across days
grep -rh "^## \[" log/ | sort | tail -20

# Activity related to a specific file
grep -rl "Claude_Code" log/
```

## Migrating from a single `log.md`

If you have an existing `log.md` (from v1 of the skill), convert it as follows:

1. Parse each `## [YYYY-MM-DD] op | description` heading.
2. Group entries by date.
3. For each date `D`, create `log/D.md` with the date as the H1 and an H2 per operation —
   converting `[YYYY-MM-DD]` to `[HH:MM]` (use `00:00` if no time was recorded).
4. Delete the old `log.md`.

This is a one-time manual operation; the skill does not do it automatically.

## What not to put in the log

- **Content**: do not copy-paste article blocks you wrote into the log. The log is a pointer,
  not a diary.
- **Long rationale**: put design decisions and rationale in `CLAUDE.md`'s "Notes for the LLM"
  rather than the log.
- **Secrets/credentials**: never.
