#!/usr/bin/env python3
"""Plan an incremental repository ingest for a claude-obsidian-style wiki.

Opt-out candidate selection (Plan A):
  - should_skip() does hard exclusion (binary, generated, cache, VCS, >512KB).
  - Everything else is a candidate.
  - classify_candidate() labels each as "high" (known dir/name) or "review" (needs agent judgment).
  - The "don't do" second-stage filter in rules.md is where the agent makes final ingest/summarize/skip calls.

Usage:
    python plan_ingest.py <wiki-root> <repo-path> [--write-manifest]
"""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any, cast


# --------------------------------------------------------------------------- #
# Whitelists                                                                   #
# --------------------------------------------------------------------------- #

# Files that are always high-confidence candidates regardless of location.
CANDIDATE_NAMES = {
    "readme.md", "readme.txt",
    "package.json", "pyproject.toml", "pom.xml", "go.mod",
    "requirements.txt", "cargo.toml",
    "dockerfile", "docker-compose.yml",
    "tsconfig.json", "vite.config.ts", "next.config.js",
    # Skill / agent definition files — equivalent to README for skill/agent dirs.
    "skill.md", "agents.md",
}

# Directories whose contents are high-confidence candidates.
# This constant is the authoritative list; classify_candidate() references it.
CANDIDATE_PARTS = {
    # Standard project directories
    "docs", "doc", "src", "app", "lib", "packages", "services",
    "cmd", "internal", ".github", "deploy", "k8s", "helm",
    # Common project directories that should not be skipped by default
    "skills", "hooks", "config", "scripts", "test", "tests",
    "playbooks", "references", "templates", "reports",
}

# Hard-skip: generated, dependency, cache, or VCS paths.
SKIP_PARTS = {
    ".git", "node_modules", "dist", "build", "target",
    "coverage", ".next", ".venv", "venv", "__pycache__",
}

# Hard-skip: binary or default-skipped extensions.
SKIP_SUFFIXES = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp",
    ".zip", ".tar", ".gz",
    ".exe", ".dll", ".so",
    ".class", ".jar", ".lock",
}

# Root-level files worth considering as ingest candidates.
ROOT_CANDIDATE_SUFFIXES = {
    ".md", ".mdx", ".txt",
    ".sh", ".bash", ".mjs", ".cjs", ".js", ".jsx", ".ts", ".tsx",
    ".py", ".rs", ".go", ".java",
    ".c", ".cpp", ".h", ".hpp",
    ".json", ".yml", ".yaml", ".toml", ".ini", ".cfg", ".conf",
    ".html", ".css", ".sql", ".proto",
}

# Root-level files with no extension that are candidate signals.
ROOT_CANDIDATE_NOEXT_NAMES = {"license", "contributing", "authors", "changelog", "makefile"}

# Auto-generated lockfiles: never candidates.
LOCKFILE_NAMES = {"package-lock.json", "pnpm-lock.yaml", "yarn.lock", "poetry.lock", "cargo.lock"}


# --------------------------------------------------------------------------- #
# Data classes                                                                 #
# --------------------------------------------------------------------------- #

@dataclass
class PlannedFile:
    path: str
    status: str          # new | changed | unchanged | skip | review
    reason: str
    hash: str | None = None
    confidence: str = "high"   # high | review | skip


# --------------------------------------------------------------------------- #
# Helpers                                                                      #
# --------------------------------------------------------------------------- #

