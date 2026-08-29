---
name: wiki-builder
description: >-
  Build and query a lightweight personal Wiki from any content (articles, notes,
  web pages, documents, code). Provides two core operations: `build` (import
  content and generate structured Wiki pages with cross-references) and `query`
  (natural-language Q&A based on Wiki content).
  Triggers when the user says "建个 wiki"、"做个知识库"、"把这些整理成 wiki"、
  "把这个变成 wiki"、"从 XXX 生成 wiki", or otherwise needs to turn unstructured
  content into structured docs.
  Also applies when the user wants to search or query existing wiki content.
  Not suitable for plain notes, one-off summaries, or non-wiki documentation
  organization. (Interactive prompts are kept in Chinese.)
---

# wiki-builder

> Lightweight Wiki generator and knowledge base — only two operations, no audit pipeline.

## Core idea

Only two operations — `build` and `query`. No audit files, no feedback loops, no lint scripts.
The AI writes a Wiki based on the materials the user provides. The user adds content, the AI
organizes it into cross-referenced pages, and then the user asks questions against the Wiki.

Users have different usage scenarios, and the `build` operation matches different Wiki solutions
based on context:
- It may need to install dependencies (e.g. npm packages, Python libraries) to handle
  specific input formats.
- It may need to call other skills (e.g. web scraping, PDF parsing, code analysis) to
  pre-process materials.
- It may also read text content directly and have the AI generate the Wiki directly.

## Operations

### `build` — Generate a Wiki from content

First, determine intent from the user's input:
- If the input is a creation-type expression such as **"为 XX 生成 wiki"** (generate a wiki for XX),
  **"给 XX 建个 wiki"** (build a wiki for XX) → enter the `question` selection flow below.
- If the input is an update-type expression such as **"更新 XX wiki"** (update the XX wiki),
  **"往 XX wiki 加内容"** (add content to the XX wiki) → skip `question` and go directly to Path B.

When creation is determined, use the `question` tool to confirm the use case with the user:

```
请问想要什么方式创建 wiki？
  A. 从零新建一个 wiki
  B. 往已有 wiki 添加内容
```

---

#### Path A: Build from scratch

Determine whether the user's input already contains a path or link:
- If the input contains a **local path** (e.g. `D:\xxx`, `/home/xxx`) → treat it as a local
  project repository and prompt "根据本地路径 `<path>` 创建 wiki" (creating wiki from local path `<path>`).
- If the input contains an **online repository link** (e.g. `https://github.com/...`) → treat
  it as an online project repository and prompt "根据在线仓库 `<url>` 创建 wiki"
  (creating wiki from online repo `<url>`).
- If the input contains neither a path nor a link → ask:

```
请问是为哪种内容创建 wiki？
  A. 本地项目仓库
  B. 在线项目仓库
```

After selection, directly output a text prompt asking the user for the corresponding information
(do NOT call the question tool):
- **本地项目仓库** (Local project repository) selected → output "请提供本地项目目录路径"
  (Please provide the local project directory path).
- **在线项目仓库** (Online project repository) selected → output "请提供在线仓库链接"
  (Please provide the online repository link).

Once the user provides the path, continue asking:

```
请问创建 wiki 的目的是？
  A. 通用知识库 — 想通过概览式知识库快速掌握项目定位、领域概念和核心流程
  B. 工程架构导航 — 想深入梳理代码仓库的模块、组件、依赖、流程和设计决策
  C. 方便检索 — 已熟悉项目，需要快速检索 API、配置等细节为开发提供支撑
  D. 创建桌面应用型个人知识库 — 偏好使用桌面应用而非纯命令行/skill 流程
```

