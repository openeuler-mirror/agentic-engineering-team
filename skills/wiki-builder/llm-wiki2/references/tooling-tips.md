# Tooling Tips

Practical setup and usage notes for the LLM Wiki tech stack.

## Obsidian — viewing the Wiki graph

Once the Wiki is built, open the wiki root directory in Obsidian as a vault to view the graph:

1. Download and install Obsidian from [obsidian.md](https://obsidian.md).
2. Open Obsidian → "Open folder as vault" → select the wiki root directory.
3. Press `Ctrl+G` to open the graph view.

The graph view is the best way to see the wiki's structure:
- Dense central nodes = well-connected concept pages.
- Isolated nodes = orphan pages (need inbound links or deletion). The self-validation flow
  flags these.
- Clusters = sub-topics worth a dedicated folder split under `wiki/concepts/`.

## Obsidian Web Clipper usage

1. Install from [obsidian.md/clipper](https://obsidian.md/clipper).
2. Configure a template to save into `raw/articles/`.
3. Clip an article → press the download-images shortcut → the file is ready for ingest.

For complex pages (paywalls, dynamic content): manually copy-paste the main text and save it as
`raw/articles/<slug>.md`.

## qmd (optional, for large wikis)

[qmd](https://github.com/tobi/qmd) is a local semantic search engine for Markdown files that
supports BM25 + vector hybrid search. Useful when the wiki grows past ~100 pages and
`wiki/index.md` scanning slows down.

```bash
pip install qmd
qmd collection add wiki/ --name my-wiki
qmd embed
qmd query "what are the tradeoffs of RAG vs wiki" --collection my-wiki
```

qmd also has an MCP server, so the LLM can use it as a native tool.

## Marp — generating slides from wiki content

```markdown
---
marp: true
theme: default
---

# Slide title

Content here

---

# Next slide
```

Install the Marp plugin in Obsidian to preview/export directly.

## Generating charts

For quantitative analysis, have the LLM generate a matplotlib script and save it under
`outputs/charts/`:

```python
# outputs/charts/my-analysis.py
import matplotlib.pyplot as plt
# ... chart code ...
plt.savefig('outputs/charts/my-analysis.png')
```

Embed in a wiki article: `![[my-analysis.png]]`.

## Git workflow

The wiki is a git repository. Benefits:
- Every article has version history.
- Branches for experimental research directions.
- Review files are tracked, so "who proposed what, when" is a first-class citizen.

```bash
git add .
git commit -m "ingest: 3 papers on attention mechanisms"
git push
```

Keep large files out of `.gitignore` (PDFs larger than 10 MB, full-resolution raw images,
videos, model weights). Use the raw-file policy: pointer files in `raw/refs/` rather than copies.

## Interactive HTML output

For complex analysis, the LLM can generate interactive HTML containing JavaScript and save it
under `outputs/`. These files can be opened in a browser or embedded in Obsidian via the HTML
plugin.
