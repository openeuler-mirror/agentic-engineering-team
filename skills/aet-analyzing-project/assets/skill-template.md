---
name: aet-analyzing-project
description: |
  Use when analyzing a codebase to understand architecture, module boundaries, and project conventions.
  Use when implementing changes that must follow the project's documented principles.
  Triggers: "analyze this repo", "how does this project work", "where is X implemented",
  "what are the coding conventions", "project analysis", "项目分析", "分析这个项目".
  Even if the user only provides a path inside this project, use this skill.
metadata:
  pattern: tool-wrapper
---

# Project Analysis

## Usage reminders

> **Code first**: This project analysis cannot replace reading the actual code. This document is used to understand the project globally and speed up navigation, but it may be incorrect or outdated relative to the code; always use **this document + the actual code** together. In case of conflict, the actual code always wins.

> **Recommended to load**: Read the `principles/` folder (if any) and follow the golden rules documented there when coding.

## File index

<!-- instruction: Fill in based on what has actually been generated; do not omit or fabricate. -->

| File / Directory | Description | When to read first |
|------------|------|---------|
| `Overview.md` | Project overview, tech stack, and directory structure | When first entering the project |
| `Architecture.md` | System boundaries, layering, core flows | When understanding the overall design |
| `Modules.md` | Module decomposition, dependencies, communication patterns | When locating which module owns a feature |
| `modules/` | Detailed description for each module and submodule | When making deeper changes in a module |
| `principles/` | Development principles split by topic | Before coding / before refactoring |

## Module index

<!-- instruction: If module details have not been generated yet, leave this table empty and state that there are no detailed files. -->

| ID | Name | Responsibility | Doc |
|----|------|------|------|
| M001 | [To be filled] | [To be filled] | `modules/M001-xxx.md` |
| M001.1 | [To be filled] | [To be filled] | `modules/M001/M001.1-yyy.md` |

## Notes

### Scenarios that should trigger this skill

- Need to quickly understand the project's overall architecture
- Need to determine which module a feature belongs to
- Need to follow existing project conventions for naming, error handling, or logging
- Need to confirm dependency impact before making changes
- Need to consolidate analysis results into reusable development principles

### Things this skill should NOT replace

- Do not use analysis documents instead of reading actual source code
- Do not mistake a single module’s habits for global conventions
- Do not guess design intent without evidence

## How to use

1. Read `references/Overview.md` and `references/Architecture.md` first.
2. Then locate by functionality: read `references/Modules.md` and the corresponding `references/modules/*.md`.
3. Before coding, check `principles/*.md`.
4. When conflicts arise, use source code and architectural evidence as the source of truth.