Based on the content type and purpose, consult the **[Path A solution mapping](#path-a-solution-mapping)**
below to identify the corresponding solution, then execute according to that solution's guidance.

---

#### Path A solution mapping

| Content type | Purpose | Wiki solution |
|--------------|---------|---------------|
| Local project repo | General knowledge base | Solution Two |
| Local project repo | Engineering architecture navigation | Solution Five |
| Local project repo | Easy retrieval | Solution One |
| Local project repo | Create a desktop-application-style personal knowledge base | Solution Four |
| Online project repo | Understand the project | Solution Three |
| Online project repo | Engineering architecture navigation | Solution Five |

#### Path B: Add content to an existing wiki

1. Output "请提供已有 wiki 目录" (Please provide the existing wiki directory) and record the
   wiki directory entered by the user.
2. Detect which solution produced this wiki (by inspecting directory-structure signatures)
   to determine the Wiki solution in use.
3. If the detected solution does not support online links, prompt the user to provide a local
   repository directory; otherwise, online links are acceptable.
4. Output "请提供更新后仓库的本地目录或在线链接"
   (Please provide the local directory or online link of the updated repository).
5. Run the update using the detected solution.

---

## Wiki solutions

Each solution has its own rules, directory layout, and steps.

### Solution One

Directly invokes the local graphify solution:

- Solution path: `graphify` (relative to this skill directory)

### Solution Two

Directly invokes the local llm-wiki2 solution:

- Solution path: `llm-wiki2` (relative to this skill directory)

### Solution Three

Directly invokes the local sdyckjq-lab_llm-wiki-skill solution:

- Solution path: `sdyckjq-lab_llm-wiki-skill` (relative to this skill directory)

### Solution Four

Directly invokes the local llm-wiki-desktop solution:

- Solution path: `llm-wiki-desktop` (relative to this skill directory)

### Solution Five

Directly invokes the local claude-obsidian solution:

- Solution path: `claude-obsidian` (relative to this skill directory)
- Intended use: initially understand the architecture, modules, components, dependencies, workflows, and design decisions of an engineering repository.
- By default, use only Python standard-library scripts that run across CLIs; do not assume dependencies on the Claude Code plugin, Obsidian CLI, MCP, Bash, or `.vault-meta`.

### Solution output signatures (for Path B detection)

| Solution | Output signature | Detection method |
|----------|------------------|-------------------|
| Solution One (graphify) | Output dir is `graphify-out/`, containing `graph.json`, `graph.html`, `GRAPH_REPORT.md` | Check whether `graphify-out/graph.json` exists under the wiki directory |
| Solution Two (llm-wiki2) | Output dir contains `wiki/index.md`, `wiki/concepts/`, `wiki/entities/`, `log/` | Check whether `wiki/index.md` exists under the wiki directory |
| Solution Three (sdyckjq-lab_llm-wiki-skill) | Output dir contains `index.md`, `raw/`, `wiki/`, `log.md` | Check whether `index.md` exists under the wiki directory |
| Solution Four（llm-wiki-desktop） | Output dir contains `.llm-wiki/`、`.obsidian/`、`raw/`、`wiki/`、`purpose.md`、`schema.md` | Check whether `purpose.md` and `schema.md` exists under the wiki directory |
| Solution Five (claude-obsidian) | Output dir contains `CLAUDE.md`, `.raw/.manifest.json`, `wiki/index.md`, `wiki/hot.md`, `wiki/overview.md`, `wiki/modules/`, or `wiki/flows/` | Prefer checking whether `CLAUDE.md`, `wiki/index.md`, and `wiki/hot.md` all exist |


<!-- ### `query` — Q&A against the Wiki

A natural-language question → scan the main index → read the relevant pages →
synthesize an answer using `[[Page Name]]` references → save to the answers directory.

## Usage flow

```
1. [User] "给这个项目建个 wiki"
2. [AI]   Run `build` → confirm scenario → match a Wiki solution → generate wiki pages
3. [User] "帮我查下这个模块的 API"
4. [AI]   Run `query` → search the wiki, return an answer grounded in the content
```


## Session start

At the start of each session, read the config file and main index (if any) to
understand the Wiki's current state.
The operation log records a timestamp and summary for each operation.

## Directory structure (reference)

The following is the default directory layout; in specific scenarios it may be
adjusted according to the Wiki solution:

```
<wiki-root>/
├── wiki.config.json        ← name, scope, page list, conventions
├── sources/                ← original content (read-only, AI never modifies)
│   ├── manual/             ← text pasted by the user or notes entered
│   ├── files/              ← imported documents (md, txt, pdf, code)
│   └── web/                ← scraped web content
├── pages/                  ← generated Wiki pages (AI writes, user reads)
│   ├── concepts/           ← topic/concept pages
│   ├── entities/           ← people, tools, papers, organizations
│   └── index.md            ← main page catalog
├── answers/                ← archived Q&A results
└── journal.md              ← operation history log
```
-->