def file_hash(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


Manifest = dict[str, Any]


def load_manifest(path: Path) -> Manifest:
    if not path.exists():
        return {"sources": {}}
    return cast(Manifest, json.loads(path.read_text(encoding="utf-8")))


# --------------------------------------------------------------------------- #
# Stage 1: Hard skip                                                          #
# --------------------------------------------------------------------------- #

def should_skip(path: Path, rel: Path) -> str | None:
    """Hard exclusion: binary, generated, cache, VCS, or oversized.

    Only these reasons cause a file to be excluded from the candidate set.
    Everything else is a candidate (opt-out semantics).
    """
    lower_parts = {part.lower() for part in rel.parts}
    if lower_parts & SKIP_PARTS:
        return "generated, dependency, cache, or VCS path"
    if path.suffix.lower() in SKIP_SUFFIXES:
        return "binary or default-skipped extension"
    if path.stat().st_size > 512 * 1024:
        return "larger than 512KB; create a pointer or select excerpts"
    return None


# --------------------------------------------------------------------------- #
# Stage 2: Classify candidate confidence                                      #
# --------------------------------------------------------------------------- #

def classify_candidate(rel: Path) -> tuple[bool, str]:
    """Classify a non-skipped file as high-confidence or review candidate.

    Returns ``(True, "high")`` for high-confidence candidates
    (in known directories or with known names).
    Returns ``(True, "review")`` for review candidates
    (not in known directories — needs agent judgment at the hard checkpoint).
    Returns ``(False, "skip_lockfile")`` for auto-generated lockfiles.

    Under opt-out semantics, almost everything returns ``(True, ...)``.
    The confidence level helps the agent prioritize at the hard checkpoint:
    high-confidence candidates can be batch-confirmed; review candidates
    need individual or bucket-level judgment.
    """
    name = rel.name.lower()
    lower_parts = {part.lower() for part in rel.parts}

    # High confidence: known file names anywhere.
    if name in CANDIDATE_NAMES:
        return True, "high"

    # High confidence: root-level files with known extensions.
    if rel.parent == Path("."):
        if name in LOCKFILE_NAMES:
            return False, "skip_lockfile"
        if name.startswith(".env"):
            return True, "high"
        if rel.suffix.lower() in ROOT_CANDIDATE_SUFFIXES:
            return True, "high"
        if not rel.suffix and name in ROOT_CANDIDATE_NOEXT_NAMES:
            return True, "high"

    # High confidence: in known directories (CANDIDATE_PARTS).
    if lower_parts & CANDIDATE_PARTS:
        return True, "high"

    # Review: everything else that passed should_skip().
    # These files ARE candidates, but the agent should review them
    # at the hard checkpoint before confirming ingest/summarize/skip.
    return True, "review"


# --------------------------------------------------------------------------- #
# Plan                                                                         #
# --------------------------------------------------------------------------- #

def plan(wiki_root: Path, repo_path: Path) -> tuple[list[PlannedFile], Manifest]:
    manifest_path = wiki_root / ".raw/.manifest.json"
    manifest = load_manifest(manifest_path)
    manifest.setdefault("sources", {})
    planned: list[PlannedFile] = []

    for path in sorted(p for p in repo_path.rglob("*") if p.is_file()):
        rel = path.relative_to(repo_path)
        rel_posix = rel.as_posix()
        manifest_key = f".raw/{repo_path.name}/{rel_posix}"

        # Stage 1: hard skip (binary, generated, cache, VCS, oversized).
        skip_reason = should_skip(path, rel)
        if skip_reason:
            planned.append(PlannedFile(rel_posix, "skip", skip_reason, None, "skip"))
            continue

        # Stage 2: classify as high-confidence or review candidate.
        is_candidate, confidence = classify_candidate(rel)
        if not is_candidate:
            # Only auto-generated lockfiles reach here.
            planned.append(PlannedFile(rel_posix, "skip", "auto-generated lockfile", None, "skip"))
            continue

        # Hash and compare with manifest.
        digest = file_hash(path)
        old = manifest["sources"].get(manifest_key, {})
        if old.get("hash") == digest:
            status = "unchanged"
            reason = "hash matches manifest"
        elif old:
            status = "changed"
            reason = "hash differs from manifest"
        else:
            status = "new"
            reason = "not present in manifest"
        planned.append(PlannedFile(rel_posix, status, reason, digest, confidence))

    return planned, manifest


# --------------------------------------------------------------------------- #
# Manifest writer                                                             #
# --------------------------------------------------------------------------- #

def write_manifest(wiki_root: Path, repo_name: str, planned: list[PlannedFile], manifest: Manifest) -> None:
    today = date.today().isoformat()
    sources = cast(dict[str, Any], manifest.setdefault("sources", {}))
    for item in planned:
        # Write both high-confidence and review candidates to manifest.
        # Skip files (hash is None) are not registered.
        if item.hash is None:
            continue
        key = f".raw/{repo_name}/{item.path}"
        current = cast(dict[str, Any], sources.get(key, {}))
        current.update({
            "hash": item.hash,
            "planned_at": today,
            "confidence": item.confidence,
        })
        current.setdefault("pages_created", [])
        current.setdefault("pages_updated", [])
        sources[key] = current
    manifest_path = wiki_root / ".raw/.manifest.json"
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


# --------------------------------------------------------------------------- #
# CLI                                                                          #
# --------------------------------------------------------------------------- #

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("wiki_root")
    parser.add_argument("repo_path")
    parser.add_argument("--write-manifest", action="store_true")
    args = parser.parse_args()

    wiki_root = Path(cast(str, args.wiki_root))
    repo_path = Path(cast(str, args.repo_path))
    if not repo_path.exists() or not repo_path.is_dir():
        raise SystemExit(f"repo path does not exist or is not a directory: {repo_path}")

    planned, manifest = plan(wiki_root, repo_path)

    # Summary: high-confidence candidates by status + review candidates + skips.
    summary: dict[str, int] = {"new": 0, "changed": 0, "unchanged": 0, "skip": 0, "review": 0}
    for item in planned:
        if item.status == "skip":
            summary["skip"] += 1
        elif item.confidence == "review":
            summary["review"] += 1
        else:
            summary[item.status] = summary.get(item.status, 0) + 1

    print(json.dumps(
        {"repo": str(repo_path), "summary": summary, "files": [item.__dict__ for item in planned]},
        ensure_ascii=False, indent=2,
    ))

    if args.write_manifest:
        write_manifest(wiki_root, repo_path.name, planned, manifest)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
