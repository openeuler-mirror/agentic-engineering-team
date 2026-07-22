---
name: llm-wiki-skill
description: >-
  Rule spec for the sdyckjq-lab/llm-wiki-skill project. Based on Andrej Karpathy's
  llm-wiki methodology, it builds a personal-knowledge-base monorepo in two
  forms — Skill and Workbench — and supports multi-platform installation and
  deployment.
---

# llm-wiki-skill — Personal Knowledge Base System

> Turn fragmented information into a continuously growing, interlinked knowledge base.

## Project overview

GitHub: <https://github.com/sdyckjq-lab/llm-wiki-skill>

Based on [Andrej Karpathy](https://karpathy.ai/)'s
[llm-wiki methodology](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f),
a knowledge-base solution better suited to users in China. The same knowledge-base format is
supported across multiple AI platform entry points.

## Two entry forms

| Form | Status | Description |
|------|--------|--------------|
| **Skill** | Mature & stable | Drop the repo link into an AI CLI to install in one click; maintain the knowledge base from your terminal |
| **Workbench** (`workbench/`) | In development | A locally-run knowledge-base workbench with a built-in interactive digital-landscape knowledge graph |

The interactive graph engine is shared via `packages/graph-engine/`.

## Supported platforms

| Platform | Install command | Install location |
|----------|-----------------|------------------|
| Claude Code | `bash install.sh --platform claude` | `~/.claude/skills/llm-wiki` |
| Codex | `bash install.sh --platform codex` | `~/.codex/skills/llm-wiki` |
| OpenClaw | `bash install.sh --platform openclaw` | `~/.openclaw/skills/llm-wiki` |
| Hermes | `bash install.sh --platform hermes` | `~/.hermes/skills/llm-wiki` |

## Environment requirements

- **Core**: the agent can run shell commands and read/write local files
- **Graph build & signal-coverage check**: `jq` + `node`
- **Optional extractors**: WeChat Official Accounts need `uv`; web pages need `bun` or `npm`;
  logged-in content needs Chrome 9222

Optional extractors must be explicitly enabled at install time:

```bash
bash install.sh --platform claude --with-optional-adapters
```

Check whether sdyckjq-lab/llm-wiki-skill is already installed; if not, complete the
installation first.

## Knowledge-base directory structure

```
your-knowledge-base/
├── raw/                        # raw materials (immutable)
│   ├── articles/               # web articles
│   ├── tweets/                 # X/Twitter
│   ├── wechat/                 # WeChat Official Accounts
│   ├── xiaohongshu/            # Xiaohongshu (RED)
│   ├── zhihu/                  # Zhihu
│   ├── pdfs/                   # PDFs
│   ├── notes/                  # notes
│   └── assets/                 # images and other attachments
├── wiki/                       # AI-generated knowledge base
│   ├── entities/               # entity pages (people, concepts, tools)
│   ├── topics/                 # topic pages
│   ├── sources/                # material summaries
│   ├── comparisons/            # comparison analyses
│   ├── synthesis/              # synthesis analyses
│   │   └── sessions/           # conversation crystallization pages
│   └── queries/                # saved query results
├── purpose.md                  # research direction (the # title is generated from the name field of .wiki-schema.md)
├── index.md                    # index
├── log.md                      # operation log
├── .wiki-schema.md             # config
└── .wiki-cache.json            # material dedup cache
```

## Config: `.wiki-schema.md`

A config file recording the knowledge base's language, name, alias table, etc. The language
field determines the output language (Chinese / English).

## Research direction: `purpose.md`

Records research goals, key questions, and scope, guiding subsequent entity/topic selection and
weighting during ingest.

The `#` H1 title of `purpose.md` is **generated from `.wiki-schema.md`** as follows:

- Take the `name` field of `.wiki-schema.md` as the title (e.g.
  `name: Personal Knowledge Base Wiki` → `# Personal Knowledge Base Wiki`)
- If the `name` field is missing, take the first `topics` entry as the title
- Research goals and key questions are expanded automatically from the `topics` list

This `#` title is extracted by `build-graph-data.sh` as the display title of the knowledge
graph, so it must not be hardcoded as "Research direction and goals".

## Material sources

| Category | Source | Handling |
|-----------|--------|----------|
| Core | PDF, Markdown, text, HTML, plain-text paste | Digest directly |
| Optional | Web articles, X/Twitter, WeChat Official Accounts, YouTube, Zhihu | Auto-extract; on failure, follow the fallback hint to manual |
| Manual | Xiaohongshu (RED) | Currently only manual paste is supported |

## Workflow overview

| User intent | Workflow |
|-------------|----------|
| "初始化知识库"、"新建 wiki" | **init** |
| URL / 文件路径 / "消化" / "整理" | **ingest** |
| 文件夹路径 / "批量消化" | **batch-ingest** |
| "关于 XX"、"查询" | **query** |
| "深度分析"、"综述"、"digest" | **digest** |
| "对比/比较/时间线" | **digest** (specified format) |
| "健康检查"/"lint" | **lint** |
| "知识库状态" | **status** |
| "画个知识图谱"/"graph" | **graph** |
| "删除素材"/"remove" | **delete** |
| "结晶化"/"crystallize" | **crystallize** |

## Post-digest mandatory requirements

After **every** `ingest` / `digest` / `batch-ingest`, the following must be executed in order,
**none may be omitted**. These two steps are the **last step** of their respective workflows,
embedded in the workflow itself rather than in a separate section:

1. **Build the knowledge graph**: immediately run the `graph` workflow (generating
   `wiki/knowledge-graph.md`, `wiki/graph-data.json`, `wiki/knowledge-graph.html`) to keep the
   graph in sync with the latest content. After generation, you **must** verify and fix it
   item-by-item against the "Garbled-text checklist".
2. **Output a digest checklist directly**: at the end of the reply, output a fixed format of
   Markdown table + list. **Omitting or simplifying is forbidden.** Template:

   ```
   ## 消化清单

   **原始素材**（`raw/xxx/`）：
   - `file path 1` — short description
   - `file path 2` — short description

   **新增 Wiki 页面**：

   | 分类 | 页面 |
   |------|------|
   | sources | `xxx.md`, `xxx.md` |
   | entities | `xxx.md`, `xxx.md` |
   | topics | `xxx.md`, `xxx.md` |

   **知识图谱**：
   - 节点：N
   - 边：M
   - 交互式图谱：`wiki/knowledge-graph.html`（路径，不可省略）
   ```

   Note: **Aside from the digest checklist at the end of the reply, similar content must not
   be repeated elsewhere.** Even if step 1's graph build fails, the digest checklist must still
   be output as usual (mark the graph field as "构建失败").

## Common pre-check

Except for `init`, other workflows first check:

1. Whether the current working directory contains `.wiki-schema.md` → use the current
   directory as the knowledge-base root path
2. Otherwise read `~/.llm-wiki-path`
3. If neither exists → `ingest`/`batch-ingest` runs `init` first; others prompt the user to
   initialize first
4. Read the "language" field of `.wiki-schema.md` to determine `WIKI_LANG` (zh/en)

## Core workflows

### init — Initialize the knowledge base

1. Ask for the topic, language (zh/en), and save location.
2. Run the llm-wiki skill's `scripts/init-wiki.sh "<path>" "<topic>"`.
   - The script is located in the installed llm-wiki skill directory
     (`~/.claude/skills/llm-wiki/scripts/init-wiki.sh`), **not the current directory**.
   - On Windows, run via Git Bash:
     `bash -c "cd '<LLM_WIKI_SKILL_DIR>' && bash scripts/init-wiki.sh '<WIKI_ROOT>' '<TOPIC>'"`.
3. Language localization: if `en`, overwrite the seed files with English versions; if `zh`,
   ensure all generated seed files (`index.md`, `purpose.md`, etc.) are saved as
   **UTF-8 without BOM**.
4. **Generate `.wiki-schema.md`**: write `name` (knowledge-base name), `topics` (topic list),
   `language`, and other core fields.
5. **Generate `purpose.md`**: use the `name` field of `.wiki-schema.md` as the `#` H1 title,
   and expand research goals and key questions from the `topics` list.
6. Record the path to `~/.llm-wiki-path`.

### ingest — Digest materials

The most central workflow. Split into full processing (>1000 words) and simplified processing
(<=1000 words); rules originate from the llm-wiki skill's `SKILL.md`.

1. **Privacy self-check**: the first ingest must prompt the user to check for sensitive info.
2. **Material-extraction routing**: URL/file/plaintext → source-registry match →
   adapter-state check → extract (when passing in code files, they can also be added to the
   knowledge base).
3. **Cache check**: `cache.sh check`; skip processing on a hit.
4. **Two-step organization**:
   - Step 1: structured analysis (JSON output of `entities`/`topics`/`connections`, with
     confidence labels).
   - Step 2: page generation (source/entity/topic + index/log update). All `.md` / `.json` /
     `.html` files **must** be written in UTF-8; under PowerShell use
     `[System.IO.File]::WriteAllText(path, content, [Text.Encoding]::UTF8)` or
     `Out-File -Encoding UTF8`.
   - **The source page must end with `[[bidirectional links]]`** referencing the related
     entity/topic pages that the material touches, otherwise the graph will produce orphan
     nodes that cannot be assigned to a community.
   - **Entity / topic pages must also include `[[bidirectional links]]`** referencing other
     related pages, ensuring a connected graph among entities, topics, and sources; orphan
     entity/topic pages likewise cause community fragmentation.
   - Fault tolerance: if Step 1 is not valid JSON, automatically fall back to a single-step flow.
5. **Confidence labels**: EXTRACTED / INFERRED / AMBIGUOUS / UNVERIFIED.
6. **Build the knowledge graph**: run the `graph` workflow to keep the graph in sync.
7. **Output the digest checklist**: **must** output the checklist at the end of the reply in
   the fixed format from item 2 of "Post-digest mandatory requirements"; **do not omit it**.

### query — Query the knowledge base

1. Read `index.md`.
2. **Alias expansion**: expand synonyms per the alias table in `.wiki-schema.md`.
3. Search the relevant pages under `wiki/`, reading 3–5.
4. Synthesize an answer, citing sources with `[[page name]]`.
5. When 3+ sources are cited, suggest persisting to `wiki/queries/`.

### digest — Deep synthesis report

Cross-material deep synthesis; generates a persisted report. After completion you **must**
output the digest checklist per item 2 of "Post-digest mandatory requirements". Three formats:

- **Deep report**: default format, organized by viewpoints/perspectives/threads.
- **Comparison table**: triggered by "对比/比较"; multi-dimensional comparison table.
- **Timeline**: triggered by "时间线/按时间"; Mermaid gantt or plain text.

### batch-ingest — Batch digest

Runs ingest on multiple materials in a folder. Differences from single-file ingest:

1. **Material discovery**: recursively scan the specified directory for all `.md`, `.txt`,
   `.pdf`, `.py`, `.sh`, etc. files.
2. **Batch processing**: for each file, run ingest's Step 1 structured analysis in turn.
3. **Merged output**: Step 2 centrally generates all source/entity/topic pages + updates
   index/log.
4. **Graph build**: after all files are processed, run the `graph` workflow once to generate
   the complete graph.
5. **Digest checklist**: output the fixed format at the end of the reply, including a summary
   of all new materials and pages.

> To avoid exceeding the context limit with too many materials, it is recommended that a
> single batch ingest no more than 20 files.

### lint — Health check

1. Script check: `scripts/lint-runner.sh` (orphan pages / broken links / index consistency).
2. AI check: contradictory info / missing cross-references / confidence report.
3. Output a report and ask the user which ones to auto-fix.

### graph — Knowledge graph

> **Prerequisite**: `build-graph-data.sh` / `build-graph-html.sh` come from the installed
> llm-wiki skill (`~/.claude/skills/llm-wiki/scripts/`); **do not hand-write a replacement
> HTML**.
> If not installed, first run `bash install.sh --platform claude` to install the llm-wiki skill.

1. Scan `wiki/` for `[[bidirectional links]]`.
2. Generate the Mermaid diagram `wiki/knowledge-graph.md`.
3. Generate the interactive graph data `wiki/graph-data.json`:
   `bash scripts/build-graph-data.sh <wiki_root>`.
   - `build-graph-data.sh` automatically extracts `wiki_title` from the first `#` title in
     `purpose.md`, so the graph title's provenance chain is:
     `.wiki-schema.md` → `purpose.md` → `graph-data.json.meta.wiki_title` → HTML title.
   - **Forbidden** to hardcode `wiki_title` or hand-write `graph-data.json`; doing so makes
     the graph title inconsistent with the knowledge-base name.
4. Generate the digital-landscape interactive HTML `wiki/knowledge-graph.html`:
   `bash scripts/build-graph-html.sh <wiki_root>`.
   - **Forbidden** to hand-write a simple D3/Canvas replacement; the wash template script must
     be used for the full digital-landscape interactive experience.
5. Read insights and display graph observations.

> **Windows compatibility**: `${BASH_SOURCE[0]%/*}` in
> `build-graph-data.sh` / `build-graph-html.sh` / `validate-step1.sh` does not match
> backslash paths (`C:\...`) under Git Bash, causing `SCRIPT_DIR` to resolve to the current
> working directory rather than the script's directory, so `source shared-config.sh` and
> similar includes fail.
> The fix already applied in the llm-wiki install directory replaces
> `${BASH_SOURCE[0]%/*}` with `"$(dirname "${BASH_SOURCE[0]}")"`.
> If scripts fail again after reinstalling, re-apply this fix.
>
> **Windows compatibility (E2BIG fix)**: `build-graph-data.sh` uses
> `jq --argjson nodes "$(cat ...)"` in several places to pass large JSON as a command-line
> argument. Under Windows Git Bash, when the JSON is large (node/edge lists with Chinese
> labels), this triggers `Argument list too long` (E2BIG, exit code 126), even if the jq path
> itself is short. **Two** spots need fixing:
>
> **Fix point 1** (around line 308–329, computing `INITIAL_VIEW`):
>
> ```bash
> # Before fix (E2BIG):
> INITIAL_VIEW=$(jq \
>   --argjson nodes "$(cat "$TMPDIR/nodes.sorted.json")" \
>   '... | ($nodes | group_by(...)) ...' \
>   "$TMPDIR/edges.sorted.json")
>
> # After fix (read from file; $nodes → $nodes[0]):
> INITIAL_VIEW=$(jq \
>   --slurpfile nodes "$TMPDIR/nodes.sorted.json" \
>   '... | ($nodes[0] | group_by(...)) ...' \
>   "$TMPDIR/edges.sorted.json")
> ```
>
> **Fix point 2** (around line 336–365, final merge of `graph-data.json`):
>
> ```bash
> # Before fix (E2BIG):
> jq -n \
>   --argjson nodes "$(cat "$TMPDIR/nodes.sorted.json")" \
>   --argjson edges "$(cat "$TMPDIR/edges.sorted.json")" \
>   --argjson insights "$(jq '.insights' "$ANALYSIS_JSON")" \
>   --argjson learning "$(jq '.learning' "$ANALYSIS_JSON")" \
>   '{ ... nodes: $nodes, edges: $edges, ... }'
>
> # After fix (read from files, avoid argv overflow):
> jq '.insights' "$ANALYSIS_JSON" > "$TMPDIR/insights.json"
> jq '.learning' "$ANALYSIS_JSON" > "$TMPDIR/learning.json"
> jq -n \
>   --slurpfile nodes "$TMPDIR/nodes.sorted.json" \
>   --slurpfile edges "$TMPDIR/edges.sorted.json" \
>   --slurpfile insights "$TMPDIR/insights.json" \
>   --slurpfile learning "$TMPDIR/learning.json" \
>   '{ ... nodes: ($nodes[0] // []), edges: ($edges[0] // []),
>     insights: ($insights[0] // {}), learning: ($learning[0] // {}) ... }'
> ```
>
> Fix note: `--slurpfile` reads the file contents as a single-element array, so the jq program
> must unwrap with `$name[0]`.
> If the llm-wiki skill's scripts report E2BIG again after reinstalling, re-apply this fix.
>
> **Windows pre-check**: before running scripts, confirm Git Bash is installed. Common install
> paths:
>
> - `C:\Program Files\Git\usr\bin\bash.exe`
> - `C:\Program Files\Git\bin\bash.exe`
>
> PowerShell detection:
>
> ```powershell
> $gitBash = Get-ChildItem "C:\Program Files\Git\usr\bin\bash.exe", "C:\Program Files\Git\bin\bash.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
> if (-not $gitBash) { throw "Git Bash is not installed; please install Git for Windows first" }
> ```
>
> **Windows path conversion**: Git Bash uses forward-slash paths; Windows paths must be
> converted:
>
> | Windows path | Git Bash path |
> |---|---|
> | `C:\Users\xxx` | `/c/Users/xxx` |
> | `D:\data` | `/d/data` |
> | `~\.claude\skills\llm-wiki` | `~/.claude/skills/llm-wiki` (`~` auto-expands to `/c/Users/xxx`) |
>
> **Windows execution**: under PowerShell, invoke scripts via Git Bash; note `cd` into the
> llm-wiki install directory before running:
>
> ```powershell
> $gitBash = "C:\Program Files\Git\usr\bin\bash.exe"
> $env:Path = "C:\Program Files\Git\usr\bin;$env:Path"
> # Git Bash absolute path of LLM_WIKI_SKILL_DIR, e.g. /c/Users/xxx/.claude/skills/llm-wiki
> $LLM_WIKI_SKILL_DIR = "/c/Users/$env:USERNAME/.claude/skills/llm-wiki"
> $WIKI_ROOT = "d:/wiki/my-test-wiki"
>
> & $gitBash -c "cd '$LLM_WIKI_SKILL_DIR' && bash scripts/build-graph-data.sh '$WIKI_ROOT'"
> & $gitBash -c "cd '$LLM_WIKI_SKILL_DIR' && bash scripts/build-graph-html.sh '$WIKI_ROOT'"
> ```

### delete — Delete materials

1. Identify the target material.
2. `scripts/delete-helper.sh scan-refs` scans the impact scope.
3. Cascade-clean raw/source/entity/topic + index/log + cache.

### crystallize — Conversation crystallization

The user actively provides content → extract core insights/decisions/conclusions → save to
`wiki/synthesis/sessions/`.

## Garbled-text checklist

After **all** knowledge-graph files containing Chinese (`knowledge-graph.html`,
`graph-data.json`, `knowledge-graph.md`) are generated or updated, verify as follows:

1. **Encoding confirmation**: read all bytes of the file with UTF-8 encoding; do not rely on
   the system default encoding.
   - PowerShell: `Get-Content <path> -Raw -Encoding UTF8`
   - Bash: `cat <path>` (valid on Linux/macOS with a UTF-8 locale; Git Bash needs
     `LANG=zh_CN.UTF-8` confirmed)
2. **Key-string scan**: for each file, check whether the following strings exist (pick at least
   2 Chinese-containing words, e.g. "数据并行" / "data parallel", "分布式" / "distributed"):
   - PowerShell verify: `.Contains("数据并行")` returning `$true` passes
   - Bash verify: `grep -c "数据并行"` returning greater than 0 passes
3. **Placeholder-residue check**: confirm the file does **not** contain template placeholders
   like `__WIKI_TITLE__`, `__NODE_COUNT__`, `__EDGE_COUNT__`, `__BUILD_DATE__`. If present,
   the HTML-splicing step failed to substitute them correctly.
4. **Graph-structure integrity**: `graph-data.json` must be valid JSON (`jq .` parses); the
   `<script id="graph-data">` inline JSON in `knowledge-graph.html` must start with `{`.

**If garbled text is found, troubleshoot by root cause**:

| Symptom | Root cause | Fix |
|---------|-----------|-----|
| Chinese in HTML/JSON shows as `鏁版嵁` etc. | PowerShell read the UTF-8 file with its default encoding (CP936/GBK) | Add `-Encoding UTF8` to all `Get-Content` / `Set-Content` / `[System.IO.File]::ReadAllBytes` operations; write with `[System.IO.File]::WriteAllText(path, content, [System.Text.Encoding]::UTF8)` |
| Chinese in HTML is fine but the page is blank / script errors | The inline JSON's `</script>` was not escaped | Run `.Replace("</script>", "<\/script>")` before inlining the JSON |
| Chinese in the Mermaid diagram shows as boxes | The SVG rendering font does not support Chinese | Specify `fontFamily: "Noto Sans SC, Microsoft YaHei, sans-serif"` in the Mermaid config |
| Bash script output is garbled | Git Bash terminal encoding does not match the file encoding | Set `export LANG=zh_CN.UTF-8` at the top of the script; ensure the `.sh` file itself is saved as UTF-8 without BOM |

> **Windows PowerShell encoding iron rule**: for any file read/write involving Chinese, you
> **must** add the `-Encoding UTF8` parameter.
> Without `-Encoding UTF8`, `Get-Content` uses the system ANSI encoding (CP936/GBK on Chinese
> Windows), which corrupts Chinese characters in UTF-8 files. This issue does not affect
> Linux/macOS.

## References

- `SKILL.md` — core capability description and detailed workflow definitions
- `platforms/claude/CLAUDE.md` — Claude Code entry description
- `platforms/codex/AGENTS.md` — Codex entry description
- `platforms/openclaw/README.md` — OpenClaw entry description
- `platforms/hermes/README.md` — Hermes entry description
- `scripts/` — script tools for each workflow
- `templates/` — page templates
- `install.sh` — multi-platform automated install script
- `install.ps1` — Windows PowerShell install script (recommended)
