---
name: aet-generating-practice-case
description: Generate structured practice cases (实践案例) / project examples / tutorials / demos for any project, framework, or tool. Use this skill whenever the user wants to create practice cases, project examples, hands-on tutorials, or demo guides. Trigger phrases include "生成实践案例", "给个项目 demo", "写个使用教程", "写个案例", "做个 demo", "generate practice cases", "create project examples", "write a tutorial", "make a demo". Also trigger when the user is exploring a project and practice cases would help them understand it.
---

# Practice Case Generator

Generate structured, hands-on practice cases for any project based on user-selected input sources,
output format, content structure, and output language. This skill is interactive — it asks the user questions first,
then generates the case based on their choices.

## Workflow

### Step 1: Ask the user for configuration

Use the `question` tool to ask the user **all of the following questions at once** (minimize back-and-forth).
Use a single `question` call with multiple questions:

#### 1a. Input source — What should the case be based on?

Ask the user **with a single-select or multi-select question** (`multiple: true`). Options:

- **Project source code** — analyze the actual codebase (APIs, classes, usage patterns)
- **Project docs / README** — base cases on existing documentation
- **API definitions / interface documents** — focus on API contracts and interfaces
- **User scenario description** — user describes the scenario they want
- **Config files / example code** — use existing configs and examples

#### 1b. Output format — What format for the case?

Ask the user **with a single-select question** (`multiple: false`). Options:

- **Markdown document** — structured .md file with headings, tables, code blocks
- **Markdown with runnable code snippets** — markdown document with embedded, runnable code snippets; each snippet has a filename header and the reader can copy-paste to run

#### 1c. Content structure — What sections to include?

Ask the user **with a multi-select question** (`multiple: true`). Options:

- **Overview / Background** — what problem this case solves, prerequisites, estimated time
- **Environment Setup / Prerequisites** — installation, dependencies, setup verification
- **Step-by-step Guide** — detailed implementation steps with code and verification
- **Complete Code Listing** — complete code listing (collapsible section)
- **Running & Verification** — how to run and verify the result
- **Best Practices & Caveats** — tips, pitfalls, production considerations
- **FAQ** — anticipated issues and solutions
- **Next Steps / Further Reading** — where to go next

#### 1d. Output language — What language for the generated document?

Ask the user **with a single-select question** (`multiple: false`). Options:

- **English** — generate the practice case in English
- **中文 (Chinese)** — generate the practice case in Chinese

### Step 2: Analyze the project based on input source

Based on the user's selected input source(s):

- **Project source code**: Explore the codebase using `glob`, `read`, `grep`. Understand directory layout, key modules, public APIs, entry points, configuration. Read core source files.
- **Project docs / README**: Read README, docs/ directory, wiki files. Understand purpose, installation, usage.
- **API definitions / interface documents**: Focus on API contracts, interface definitions, endpoint specs, schema files, type definitions.
- **User scenario description**: Carefully parse the user's description. Identify what scenario they want covered, what technology stack, what outcome they expect.
- **Config files / example code**: Read config files (package.json, Dockerfile, etc.) and example code to understand usage patterns.

If multiple sources are selected, combine analysis for a comprehensive understanding.

### Step 3: Generate the practice case

Generate the practice case based on the selected output format, content structure, and output language.

#### General quality principles for ALL cases:

- **Real-world relevance**: Each case solves a realistic problem, not just showing syntax.
- **Step-by-step progression**: Start simple, add complexity progressively. Each step builds on the previous.
- **Clear objectives**: State what the reader will learn and what the final outcome will be.
- **Complete code**: Include all code needed. Use placeholders like `YOUR_API_KEY_HERE` for sensitive values.
- **Explain the why**: For non-trivial code or config, explain *why* it's done that way, not just *what* it does.
- **Error handling**: Demonstrate proper error handling and edge cases where relevant.
- **Verification steps**: Tell the reader how to verify each step (expected output, test commands, etc.).
- **Self-contained**: The case should be understandable without referring to external documentation.
- **Scoped appropriately**: Don't overwhelm — focus on 1-2 core concepts per case. Multiple small cases are better than one giant one.

#### Output format specifics:

**If Markdown document:**
Use proper markdown with:
- `#` for title, `##` for sections, `###` for subsections
- Code blocks with language tags
- Tables for structured info
- Lists for steps and prerequisites

**If Markdown with runnable code snippets:**
Same as Markdown document, plus:
- Each code block has a filename comment at the top (e.g., `// src/index.js`)
- Code blocks are complete and independently runnable where possible
- A project structure tree showing file layout
- Indicate which files go where and how to run them

#### Content structure mapping:

Use the user's selected sections to build the document. Each selected section becomes a top-level heading. Here's guidance for each:

- **Overview / Background**: 2-3 sentences on the scenario, what the case teaches, intended audience. Include a difficulty indicator (⭐/⭐⭐/⭐⭐⭐) and estimated time.
- **Environment Setup / Prerequisites**: List prerequisites (runtime, dependencies, versions). Provide install commands with verification steps ("Run `xxx` and you should see...").
- **Step-by-step Guide**: Break into numbered steps. Each step has: goal, code, explanation, verification. Progress from simple to complex.
- **Complete Code Listing**: Use `<details><summary>` collapsible sections to list full file contents without cluttering the step-by-step.
- **Running & Verification**: How to run the complete case (start command, open browser, expected output screenshot description, test commands).
- **Best Practices & Caveats**: Production considerations: security, performance, error handling, configuration management, logging.
- **FAQ**: Table format — Q column, A column. Anticipate 3-5 real issues a beginner would face.
- **Next Steps / Further Reading**: Suggest 2-3 follow-up cases or external resources. Make them specific, not generic.

#### Language-specific generation:

**If English selected:**
- Write all headings, body text, labels, code comments, and descriptions in English
- Use English section names exactly as listed in 1c
- Use natural English phrasing throughout

**If 中文 (Chinese) selected:**
- Write all headings, body text, labels, code comments, and descriptions in Chinese
- Map English section names to natural Chinese equivalents:
  - Overview / Background → 概述 / 背景介绍
  - Environment Setup / Prerequisites → 环境准备 / 前置条件
  - Step-by-step Guide → 步骤详解
  - Complete Code Listing → 完整代码汇总
  - Running & Verification → 运行与验证
  - Best Practices & Caveats → 最佳实践与注意事项
  - FAQ → 常见问题
  - Next Steps / Further Reading → 进阶阅读 / 下一步
- Use natural Chinese phrasing throughout

### Step 4: Present results

After generating:
1. Tell the user what was generated (filename, location, sections included, language)
2. Summarize the content briefly
3. Ask if they want adjustments or additional cases

## Output

- **Format**: As selected by user (Markdown document or Markdown with runnable code snippets)
- **Language**: As selected by user (English or Chinese) via the language preference question
- **Destination**: Write to a file in the user's working directory or specified path
- **Filename pattern**: `practice-case-[case-name]-[project-name].md`
