#!/usr/bin/env python3
"""Lint a claude-obsidian-style OpenCode wiki vault.

Usage:
    python lint_wiki.py <vault-root> [--write-report]
"""
from __future__ import annotations

import argparse, json, re
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import cast

WIKILINK_RE = re.compile(r"\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]")
FRONTMATTER_RE = re.compile(r"^---\s*\n.*?\n---\s*\n", re.DOTALL)
CONTRADICTION_RE = re.compile(r"^>\s*\[!contradiction\]", re.I | re.M)
EXEMPT = {"index.md", "hot.md", "log.md"}
BOILERPLATE = {"", "*(none yet)*", "unknown until first ingest.", "this page is a seed. ingest the repository readme, docs, dependency files, and entrypoints to replace this with a source-backed overview."}

@dataclass
class Issue:
    code: str
    severity: str
    path: str
    message: str
    def as_json(self) -> dict[str, str]:
        return {"code": self.code, "severity": self.severity, "path": self.path, "message": self.message}

def rel(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()

def read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")

def add(issues: list[Issue], code: str, path: Path | str, root: Path, message: str, severity: str = "error") -> None:
    issues.append(Issue(code, severity, path if isinstance(path, str) else rel(path, root), message))

def wiki_files(wiki: Path) -> list[Path]:
    return sorted(p for p in wiki.rglob("*.md") if p.is_file()) if wiki.exists() else []

def keys(path: Path, wiki: Path) -> set[str]:
    r = path.relative_to(wiki).with_suffix("").as_posix()
    return {r, path.stem}

def norm(link: str) -> str:
    return link.strip().replace("\\", "/").removesuffix(".md")

def body_has_content(text: str) -> bool:
    body = FRONTMATTER_RE.sub("", text, count=1)
    for line in body.splitlines():
        s = line.strip()
        if s.startswith("#") or s.lower() in BOILERPLATE:
            continue
        return True
    return False

def index_mentions(index_text: str, path: Path, wiki: Path) -> bool:
    text = index_text.replace("\\", "/")
    r = path.relative_to(wiki).with_suffix("").as_posix()
    return f"[[{r}" in text or f"[[{path.stem}" in text or r in text or path.relative_to(wiki).as_posix() in text

def extract_sources(fm_text: str) -> list[str]:
    """Extract source paths from frontmatter text."""
    sources: list[str] = []
    block = re.findall(r'^sources:\s*\n((?:\s+-\s+.*\n)+)', fm_text, re.MULTILINE)
    if block:
        sources = re.findall(r'^\s+-\s+["\']?(.*?)["\']?\s*$', block[0], re.MULTILINE)
    else:
        inline = re.search(r'^sources:\s*\[(.*)\]\s*$', fm_text, re.MULTILINE)
        if inline:
            sources = [s for s in re.findall(r'["\']?(.*?)["\']?(?:\s*,\s*|\s*$)', inline.group(1)) if s]
    return [s for s in sources if s]

def is_valid_source_path(path: str) -> bool:
    """Check if a source path is wiki-root-resolvable (not repo-root-relative or absolute)."""
    if not path:
        return True
    return bool(path.startswith('.raw/') or path.startswith(('http://', 'https://')) or path.startswith(('wiki/', 'outputs/')))

def lint(root: Path) -> tuple[dict[str, object], list[Issue]]:
    issues: list[Issue] = []
    wiki = root / "wiki"
    if not wiki.exists():
        add(issues, "missing_wiki_dir", wiki, root, "wiki/ directory is missing")
    for path in [wiki / "index.md", wiki / "hot.md", wiki / "log.md"]:
        if not path.exists():
            add(issues, "missing_required_file", path, root, "required wiki file is missing")
    raw = root / ".raw"
    if raw.exists():
        for path in raw.rglob(".manifest.json"):
            try:
                json.loads(read(path))
            except json.JSONDecodeError as exc:
                add(issues, "invalid_manifest_json", path, root, f"manifest JSON does not parse: {exc}")
    files = wiki_files(wiki)
    page_keys: dict[str, Path] = {}
    for path in files:
        for key in keys(path, wiki):
            page_keys.setdefault(key, path)
    contradictions = 0
    for path in files:
        text = read(path)
        contradictions += len(CONTRADICTION_RE.findall(text))
        for match in WIKILINK_RE.findall(text):
            target = norm(cast(str, match))
            stem = Path(target).stem
            if target not in page_keys and stem not in page_keys:
                add(issues, "unresolved_wikilink", path, root, f"unresolved wikilink: [[{target}]]")
    index = wiki / "index.md"
    index_text = read(index) if index.exists() else ""
    for path in files:
        parts = set(path.relative_to(wiki).parts[:-1])
        if path.name in EXEMPT or "meta" in parts:
            continue
        text = read(path)
        fm = FRONTMATTER_RE.match(text)
        if fm is None:
            add(issues, "missing_frontmatter", path, root, "wiki page is missing YAML frontmatter")
        else:
            for src in extract_sources(fm.group(0)):
                if not is_valid_source_path(src):
                    add(issues, "source_path_format", path, root, f"source path not wiki-root-resolvable (expected .raw/<repo-name>/ prefix or URL): {src}")
        if not index_mentions(index_text, path, wiki):
            add(issues, "missing_index_entry", path, root, "wiki page is missing from wiki/index.md")
        if not body_has_content(text):
            add(issues, "empty_generated_page", path, root, "page contains only headings or scaffold boilerplate", "warning")
    counts: dict[str, int] = {}
    for issue in issues:
        counts[issue.code] = counts.get(issue.code, 0) + 1
    return {"wiki_root": str(root), "checked_at": date.today().isoformat(), "issue_count": len(issues), "issue_counts": counts, "contradiction_callouts": contradictions, "issues": [i.as_json() for i in issues]}, issues

def write_report(root: Path, summary: dict[str, object]) -> Path:
    report = root / "wiki/meta" / f"lint-report-{date.today().isoformat()}.md"
    report.parent.mkdir(parents=True, exist_ok=True)
    lines = [f"# Lint Report - {date.today().isoformat()}", "", f"- Wiki root: `{summary['wiki_root']}`", f"- Issues: {summary['issue_count']}", f"- Contradiction callouts: {summary['contradiction_callouts']}", "", "## Issues", ""]
    issues = cast(list[dict[str, str]], summary["issues"])
    lines.extend([f"- `{i['code']}` `{i['path']}`: {i['message']}" for i in issues] or ["- none"])
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return report

def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("wiki_root")
    p.add_argument("--write-report", action="store_true")
    args = p.parse_args()
    summary, issues = lint(Path(cast(str, args.wiki_root)))
    if cast(bool, args.write_report):
        summary["report_path"] = str(write_report(Path(cast(str, args.wiki_root)), summary))
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 1 if issues else 0

if __name__ == "__main__":
    raise SystemExit(main())
