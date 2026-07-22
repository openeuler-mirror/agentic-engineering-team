---
name: graphify
description: >-
  Solution One: build a retrieval-friendly Wiki from a local project repository.
  Uses graphify to turn project source code and documentation into a knowledge
  graph, supporting interactive graph browsing and natural-language queries,
  which can drastically reduce token consumption compared to reading raw files
  directly.
---

# Local Project Wiki — Solution One (graphify)

> Build a retrieval-friendly Wiki from a local project repository. Suited for
> developers who are already familiar with the project and need to quickly look
> up details such as APIs and configuration.

## Environment requirements

- **Python 3.10+** (graphify strictly requires Python 3.10 or above; it cannot be installed otherwise)
- **pip** (the Python package manager)

Before running, check that the Python version and pip are available:

- If Python 3.10+ and pip are already available → proceed directly to the install step
- If Python is older than 3.10 → install Python 3.10+ for the user (using whatever the
  current platform supports, e.g. winget, the official installer, or a package manager),
  then continue once installation completes
- If pip is missing → install pip for the user

If automatic installation is not possible (e.g. unsupported platform or installation failure),
inform the user that they must complete the environment requirements on their own before using it.

## Install graphify

Check whether graphify is already installed:

```bash
python -c "import graphify" 2>&1
```

- If the import succeeds → skip installation and proceed to the next steps
- If the import fails → run the installation:

  ```bash
  pip install graphifyy && graphify install
  ```

  > The PyPI package is currently named `graphifyy`; both the CLI command and the skill
  > command remain `graphify`.

  Run the install command for the current AI coding-assistant platform:
  - **OpenCode**: `graphify install --platform opencode`
  - Other platforms: `graphify install --platform <platform>`
    (platform options: `codebuddy`, `codex`, `claw`, `droid`, `trae`, `trae-cn`)

Install the persistent assistant rule so the assistant reads the graph before answering
architecture questions (recommended):
- **OpenCode**: `graphify opencode install`
- This command writes a rule into `AGENTS.md` at the project root, instructing the assistant
  to read `GRAPH_REPORT.md` in the output directory before answering architecture questions.

---

## Build from scratch

1. Use the local project path provided by the user as the target directory.
2. Ask the user where to create the `graphify-out/` output directory
   (default: under the project directory). Record the choice once confirmed.
3. Detect files and decide the processing approach:
    - Use `graphify.detect.detect()` to scan the project and determine whether there are
      documentation files (`.md`, `.txt`, `.pdf`, etc.).
    - Check whether a usable LLM API key is available in the environment
      (`DEEPSEEK_API_KEY`, `GEMINI_API_KEY`, etc.).
    - Select a semantic-extraction approach based on the result:

   **With an API key:**
   One command does both AST + semantic:
   ```bash
   graphify extract <project path> --output <output dir> --backend <backend>
   ```
   Backend options: `deepseek`, `gemini`, etc.

   **Without an API key:**
   Two parallel paths: AST extraction + sub-agent semantic extraction
   1. **AST extraction**: extract structure from all code and config files
      ```python
      python -c "
      import json; from graphify.extract import collect_files, extract; from pathlib import Path
      result = extract(collect_files(Path('project path')), cache_root=Path('project path'))
      Path('project path/graphify-out/.graphify_ast.json').write_text(json.dumps(result, ensure_ascii=False))
      print(f'AST: {len(result[\"nodes\"])} nodes, {len(result[\"edges\"])} edges')
      "
      ```
   2. **Semantic extraction (sub-agent)**: extract semantic nodes/edges from all files
      (docs + code + config), including:
      - Document content understanding (concepts, relationships)
      - Config-file field values (e.g. `main` → `"dist/index.js"`), linked to the key node
        with `relation: "value"`
      - Code comments and module intent

      Split into chunks by file type; dispatch one sub-agent per chunk (task tool),
      outputting `graphify-out/.graphify_chunk_NN.json`.
   3. Merge all chunks + AST into `graph.json`, deduplicate, and write it out.
   4. Run cluster-only to generate the report and visualization:
      ```bash
      graphify cluster-only <project path> --no-label
      ```

4. After the build completes, the output directory contains:
   - `graph.html` — interactive knowledge graph
   - `GRAPH_REPORT.md` — graph summary (God nodes, unexpected connections, suggested questions)
   - `graph.json` — persisted graph data
   - `cache/` — SHA256 cache; on re-runs only changed files are processed
5. Tell the user they can open `graph.html` in the output directory to view the graph visualization.
6. Generate a brief project overview (200–400 words) based on the graph so the user can quickly
   grasp the project as a whole. Show it directly to the user.
7. Tell the user they can start asking questions; jump to Retrieval and Query.

---

## Incremental update

1. From the existing wiki directory provided by the user, determine the output directory
   location (i.e. the `graphify-out/` under that directory).
2. The user provides the local directory of the updated source repository.
3. Decide the processing approach (same as build-from-scratch, branching on whether an API key
   is available):

   **With an API key:**
   ```bash
   graphify <source repo dir> --update --output <wiki dir>
   ```

   **Without an API key:**
   1. Use the Python API to detect changed code/config files and do incremental AST extraction:
      ```python
      python -c "
      import json; from graphify.extract import collect_files, extract; from pathlib import Path
      result = extract(collect_files(Path('source repo dir')), cache_root=Path('source repo dir'))
      Path('wiki dir/graphify-out/.graphify_ast.json').write_text(json.dumps(result, ensure_ascii=False))
      "
      ```
   2. Compare the new and old file lists, find new/changed files, and dispatch sub-agents to
      re-extract semantics (covering all file types: docs, code, config, etc.).
   3. Merge old and new AST + the new semantic data into `graph.json`.
   4. Run cluster-only to re-cluster:
      ```bash
      graphify cluster-only <source repo dir> --no-label
      ```
4. Show the user the update result (new/changed files, node-count changes, etc.).
5. Tell the user they can start querying; jump to Retrieval and Query.

---

## Retrieval and Query

Once the graph is built, the user can simply ask questions and the AI will automatically call
the graphify command for retrieval:

1. **Persistent assistant uses the graph automatically**: after the persistent rule is installed,
   when answering project-related questions the assistant first reads `GRAPH_REPORT.md` and
   navigates by structure rather than keyword search.

2. **Natural-language query**: when the user asks a question, automatically call
   `graphify query "<user question>"` to answer based on the graph. If the graph has no
   relevant content, tell the user directly that the graph does not contain this; do NOT have
   the LLM answer on its own.

3. **Path tracing**: when you need to trace the relationship between two nodes, automatically
   call `graphify path "<node A>" "<node B>"`.

4. **Node explanation**: when you need to explain a concept, automatically call
   `graphify explain "<node name>"`.
