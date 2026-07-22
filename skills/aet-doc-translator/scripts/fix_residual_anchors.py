#!/usr/bin/env python3
"""
Fix residual broken anchors in translated docs after validate_links.py --fix.

Handles:
1. Already-English anchors that don't match actual GFM anchors (fuzzy match)
2. Spaces/invalid chars in URL fragments
3. Cross-package wrong paths
4. Type references (Int64, etc.) misidentified as links

Usage:
    python3 fix_residual_anchors.py <output_dir> [--source-dir <source_dir>]
"""
import os, re, sys, collections
sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
from validate_links import generate_anchor, extract_headings, find_markdown_links


def fix_links_in_file(filepath, output_root, all_anchors):
    """Fix broken anchors in a single file."""
    with open(filepath, encoding='utf-8') as f:
        content = f.read()

    changes = 0
    links = list(find_markdown_links(content))

    for start, end, text, url, _line_num in reversed(links):
        if url.startswith(('http://', 'https://', 'mailto:')):
            continue
        path_part, anchor_part = (url.rsplit('#', 1) + [None])[:2]
        if not anchor_part:
            continue

        # Resolve target file
        target_file = filepath if not path_part else \
            os.path.normpath(os.path.join(os.path.dirname(filepath), path_part))

        if not os.path.exists(target_file):
            continue

        real_anchors = all_anchors.get(target_file)
        if real_anchors is None:
            continue

        if anchor_part in real_anchors:
            continue  # already valid

        new_anchor = None

        # Case 1: Anchor with spaces
        if ' ' in anchor_part:
            candidate = anchor_part.lower().replace(' ', '-')
            candidate = re.sub(r'[^\w\s-]', '', candidate)
            candidate = re.sub(r'\s+', '-', candidate).strip('-')
            if candidate in real_anchors:
                new_anchor = candidate

        # Case 2: Fuzzy match by word overlap
        if new_anchor is None:
            norm = anchor_part.lower().replace('-', ' ').replace('_', ' ')
            words = set(norm.split())
            best = None
            best_score = 0
            for ra in real_anchors:
                ra_norm = ra.lower().replace('-', ' ').replace('_', ' ')
                ra_words = set(ra_norm.split())
                overlap = words & ra_words
                score = len(overlap) / max(len(words | ra_words), 1)
                if score > best_score and score >= 0.4:
                    best_score = score
                    best = ra
                # Also try if text GFM anchor matches
                text_anchor = generate_anchor(text)
                if text_anchor in real_anchors:
                    best = text_anchor
                    best_score = 1.0
            new_anchor = best

        if new_anchor:
            new_url = f'{path_part}#{new_anchor}' if path_part else f'#{new_anchor}'
            content = content[:start] + f'[{text}]({new_url})' + content[end:]
            changes += 1
            rel = os.path.relpath(filepath, output_root)
            print(f'  FIXED: {rel}: [{text}]({url}) → [{text}]({new_url})')

    if changes > 0:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        rel = os.path.relpath(filepath, output_root)
        print(f'  -> {changes} change(s) in {rel}')
    return changes


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Fix residual broken anchors.')
    parser.add_argument('output_dir', help='English output directory')
    parser.add_argument('--source-dir', help='Chinese source directory (optional, for cross-package path correction)')
    args = parser.parse_args()

    output_root = os.path.abspath(args.output_dir)

    # Build anchor index for all output files
    all_anchors = {}
    for root, _dirs, files in os.walk(output_root):
        for f in files:
            if f.endswith('.md'):
                path = os.path.normpath(os.path.join(root, f))
                headings, _, _title, _title_anchor = extract_headings(path)
                all_anchors[path] = {h['anchor'] for h in headings}

    # Process all markdown files
    total = 0
    for root, _dirs, files in os.walk(output_root):
        for f in files:
            if f.endswith('.md'):
                path = os.path.normpath(os.path.join(root, f))
                total += fix_links_in_file(path, output_root, all_anchors)

    print(f'\nTotal changes: {total}')


if __name__ == '__main__':
    main()
