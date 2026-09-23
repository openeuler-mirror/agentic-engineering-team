#!/usr/bin/env python3
"""
graphify_analysis.py – Run graphify analysis and print results directly to stdout.

Designed for agent bash invocation - outputs directly, no file generation.

Usage (preferred, most reliable):
    ~/.aet/venv/bin/python3 scripts/graphify_analysis.py /path/to/codebase

    # System python also works — the script auto re-execs into the venv if it
    # can find ~/.aet/venv/bin/python3 and the current interpreter is NOT that venv.

注意：
    - 脚本会自动检测 ~/.aet/venv 环境，如果存在且当前不在该 venv 内，则 re-exec 到 venv
    - 如果 venv 不存在，回退到系统 python（需要系统已安装 graphifyy）

Requirements:
    - graphifyy installed in ~/.aet/venv (skills/aet-install handles this)
    - OR graphifyy installed globally (pip install graphifyy)
    - LLM API key (OPENAI_API_KEY or similar) for semantic extraction (optional)

Exit codes:
    0  success
    1  runtime error (bad path, no code files, empty graph, etc.)
    2  setup error (graphify not importable, venv re-exec failed)
    3  graphify library error (detect/extract/cluster raised)
"""

import sys
import os
import re
from pathlib import Path
from collections import Counter

VENV_DIR = Path.home() / ".aet" / "venv"
VENV_PYTHON = VENV_DIR / "bin" / "python3"

# Tag used to prefix all diagnostics so callers (agents) can reliably split
# normal output from warnings/errors. All error/Warning lines go to stderr.
_DIAG = "[graphify_analysis]"


def _in_target_venv() -> bool:
    """True iff the current interpreter is the one inside VENV_DIR.

    Uses sys.prefix (set by CPython at venv activation) instead of resolving
    sys.executable, because venv python is typically a symlink to the system
    python — Path.resolve() on both ends collapses to the same underlying
    binary, which would make the equality check always True (the original bug).
    sys.prefix is the venv root under a venv, and the system python root
    otherwise — they never collide.
    """
    try:
        return Path(sys.prefix).resolve() == VENV_DIR.resolve()
    except (OSError, RuntimeError):
        # resolve() can fail on odd filesystems; treat as "not in venv" so we
        # attempt re-exec rather than silently running in the wrong interpreter.
        return False


def _reexec_in_venv() -> int:
    """Re-execute this script under VENV_PYTHON. Returns the child exit code.

    Wraps spawn in try/except so a missing/broken venv python (vanished between
    exists() and exec, permission denied, broken symlink) degrades to a clear
    diagnostic on stderr + exit 2 (setup error) instead of an uncaught traceback.
    """
    import subprocess

    try:
        result = subprocess.run([str(VENV_PYTHON), __file__] + sys.argv[1:])
    except OSError as e:
        print(f"{_DIAG} ERROR: failed to re-exec venv python at {VENV_PYTHON}: {e}", file=sys.stderr)
        print(f"{_DIAG}        falling back to current interpreter; if `import graphify` fails, see install hint below.", file=sys.stderr)
        return 2
    # Negative returncode means the child was killed by a signal (e.g. SIGSEGV).
    # Normalize so callers see a sensible positive code; signals use 128+n.
    if result.returncode < 0:
        return 128 + (-result.returncode)
    return result.returncode


# Auto-switch to venv if available and we're not already running inside it.
# Exit code 2 = setup error (re-exec itself failed), surfaced to caller.
if VENV_PYTHON.exists() and not _in_target_venv():
    sys.exit(_reexec_in_venv())

LEAF_THRESHOLD = 0.30
GRAY_THRESHOLD = 0.15

ENTRY_LIMITS = {
    "domain_candidates": 20,
    "code_mapping_per_domain": 50,
    "keywords_per_domain": 10,
}


def to_snake_case(text: str) -> str:
    text = re.sub(r"[^a-zA-Z0-9]+", "_", text).strip("_").lower()
    text = re.sub(r"_+", "_", text)
    return text or "unnamed"


def derive_id(node_labels: list, source_files: list) -> str:
    if source_files:
        parts = []
        for f in source_files[:5]:
            rel = f.replace("\\", "/")
            segs = [
                s
                for s in rel.split("/")
                if s
                and not s.endswith((".py", ".ts", ".rs", ".go", ".js", ".java", ".md"))
            ]
            if segs:
                parts.append(segs[0])
        if parts:
            most_common = Counter(parts).most_common(1)[0][0]
            return to_snake_case(most_common)
    if node_labels:
        return to_snake_case(node_labels[0])
    return "unnamed"


