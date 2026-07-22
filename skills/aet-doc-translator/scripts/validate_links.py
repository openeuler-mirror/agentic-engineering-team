#!/usr/bin/env python3
"""
Validate and fix links in translated documentation.

Usage:
    python3 validate_links.py <source_dir> <output_dir> [--fix] [--scope-only]

The script:
1. Builds heading maps from source→output to detect anchor changes.
2. Rewrites link URL fragments to match new English anchors (with --fix).
3. Validates all internal links resolve to existing files and anchors.
4. With --scope-only, only reports broken links within the translated scope,
   ignoring cross-package references to untranslated docs.
5. Reports structured errors with rule codes matching check_link.py conventions.
"""

import os
import re
import sys
import html
import collections
from pathlib import Path
from typing import List, Dict, Tuple, Set, Optional
from collections import defaultdict


# ── helpers ──────────────────────────────────────────────────────────

def generate_anchor(text: str) -> str:
    """Generate anchor ID matching check_link.py logic.

    Algorithm:
      1. Decode HTML entities.
      2. Handle deprecated/special sup tags.
      3. Handle escaped characters.
      4. Remove all brackets and parentheses.
      5. Remove all punctuation and special characters.
      6. Lowercase.
      7. Strip leading/trailing spaces.
      8. Replace remaining spaces with hyphens.
    """
    text = html.unescape(text)
    text = text.replace('<sup>(deprecated)</sup>', 'deprecated') \
               .replace('<sup>(deprecated)<sup>', 'deprecated') \
               .replace('<sup>[frontend]</sup>', 'frontend')
    text = text.replace('\\<', '<').replace('\\>', '>') \
               .replace('\\`', '`').replace('\\/', '/')
    # Remove all brackets and parentheses
    text = text.replace('(', '').replace(')', '').replace('[', '') \
               .replace(']', '').replace('{', '').replace('}', '') \
               .replace('<', '').replace('>', '')
    text = text.replace('（', '').replace('）', '').replace('【', '') \
               .replace('】', '').replace('『', '').replace('』', '')
    # Remove all punctuation and special characters
    for ch in '~!@#$%^&*+=|:;"\'\\,./?·￥……—，。、；：‘’“”《》？！':
        text = text.replace(ch, '')
    text = text.replace('`', '')
    text = text.lower()
    text = text.strip()
    text = text.replace(' ', '-')
    text = re.sub(r'-{2,}', '-', text)
    text = text.strip('-')
    if text and text[0].isdigit():
        text = '_' + text
    return text


def normalize_anchor(anchor: str) -> str:
    """Normalize anchor for comparison with generate_anchor output."""
    return generate_anchor(anchor)


def is_pos_inside_code(content: str, pos: int) -> bool:
    """Check if *pos* in *content* is inside inline code or a fenced code block."""
    before = content[:pos]
    parts = before.split('```')
    if len(parts) % 2 == 0:
        return True
    line_start = before.rfind('\n') + 1
    line_snip = content[line_start:pos]
    return line_snip.count('`') % 2 == 1


def extract_headings(filepath: str) -> Tuple[List[Dict], str]:
    """Return (headings, content) where headings is a list of dicts.

    Each dict has keys: text, anchor, line, level.
    - h1 headings are treated as the document title (not included as regular anchors).
    - Duplicate anchors get ``-1``, ``-2`` suffixes.
    - Level-4+ headings are flagged.
    """
    headings = []
    title = ''
    title_anchor = ''
    with open(filepath, encoding='utf-8') as f:
        content = f.read()

    base_anchor_count: Dict[str, int] = defaultdict(int)

    for m in re.finditer(r'^(#{1,6})\s+(.+)$', content, re.MULTILINE):
        level = len(m.group(1))
        raw_text = m.group(2).strip()
        display = re.sub(r'`([^`]+)`', r'\1', raw_text)
        anchor = generate_anchor(display)
        line = content[:m.start()].count('\n') + 1

        if level == 1:
            title = display
            title_anchor = anchor
            continue

        count = base_anchor_count[anchor]
        base_anchor_count[anchor] += 1
        if count > 0:
            final_anchor = f'{anchor}-{count}'
        else:
            final_anchor = anchor

        headings.append({
            'text': display,
            'anchor': final_anchor,
            'line': line,
            'level': level,
        })
    return headings, content, title, title_anchor


def find_markdown_links(content: str, filepath: str = ''):
    """Yield (start, end, text, url, line_number) for every markdown inline link.

    Uses check_link.py style regex per-line for line tracking.
    Skips mailto links and links inside code blocks.
    """
    lines = content.split('\n')
    offset = 0
    for line_num, line in enumerate(lines, 1):
        for m in re.finditer(r'\[([^\]]+)\]\(([^)]+)\)', line):
            url = m.group(2)
            if 'mailto:' in url:
                continue
            start = offset + m.start()
            end = offset + m.end()
            if is_pos_inside_code(content, start):
                continue
            text = m.group(1)
            yield start, end, text, url, line_num
        offset += len(line) + 1  # +1 for newline


