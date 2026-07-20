---
name: aet-implementing-requirement
description: Independent implementation phase skill - executes design specifications into working solutions
---

## Language Detection and Response

### Language Detection

- Automatically detect the language of user input

### Response Language Matching

- Respond in the same language as the user input
- For actual implementation work (coding, documentation writing, etc.), use the language appropriate for the project context

## When to Use

Use this skill when:

- You have an approved design document
- You need to implement features, bug fixes, or code changes
- You need to turn specifications into working code

## Input

This skill accepts:

- Design document path **OR** inline design content (markdown string)
- Implementation plan path **OR** inline plan content (markdown string)
- Feature folder path for context storage (optional)
- **Output directory override** (optional) — caller may specify the directory for the
  implementation record file (e.g. the bugfix workflow passes
  `./ai_assistance/features/{feature-name}/bugfix/` so the record sits next to the diagnosis report)
- **In-memory mode flag** (optional) — when set, this skill MUST NOT write any
  record file under `.aet/`. Only project source code / test edits are persisted.

Check for design specifications:

- For feature development: `./ai_assistance/features/{feature-name}/`
- For non-feature tasks: `.aet/{task-id}/`

## Output Location

Based on task type, save to:

- **Code**: Appropriate directories based on project structure
- **Tests**: Test directories following project organization
- **Documentation**: Relevant documentation directories
- **Configuration**: Update or create configuration files as needed

**Feature development**: Output to `./ai_assistance/features/{feature-name}/implementation/`
**Non-feature task**: Output to `.aet/{task-id}/implementation/`

File naming: `{YYYYMMDD-HHMMSS}-{description}.md`

### Caller-Specified Overrides (additions)

The defaults above apply when the caller provides no extra hints. Two optional caller
inputs can override the default record-file behavior:

- **Output directory override**: if the caller passes an explicit output directory
  (e.g. the bugfix workflow passes `./ai_assistance/features/{feature-name}/bugfix/`), write the
  implementation record there instead of the default `implementation/` folder. Project
  source / test / doc / config files still go to their normal project locations.
- **In-memory mode flag**: if the caller sets this flag, do NOT write any record file
  under `.aet/` at all. Return implementation status and a summary as inline content to
  the caller. Project source / test edits are still persisted to the project tree as usual.

## Coding Standards (编程语言规范)

Before writing code, this skill loads the **per-language coding standards** in force for the
current project/company, and follows them while implementing. Standards are configurable and
resolved through a layered override mechanism (project overrides company overrides the
install-seeded baseline):

```
./.aet/implement/custom/language-standards/<lang>.md   项目自定义 (最高)
./.aet/implement/aet/language-standards/<lang>.md       项目基线
~/.aet/implement/custom/language-standards/<lang>.md    公司自定义
~/.aet/implement/aet/language-standards/<lang>.md        公司基线 (安装时 seed)
```

**Resolution is script-only.** Always obtain standards by running
`scripts/resolve-standards.mjs` (see Step 1.5 in WORKFLOW.md) — **never read the
`language-standards/<lang>.md` files directly**, because only the script applies the
layered override order and reports which layer won. The same resolver and the same
`~/.aet/implement/.../language-standards/` data are shared with `aet-reviewing-code`, so
code is reviewed against the exact standard it was written to.

## Implementation Workflow

See [WORKFLOW.md](./WORKFLOW.md) for detailed implementation workflow steps.
