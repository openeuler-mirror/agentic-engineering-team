#!/usr/bin/env python3
"""Scaffold a claude-obsidian-style repository wiki.

Usage:
    python scaffold_repo_wiki.py <wiki-root> "<Project Title>" [--repo-url URL]
"""

from __future__ import annotations

import argparse
import json
from datetime import date, datetime
from pathlib import Path
from typing import Optional, cast


def write_if_missing(path: Path, content: str) -> bool:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        return False
    path.write_text(content, encoding="utf-8")
    return True


def scaffold(root: Path, title: str, repo_url: str | None = None) -> None:
    today = date.today().isoformat()
    now = datetime.now().strftime("%H:%M")
    dirs = [
        ".raw",
        "wiki/modules",
        "wiki/components",
        "wiki/decisions",
        "wiki/dependencies",
        "wiki/flows",
        "wiki/concepts",
        "wiki/entities",
        "wiki/questions",
        "wiki/meta",
        "outputs/queries",
    ]
    for item in dirs:
        (root / item).mkdir(parents=True, exist_ok=True)

    manifest = root / ".raw/.manifest.json"
    if not manifest.exists():
        manifest.write_text(json.dumps({"sources": {}}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    repo_line = f"- Repository: {repo_url}\n" if repo_url else "- Repository: <fill after clone or source selection>\n"
    write_if_missing(
        root / "CLAUDE.md",
        f"""# {title} Repository Wiki

> Schema document for a claude-obsidian-style repository wiki. Read this together with `wiki/hot.md` and `wiki/index.md` at the start of work.

## Scope

This wiki covers:
- Repository architecture, modules, components, dependencies, flows, and design decisions.
{repo_line}
This wiki excludes:
- Low-value implementation details, generated files, dependency directories, build outputs, and test fixtures unless the user explicitly asks to ingest them.

## Operations

- `scaffold`: create the repository wiki skeleton.
- `ingest`: classify source files, ask for confirmation, then create or update wiki pages.
- `query`: answer from `wiki/hot.md`, `wiki/index.md`, and linked wiki pages.
- `lint`: check dead links, orphan pages, index gaps, frontmatter gaps, empty sections, stale summaries, and contradictions.

## Page Types

- `overview`: `wiki/overview.md`
- `module`: `wiki/modules/`
- `component`: `wiki/components/`
- `dependency`: `wiki/dependencies/`
- `flow`: `wiki/flows/`
- `decision`: `wiki/decisions/`
- `concept`: `wiki/concepts/`
- `entity`: `wiki/entities/`
- `question`: `wiki/questions/` or `outputs/queries/`

## LLM Notes

- Keep pages concise and source-backed.
- Prefer Mermaid for flows.
- Mark conflicting claims with `> [!contradiction]` instead of silently overwriting.
- Do not answer from `.raw/` during query unless the user approves a new ingest.
""",
    )

    write_if_missing(
        root / "wiki/index.md",
        f"""# Index - {title}

> Repository wiki catalog. Every generated wiki page should appear here exactly once.

## Overview
- [[overview|Project Overview]] - Initial repository overview.

## Modules
*(none yet)*

## Components
*(none yet)*

## Dependencies
*(none yet)*

## Flows
*(none yet)*

## Decisions
*(none yet)*

## Concepts
*(none yet)*

## Entities
*(none yet)*

## Open Questions
- What are the highest-value files to ingest first?
""",
    )

    write_if_missing(
        root / "wiki/hot.md",
        f"""# Hot Cache - {title}

Updated: {today}

## Current Context
- Repository wiki scaffolded, but no source files have been ingested yet.
- Start by ingesting README, docs, dependency files, entrypoints, routing definitions, config schemas, deployment files, and CI files.

## Recent Activity
- {today} {now}: scaffolded repository wiki.

## Next Best Actions
- Clone or copy the repository into `.raw/<project-name>/`.
- Run `plan_ingest.py` to classify candidate files.
""",
    )

    write_if_missing(
        root / "wiki/log.md",
        f"""# Wiki Log

## [{today}] scaffold | Initialized {title} repository wiki
- Created claude-obsidian-style repository wiki skeleton.
- Created `.raw/.manifest.json`, `wiki/index.md`, `wiki/hot.md`, and repository page folders.
""",
    )

    write_if_missing(
        root / "wiki/overview.md",
        f"""---
title: Project Overview
type: overview
status: seed
created: {today}
updated: {today}
sources: []
tags: [repository, overview]
---

# Project Overview

This page is a seed. Ingest the repository README, docs, dependency files, and entrypoints to replace this with a source-backed overview.

## What It Does

Unknown until first ingest.

## Tech Stack

Unknown until first ingest.

## Reading Route

- [[index|Index]]
""",
    )

    print(f"Repository wiki scaffolded at: {root}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("wiki_root")
    parser.add_argument("title")
    parser.add_argument("--repo-url", default=None)
    args = parser.parse_args()
    scaffold(Path(cast(str, args.wiki_root)), cast(str, args.title), cast(Optional[str], args.repo_url))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