def collect_links_in_file(filepath: str) -> List[Dict]:
    """Return list of link info dicts for all links in file."""
    with open(filepath, encoding='utf-8') as f:
        content = f.read()
    result = []
    for start, end, text, url, line in find_markdown_links(content, filepath):
        result.append({
            'start': start, 'end': end, 'text': text,
            'url': url, 'line': line,
        })
    return result


# ── core logic ───────────────────────────────────────────────────────

def build_anchor_map(source_file: str, output_file: str) -> Dict[str, str]:
    src_headings, _, src_title, src_title_anchor = extract_headings(source_file)
    out_headings, _, out_title, out_title_anchor = extract_headings(output_file)
    if len(src_headings) != len(out_headings):
        print(f'  WARNING: heading count mismatch in {source_file} '
              f'({len(src_headings)} → {len(out_headings)})')
    return {s['anchor']: o['anchor']
        for s, o in zip(src_headings, out_headings)}


def find_output_path(source_path: str, source_root: str, output_root: str) -> str:
    rel = os.path.relpath(source_path, source_root)
    return os.path.normpath(os.path.join(output_root, rel))


def rewrite_links_in_file(filepath: str, heading_maps: Dict[str, Dict[str, str]],
                          output_root: str, fix: bool = False) -> int:
    with open(filepath, encoding='utf-8') as f:
        content = f.read()

    changes = 0
    links = list(find_markdown_links(content, filepath))
    for link in reversed(links):
        start, end, text, url, _line_num = link
        if url.startswith(('http://', 'https://', 'mailto:')):
            continue
        path_part, anchor_part = (url.rsplit('#', 1) + [None])[:2]
        if not anchor_part:
            continue
        if not path_part:
            target_file = filepath
        else:
            target_file = os.path.normpath(
                os.path.join(os.path.dirname(filepath), path_part))
        amap = heading_maps.get(target_file)
        if amap and anchor_part in amap:
            new_anchor = amap[anchor_part]
            if new_anchor != anchor_part:
                new_url = f'{path_part}#{new_anchor}' if path_part else f'#{new_anchor}'
                if fix:
                    content = content[:start] + f'[{text}]({new_url})' + content[end:]
                    changes += 1
                else:
                    rel = os.path.relpath(filepath, output_root)
                    print(f'  WOULD FIX: {rel}: '
                          f'[{text}]({url}) → [{text}]({new_url})')

    if fix and changes > 0:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        rel = os.path.relpath(filepath, output_root)
        print(f'  FIXED {changes} link(s) in {rel}')
    return changes


def validate_links_in_file(filepath: str, output_root: str,
                           all_headings: Dict[str, Set[str]],
                           all_titles: Dict[str, str],
                           all_deep_headings: Dict[str, Set[str]]) -> List[Dict]:
    """Validate links in a file. Returns list of error dicts with rule codes.

    Rule codes (matching check_link.py):
      4-2: Target file not found
      4-3: Anchor not found in target file
      4-4: Anchor is a level-1 heading (redundant)
      4-5: Level-4+ heading anchor (likely invalid)
    """
    broken = []
    rel_path = os.path.relpath(filepath, output_root)

    for link in collect_links_in_file(filepath):
        url = link['url']
        line = link['line']

        if url.startswith(('http://', 'https://', 'mailto:')):
            continue

        # Skip type-reference links (Int64, etc. — no /, ., # in URL)
        if '/' not in url and '#' not in url and not url.startswith(('http', 'mailto', '.')):
            continue

        path_part, anchor_part = (url.rsplit('#', 1) + [None])[:2]
        if not path_part:
            target_file = filepath
        else:
            target_file = os.path.normpath(
                os.path.join(os.path.dirname(filepath), path_part))

        if not os.path.exists(target_file):
            broken.append({
                'rule': '4-2',
                'file': rel_path,
                'line': line,
                'url': url,
                'message': f"Target file not found: '{url}' → {target_file}",
            })
            continue

        if anchor_part:
            anchors = all_headings.get(target_file)
            title_anchor = all_titles.get(target_file, '')

            if anchors is None:
                if os.path.exists(target_file):
                    headings, _, title, title_anchor = extract_headings(target_file)
                    anchors = {h['anchor'] for h in headings}
                    all_headings[target_file] = anchors
                    all_titles[target_file] = title_anchor
                    all_deep_headings[target_file] = {h['anchor'] for h in headings if h['level'] >= 4}
                else:
                    continue

            # Rule 4-4: Anchor is a level-1 heading (redundant)
            if title_anchor and anchor_part == title_anchor:
                broken.append({
                    'rule': '4-4',
                    'file': rel_path,
                    'line': line,
                    'url': url,
                    'message': f"Anchor is a level-1 heading (redundant): "
                               f"#{anchor_part} (in {os.path.relpath(target_file, output_root)})",
                })
                continue

            # Rule 4-5: Level-4+ heading anchor may be invalid
            deep = all_deep_headings.get(target_file, set())
            if anchor_part in deep:
                broken.append({
                    'rule': '4-5',
                    'file': rel_path,
                    'line': line,
                    'url': url,
                    'message': f"Level-4+ heading anchor may be invalid: "
                               f"#{anchor_part} (in {os.path.relpath(target_file, output_root)})",
                })
                continue

            # Rule 4-3: Anchor not found
            if anchor_part not in anchors:
                broken.append({
                    'rule': '4-3',
                    'file': rel_path,
                    'line': line,
                    'url': url,
                    'message': f"Anchor not found: '#{anchor_part}' "
                               f"(in {os.path.relpath(target_file, output_root)})",
                })

    return broken


