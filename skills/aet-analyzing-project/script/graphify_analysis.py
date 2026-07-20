#!/usr/bin/env python3
"""
graphify_analysis.py – Run graphify analysis and print results directly to stdout.

Designed for agent bash invocation - outputs directly, no file generation.

Usage:
    python3 graphify_analysis.py /path/to/codebase

    注意：
    - 脚本会自动检测 ~/.aet/venv 环境，如果存在则使用 venv 中的 graphify
    - 如果 venv 不存在，回退到系统 python（需要系统已安装 graphifyy）

Requirements:
    - graphifyy installed in ~/.aet/venv (install.sh handles this)
    - OR graphifyy installed globally (pip install graphifyy)
    - LLM API key (OPENAI_API_KEY or similar) for semantic extraction (optional)
"""

import sys
import os
import re
from pathlib import Path
from collections import Counter

VENV_DIR = Path.home() / ".aet" / "venv"
VENV_PYTHON = VENV_DIR / "bin" / "python3"

# Auto-switch to venv if available and currently running in system python
if VENV_PYTHON.exists() and Path(sys.executable).resolve() != VENV_PYTHON.resolve():
    import subprocess

    result = subprocess.run([str(VENV_PYTHON), __file__] + sys.argv[1:])
    sys.exit(result.returncode)

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
    """Execute graphify analysis and print results to stdout."""

    try:
        import graphify
    except ImportError:
        print("Error: graphify not installed. Install with: pip install graphifyy")
        sys.exit(1)

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
        print("No code files found")
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
        print("Warning: semantic extraction not available (no LLM configured)")
    except Exception as e:
        print(f"Warning: semantic extraction failed: {e}")

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
        print("Error: No nodes extracted")
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

    # Cleanup: Remove graphify-out directory if created by library internals
    out_dir = root / "graphify-out"
    if out_dir.exists():
        import shutil

        shutil.rmtree(out_dir)
        print("(Cleaned up graphify-out directory)")


def main():
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python graphify_analysis.py /path/to/codebase")
        sys.exit(1)

    root = Path(sys.argv[1]).resolve()
    if not root.is_dir():
        print(f"Error: Path is not a directory: {root}")
        sys.exit(1)

    os.chdir(root)

    run_graphify_analysis(root)


if __name__ == "__main__":
    main()
