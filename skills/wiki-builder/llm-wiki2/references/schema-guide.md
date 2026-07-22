# CLAUDE.md Schema Guide

`CLAUDE.md` (which some tools also read as `AGENTS.md`) is the **schema document** for a wiki
topic. It tells the LLM agent the scope, conventions, current state, and open questions — every
session should start by reading this file together with `wiki/index.md`.

## Why it matters

Without a schema, the LLM creates inconsistent page names, overlapping articles, and drifts from
the wiki's intended scope. A well-maintained schema makes the LLM a disciplined, consistent
wiki maintainer.

**Co-evolve with the wiki** — update it after every major compile, ingest batch, or structural
change.

## Full template

```markdown
# <topic title> Knowledge Base

> Schema document — read at the start of every session together with wiki/index.md.

## Scope

What this wiki covers:
- <bullet list of included domains>

What this wiki deliberately excludes:
- <bullet list of out-of-scope domains>

## Operations

This wiki follows these operations: `compile`, `ingest`, `query`. Each operation appends an
entry to `log/YYYYMMDD.md`.

## Naming conventions

### Pages
- **Concept pages** (`wiki/concepts/`): Title Case noun phrases. E.g. "Market Making Strategy",
  not "market making" or "MarketMakingStrategy".
- **Folder-split concepts** (`wiki/concepts/<topic>/`): used when a topic would exceed ~1200
  words as a single page. Contains `index.md` + one file per aspect.
- **Entity pages** (`wiki/entities/`): Proper nouns. E.g. "Andrej Karpathy", "Obsidian",
  "Avellaneda-Stoikov Model".
- **Summary pages** (`wiki/summaries/`): kebab-case source slug. E.g. "karpathy-llm-wiki-gist".

### Wikilinks
- Always use `[[Page Title]]` — exact page title, case-sensitive.
- For folder-split pages, link to the index: `[[concepts/Foo/index|Foo]]`.
- Link the first mention of every entity or concept. Don't link the same page more than twice
  per article.

### Frontmatter
Every wiki page has YAML frontmatter:
```yaml
---
title: <page title>
type: concept | entity | summary
created: YYYY-MM-DD
updated: YYYY-MM-DD
sources: [list of raw/ slugs this page references]
tags: [relevant tags]
---
```

### Diagrams and formulas
- All diagrams are **mermaid**. No ASCII art.
- All formulas are **KaTeX** (inline `$...$` or block `$$...$$`).

### Raw file policy
- Small text sources → copy into `raw/<subfolder>/` (`articles/`, `notes/`, `source/`, `papers/`).
- Large binary files → create a pointer file at `raw/refs/<slug>.md` with `kind: ref`
  frontmatter and an `external_path` field. Do not copy the binary.
- Source files → place in `raw/source/`; ingest only high-information-density files (entry,
  architecture definition, Agent definition, config schema, tool registry), skipping pure
  implementation details.

## Current articles

### Concepts
- [[<concept title>]] — one-line summary
- [[concepts/<Topic>/index|<Topic>]] — (folder split) one-line summary
    - [[<Topic>/<aspect-1>]] — ...

### Entities
- [[<entity name>]] — one-line summary

### Summaries
- [[summaries/<slug>]] — source title (date)

## Open research questions

- <questions that should drive future ingestion/query work>
- <what the wiki currently covers poorly>
- <contradictions or gaps noticed between articles>

## Research gaps

Sources to ingest:
- [ ] <URL or paper title> — why it's relevant

## Notes for the LLM

<Any special instructions: tone, depth level, language (zh/en), how to handle contradictions, etc.>
```

## What makes a good schema

**Good scope definition** prevents sprawl. A wiki on "LLM memory techniques" should exclude
"LLM training", even though they are related.

**Explicit naming conventions** prevent broken wikilinks. If you decide concept pages use
Title Case headings, enforce it — a broken wikilink is an orphan page.

**A maintained article list** lets the LLM know what already exists before creating new pages.
The most common error is creating a duplicate article with a slightly different name.

**Open research questions** give the LLM direction. Without them, the LLM defaults to ingesting
the most obvious sources and misses what you actually care about.

## Update cadence

- After every new concept page: add it to "Current articles".
- After every ingest batch: update the "Sources to ingest" checklist.
- After every successful self-validation: update "Research gaps".
- Monthly: review scope and clean up stale research questions.
