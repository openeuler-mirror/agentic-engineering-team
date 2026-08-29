#!/usr/bin/env python3
"""Return hot/index/page candidates for a claude-obsidian-style wiki query.

Usage:
    python query_context.py <wiki-root> "<query>" [--top 5]
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from pathlib import Path
from typing import TypedDict, cast


TOKEN_RE = re.compile(r"[\w\u4e00-\u9fff]+", re.UNICODE)


class Candidate(TypedDict):
    path: str
    relative_path: str
    score: int


def tokens(text: str) -> Counter[str]:
    return Counter(t.lower() for t in TOKEN_RE.findall(text) if len(t) > 1)


def score(query_terms: Counter[str], text: str) -> int:
    body_terms = tokens(text)
    return sum(body_terms.get(term, 0) * weight for term, weight in query_terms.items())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("wiki_root")
    parser.add_argument("query")
    parser.add_argument("--top", type=int, default=5)
    args = parser.parse_args()

    root = Path(cast(str, args.wiki_root))
    wiki = root / "wiki"
    hot = wiki / "hot.md"
    index = wiki / "index.md"
    if not wiki.exists():
        raise SystemExit(f"wiki directory not found: {wiki}")

    query_text = cast(str, args.query)
    query_terms = tokens(query_text)
    candidates: list[Candidate] = []
    for path in wiki.rglob("*.md"):
        if path.name in {"hot.md", "index.md", "log.md"}:
            continue
        if "meta" in path.relative_to(wiki).parts:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        value = score(query_terms, text)
        if value > 0:
            candidates.append({"path": str(path), "relative_path": str(path.relative_to(root)).replace("\\", "/"), "score": value})
    candidates.sort(key=lambda item: (-item["score"], item["relative_path"]))

    result = {
        "query": query_text,
        "read_order": [
            str(hot) if hot.exists() else None,
            str(index) if index.exists() else None,
        ],
        "candidates": candidates[: cast(int, args.top)],
        "note": "Read hot.md first, then index.md, then candidate pages. If candidates are empty, report a wiki coverage gap and suggest ingesting more sources.",
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
