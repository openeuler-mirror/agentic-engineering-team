---
name: aet-analyzing-project
description: |
  Use when analyzing a codebase to understand architecture, module boundaries, and project conventions.
  Use when implementing changes that must follow the project's documented principles.
  Use when the user asks to analyze a repository, document a codebase, trace where a feature lives, or turn a project into a reusable skill.
  Triggers: "analyze this repo", "how does this project work", "where is X implemented", "what are the coding conventions", "project analysis", "项目分析", "分析这个项目".
  Even if the user only provides a path inside this project, use this skill.
metadata:
  pattern: router
---

# Project Analysis

This SKILL has two execution modes:

**Router Mode**: Routes to different analysis flows based on the user's input analysis scope (overall project, component analysis, single component).
**Pipeline Mode**: In the overall project analysis flow, executes sequentially by phases, from overview analysis to architecture analysis to module analysis, and finally distills development principles.

## Pipeline Mode

- **Project Overview Analysis**: Execute stages S1-S8 in `references/phase1-project-overview.md`, no skipping allowed.
- **User Feedback**: Tell the user: "Overview analysis has been generated and can be used directly. The next step will perform more detailed module analysis and principle extraction. Do you want to proceed to the next step (recommended to continue)?"
- **In-depth Analysis**: If continuing, execute stages S1-S5 in `references/phase2-component-analysis.md`, no skipping allowed.

## Router Mode

This skill handles two types of requests:

1. **Project Overview Analysis**: User wants to understand the project as a whole, generate overview, architecture, and module analysis documents, enter the `references/phase1-project-overview.md` flow.
2. **Component Analysis**: User wants to build detailed analysis documents for each component and generate project principles, enter the `references/phase2-component-analysis.md` flow.
3. **Specific Module Analysis**: User only cares about analysis of a single module, refer to template `assets/module-detail-template.md`, directly enter the analysis flow for that module. 