# ── main ─────────────────────────────────────────────────────────────

def main():
    import argparse
    parser = argparse.ArgumentParser(
        description='Validate and fix links in translated docs.')
    parser.add_argument('source_dir', help='Chinese source directory')
    parser.add_argument('output_dir', help='English output directory')
    parser.add_argument('--fix', action='store_true',
                        help='Fix broken anchors automatically')
    parser.add_argument('--scope-only', action='store_true',
                        help='Only validate links within the translated '
                             'scope (skip cross-package links)')
    args = parser.parse_args()

    output_root = os.path.abspath(args.output_dir)
    source_root = os.path.abspath(args.source_dir)

    # Collect all .md files within the translated output (the "scope")
    scope_files: Set[str] = set()
    for root, _dirs, files in os.walk(output_root):
        for f in files:
            if f.endswith('.md'):
                scope_files.add(os.path.normpath(os.path.join(root, f)))

    # Pair source → output files
    pairs = []
    for root, _dirs, files in os.walk(source_root):
        for f in files:
            if f.endswith('.md'):
                src = os.path.join(root, f)
                out = find_output_path(src, source_root, output_root)
                if os.path.exists(out):
                    pairs.append((src, out))

    print(f'Found {len(pairs)} source/output file pairs')
    print(f'Scope: {len(scope_files)} .md files in output dir')

    # Build heading maps for all pairs
    heading_maps: Dict[str, Dict[str, str]] = {}
    for src, out in pairs:
        amap = build_anchor_map(src, out)
        if amap:
            heading_maps[out] = amap

    # Collect all anchors and titles from output files for validation
    all_headings: Dict[str, Set[str]] = {}
    all_titles: Dict[str, str] = {}
    all_deep_headings: Dict[str, Set[str]] = {}
    for path in scope_files:
        headings, _, title, title_anchor = extract_headings(path)
        all_headings[path] = {h['anchor'] for h in headings}
        all_titles[path] = title_anchor
        all_deep_headings[path] = {h['anchor'] for h in headings if h['level'] >= 4}

    # ── fix links ──
    if args.fix:
        print('\n=== Rewriting links ===')
        total_fixes = 0
        for path in sorted(scope_files):
            c = rewrite_links_in_file(
                path, heading_maps, output_root, fix=True)
            total_fixes += c
        print(f'Total links fixed: {total_fixes}')

    # ── validate links ──
    print('\n=== Link Validation ===')
    all_errors = []
    cross_package = 0
    for path in sorted(scope_files):
        errors = validate_links_in_file(
            path, output_root, all_headings, all_titles, all_deep_headings)
        for err in errors:
            if args.scope_only and err['rule'] in ('4-2',):
                # For file-not-found, check if target is outside scope
                m = re.search(r"→ (.+)$", err['message'])
                if m:
                    target_abs = os.path.normpath(m.group(1).strip())
                    if target_abs not in scope_files:
                        cross_package += 1
                        continue
            all_errors.append(err)

    # Print structured report
    rule_descriptions = {
        '4-2': 'Target file not found',
        '4-3': 'Anchor not found in target file',
        '4-4': 'Anchor is a level-1 heading (redundant)',
        '4-5': 'Level-4+ heading anchor may be invalid',
    }

    # Group by rule
    by_rule: Dict[str, List[Dict]] = defaultdict(list)
    for err in all_errors:
        by_rule[err['rule']].append(err)

    for rule in sorted(by_rule.keys()):
        desc = rule_descriptions.get(rule, 'Unknown')
        items = by_rule[rule]
        print(f'\n  [{rule}] {desc} ({len(items)}):')
        for err in items:
            print(f'    {err["file"]}:{err["line"]}: {err["url"]} — {err["message"]}')

    print()
    if cross_package:
        print(f'  ({cross_package} cross-package broken links excluded '
              f'from count with --scope-only)')
    total_broken = len(all_errors)
    if total_broken == 0:
        print('All internal links within scope are valid!')
    else:
        print(f'WARNING: {total_broken} broken link(s) found within scope.')
        sys.exit(1)


if __name__ == '__main__':
    main()