def derive_keywords(node_labels: list) -> list:
    keywords = set()
    for label in node_labels[:20]:
        for token in re.split(r"[_\s\-./]", label):
            t = token.strip().lower()
            if t and len(t) > 2 and not t.isdigit():
                keywords.add(t)
    return sorted(keywords)[: ENTRY_LIMITS["keywords_per_domain"]]


def classify(cohesion: float) -> str:
    if cohesion >= LEAF_THRESHOLD:
        return "leaf"
    if cohesion < GRAY_THRESHOLD:
        return "parent"
    return "gray"


def run_graphify_analysis(root: Path) -> None:
    """Execute graphify analysis and print results directly to stdout.

    All non-fatal degradations are appended to ``warnings`` and summarized at
    the end so callers (agents) can see at a glance whether the graph is
    AST-only or also has LLM semantic enrichment.
    """

    warnings: list = []

    try:
        import graphify
    except ImportError as e:
        # Setup error: graphify not importable in the CURRENT interpreter.
        # Hint the venv install (matches what skills/aet-install does) so the
        # caller/agent can self-serve. Exit 2 = setup error (see module docstring).
        print(f"{_DIAG} ERROR: `import graphify` failed: {e}", file=sys.stderr)
        print(f"{_DIAG}        graphify not available to this interpreter:", file=sys.stderr)
        print(f"{_DIAG}          python3 = {sys.executable}", file=sys.stderr)
        print(f"{_DIAG}          sys.prefix = {sys.prefix}", file=sys.stderr)
        print(f"{_DIAG}        install it:", file=sys.stderr)
        print(f"{_DIAG}          python3 -m venv ~/.aet/venv && ~/.aet/venv/bin/pip install graphifyy", file=sys.stderr)
        print(f"{_DIAG}        or globally: pip install graphifyy", file=sys.stderr)
        sys.exit(2)

    from graphify.build import build_from_json
    from graphify.cluster import cluster, score_all
    from graphify.analyze import god_nodes, surprising_connections, suggest_questions
    from graphify.detect import detect
    from graphify.extract import extract
    from pathlib import Path as P
    from collections import Counter
    import time

    print(f"Scanning codebase: {root}")

    # Detect files - expects Path object
    detection = detect(root)
    code_files = detection.get("files", {}).get("code", [])

    if not code_files:
        print(f"{_DIAG} ERROR: no code files detected under {root}", file=sys.stderr)
        sys.exit(1)

    total_files = detection.get("total_files", len(code_files))
    total_words = detection.get("total_words", 0)
    print(f"Found {total_files} files, ~{total_words} words")

    # AST extraction
    print("Running AST extraction...")
    t0 = time.time()
    ast_result = extract([P(f) for f in code_files])
    ast_nodes = ast_result.get("nodes", [])
    ast_edges = ast_result.get("edges", [])
    print(f"  AST: {len(ast_nodes)} nodes, {len(ast_edges)} edges")

    # Semantic extraction (LLM)
    semantic_nodes, semantic_edges = [], []
    try:
        from graphify.semantic import extract_semantic_from_files

        print("Running semantic extraction (LLM)...")
        chunk_size = 15
        chunks = [
            code_files[i : i + chunk_size]
            for i in range(0, len(code_files), chunk_size)
        ]
        for idx, chunk in enumerate(chunks, 1):
            print(f"  Processing chunk {idx}/{len(chunks)}...")
            result = extract_semantic_from_files(chunk, deep_mode=False)
            semantic_nodes.extend(result.get("nodes", []))
            semantic_edges.extend(result.get("edges", []))
        print(f"  Semantic: {len(semantic_nodes)} nodes, {len(semantic_edges)} edges")
    except ImportError:
        msg = "semantic extraction module unavailable (graphify.semantic import failed; LLM enrichment skipped)"
        print(f"Warning: {msg}")
        warnings.append(msg)
    except Exception as e:
        msg = f"semantic extraction failed: {e} (LLM enrichment skipped, AST-only graph will be used)"
        print(f"Warning: {msg}")
        warnings.append(msg)

    # Merge results
    seen_ids = {n["id"] for n in ast_nodes}
    merged_nodes = list(ast_nodes)
    for n in semantic_nodes:
        if n["id"] not in seen_ids:
            merged_nodes.append(n)
            seen_ids.add(n["id"])
    merged_edges = ast_edges + semantic_edges

    print(f"Merged: {len(merged_nodes)} nodes, {len(merged_edges)} edges")

    if not merged_nodes:
        print(f"{_DIAG} ERROR: extraction produced no nodes (empty graph)", file=sys.stderr)
        sys.exit(1)

    # Build graph
    extraction = {"nodes": merged_nodes, "edges": merged_edges}
    G = build_from_json(extraction)

    # Community detection
    communities = cluster(G)
    cohesion = score_all(G, communities)
    print(f"Detected {len(communities)} communities")

    # Analysis
    gods = god_nodes(G, top_n=20)
    surprises = surprising_connections(G, communities, top_n=5)
    labels = {cid: f"Community {cid}" for cid in communities}
    questions = suggest_questions(G, communities, labels)

    elapsed = time.time() - t0
    print(f"\nAnalysis completed in {elapsed:.1f}s")
    print(f"Graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")

    # Print results directly
    print("\n" + "=" * 60)
    print("RESULTS")
    print("=" * 60)

    # God Nodes
    print("\n## God Nodes (Most Connected)")
    print("Core abstractions with highest connectivity:")
    for i, node in enumerate(gods, 1):
        node_id = node["id"]
        src_file = G.nodes[node_id].get("source_file", "")
        if src_file:
            try:
                rel_path = P(src_file).relative_to(root)
            except ValueError:
                rel_path = P(src_file)
            print(f"  {i}. {node['label']} ({rel_path}) - {node['degree']} edges")
        else:
            print(f"  {i}. {node['label']} - {node['degree']} edges")

    # Surprising Connections
    print("\n## Surprising Connections")
    print("Unexpected relationships you might not know about:")
    if surprises:
        for s in surprises:
            relation = s.get("relation", "related_to")
            conf = s.get("confidence", "EXTRACTED")
            files = s.get("source_files", ["", ""])
            print(f"  - {s['source']} --{relation}--> {s['target']} [{conf}]")
            if files[0] and files[1]:
                print(f"    {files[0]} -> {files[1]}")
    else:
        print("  None detected")

    # Domain Candidates
    print("\n## Domain Candidates")
    print(
        f"Cohesion gating: >={LEAF_THRESHOLD} -> leaf, <{GRAY_THRESHOLD} -> parent, gray zone -> subagent auto-decides."
    )

    node_label_map = {n: G.nodes[n].get("label", n) for n in G.nodes()}
    node_file_map = {n: G.nodes[n].get("source_file", "") for n in G.nodes()}

    node_to_cid = {}
    for cid, nodes in communities.items():
        for n in nodes:
            node_to_cid[n] = cid
    cross_deps = {cid: set() for cid in communities}
    for s, t in G.edges():
        sc, tc = node_to_cid.get(s), node_to_cid.get(t)
        if sc is not None and tc is not None and sc != tc:
            cross_deps[sc].add(tc)
            cross_deps[tc].add(sc)

    sorted_cids = sorted(
        communities.keys(), key=lambda c: len(communities[c]), reverse=True
    )[: ENTRY_LIMITS["domain_candidates"]]

    seen_ids = {}
    for cid in sorted_cids:
        node_ids = communities[cid]
        if not node_ids:
            continue

        labels_list = [node_label_map.get(n, n) for n in node_ids]
        files = [node_file_map.get(n, "") for n in node_ids if node_file_map.get(n)]
        coh = cohesion.get(cid, 0.0)
        kind = classify(coh)

        cand_id = derive_id(labels_list, files)
        base = cand_id
        n_suffix = 1
        while cand_id in seen_ids:
            n_suffix += 1
            cand_id = f"{base}_{n_suffix}"
        seen_ids[cand_id] = True
        name = cand_id.replace("_", " ").title()

        keywords = derive_keywords(labels_list)
        code_mapping = sorted(set(files))[: ENTRY_LIMITS["code_mapping_per_domain"]]
        deps = sorted(cross_deps.get(cid, []))

        print(f"\n  [{cid}] {name} (`{cand_id}`)")
        print(f"  Kind: {kind} | Cohesion: {coh:.4f} | Nodes: {len(node_ids)}")
        if keywords:
            print(f"  Keywords: {', '.join(keywords)}")
        if deps:
            print(f"  Depends on: {', '.join(str(d) for d in deps[:10])}")
        if code_mapping:
            rel_files = []
            for f in code_mapping[:5]:
                try:
                    rel_files.append(str(P(f).relative_to(root)))
                except ValueError:
                    rel_files.append(f)
            suffix = f" +{len(code_mapping) - 5} more" if len(code_mapping) > 5 else ""
            print(f"  Code mapping: {', '.join(rel_files)}{suffix}")

    # Top Files
    print("\n## Top Files by Definition Count")
    JSON_NOISE_LABELS = frozenset(
        {
            "start",
            "end",
            "name",
            "id",
            "type",
            "properties",
            "value",
            "key",
            "data",
            "items",
            "title",
            "description",
            "version",
            "dependencies",
            "devdependencies",
            "peerdependencies",
        }
    )
    file_defs = Counter()
    for n in G.nodes():
        src = G.nodes[n].get("source_file", "")
        label = G.nodes[n].get("label", "")
        if not src:
            continue
        if src.endswith(".json") and label.strip().lower() in JSON_NOISE_LABELS:
            continue
        if label == os.path.basename(src):
            continue
        if label.endswith("()") or "rationale" in n.lower():
            file_defs[src] += 1

    if file_defs:
        top_files = file_defs.most_common(10)
        for i, (f, count) in enumerate(top_files, 1):
            try:
                rel_path = P(f).relative_to(root)
            except ValueError:
                rel_path = P(f)
            print(f"  {i}. {rel_path} - {count} definitions")

    # Suggested Questions
    if questions:
        print("\n## Suggested Questions")
        print("Insights this graph can help answer:")
        for q in questions:
            if q.get("question"):
                print(f"  - {q['question']}")
                print(f"    Reason: {q.get('why', 'N/A')}")

    print("\n" + "=" * 60)
    print("END OF RESULTS")
    print("=" * 60)

    # Preserve the on-disk knowledge graph report for caching by S0 of
    # references/phase1-project-overview.md (which keys off
    # graphify-out/GRAPH_REPORT.md). The previous implementation deleted this
    # directory on every run, defeating the cache and forcing a re-run (with
    # re-issuing LLM calls) on every subsequent analysis of the same project.
    # Only warn if the library did NOT produce the expected report file — that
    # is the real signal callers care about, not the directory's presence.
    out_dir = root / "graphify-out"
    report_file = out_dir / "GRAPH_REPORT.md"
    if not report_file.exists():
        msg = f"graphify library did not produce {report_file.relative_to(root)}; S0 cache will not hit on next run"
        print(f"Warning: {msg}", file=sys.stderr)
        warnings.append(msg)

    # Warnings / degradations summary — always printed (even if empty) so
    # callers can rely on the section's presence when parsing output.
    print("\n## Warnings & Degradations")
    if warnings:
        for w in warnings:
            print(f"  - {w}")
    else:
        print("  (none — full analysis, including LLM enrichment, completed)")


def main():
    if len(sys.argv) < 2:
        print(f"Usage:")
        print(f"  preferred (uses venv): ~/.aet/venv/bin/python3 {Path(__file__).name} /path/to/codebase")
        print(f"  system python (auto re-execs into venv if present): python3 {Path(__file__).name} /path/to/codebase")
        sys.exit(1)

    root = Path(sys.argv[1]).resolve()
    if not root.is_dir():
        print(f"{_DIAG} ERROR: not a directory: {root}", file=sys.stderr)
        sys.exit(1)

    os.chdir(root)

    try:
        run_graphify_analysis(root)
    except SystemExit:
        # sys.exit() raised inside run_graphify_analysis (exit 1 = runtime
        # error, exit 2 = setup error). Propagate as-is.
        raise
    except Exception as e:
        # Unexpected graphify library error (detect/extract/cluster/build/
        # analyze raised). Exit 3 = library error (see module docstring) so
        # callers can distinguish "library blew up" from "user input bad".
        import traceback

        print(f"{_DIAG} ERROR: graphify library raised an exception: {e}", file=sys.stderr)
        print(f"{_DIAG}        traceback (last line is usually the cause):", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(3)


if __name__ == "__main__":
    main()
