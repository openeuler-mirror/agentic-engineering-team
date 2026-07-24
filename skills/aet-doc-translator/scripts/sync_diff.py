#!/usr/bin/env python3
"""
Sync diff & consistency check for Chinese↔English document pairs.

Modes:
  --detect    Find Chinese files that were updated and need sync.
              Uses git if available, otherwise content-based heuristic.
  --check     Consistency check on ALL file pairs: verify section structure,
              Chinese residue, content ratio.
  --sync      After --detect, output changed sections for re-translation.

Usage:
  python3 sync_diff.py <source_dir> <output_dir> --detect
  python3 sync_diff.py <source_dir> <output_dir> --check
  python3 sync_diff.py <source_dir> <output_dir> --sync <changed_files.txt>
"""
import os
import re
import sys
import subprocess
import time


# ── helpers ──────────────────────────────────────────────────────────


def split_sections(content: str):
    """Split by ## headings. Returns list of (heading_level, heading_text, body)."""
    lines = content.split('\n')
    sections = []
    current_heading = ('h0', '')
    current_body = []

    def flush():
        if current_body or current_heading[0] != 'h0':
            sections.append((*current_heading, '\n'.join(current_body)))
        current_body.clear()

    for line in lines:
        m = re.match(r'^(#{1,6})\s+(.+)$', line)
        if m:
            flush()
            current_heading = (f'h{len(m.group(1))}', m.group(2).strip())
        else:
            current_body.append(line)
    flush()
    return sections


def has_cjk(text):
    return bool(re.search(r'[\u4e00-\u9fff]', text))


def strip_code_blocks(text):
    return re.sub(r'```[\s\S]*?```', '', text)


def normalize_heading(text):
    """Normalize heading text for fuzzy matching."""
    t = text.lower().strip()
    t = re.sub(r'[^\w\s]', '', t)
    return re.sub(r'\s+', ' ', t).strip()


def cjk_outside_code(text):
    """Return set of CJK characters found outside code blocks."""
    result = set()
    lines = text.split('\n')
    in_code = False
    for line in lines:
        if line.strip().startswith('```'):
            in_code = not in_code
            continue
        if not in_code:
            for ch in line:
                if '\u4e00' <= ch <= '\u9fff':
                    result.add(ch)
    return result


# ── detection: git-based ────────────────────────────────────────────


def detect_via_git(source_root: str, since: str = None):
    """Use git to find recently changed Chinese files.

    Args:
        source_root: Git repo root.
        since: Git revision range. If None, check last 5 commits.
    """
    try:
        if since:
            result = subprocess.run(
                ['git', 'diff', '--name-only', since],
                cwd=source_root, capture_output=True, text=True, timeout=15)
            if result.returncode != 0:
                return None, f'git error: {result.stderr.strip()}'
            files = [f for f in result.stdout.strip().split('\n') if f]
        else:
            seen = set()
            files = []
            for i in range(1, 6):
                result = subprocess.run(
                    ['git', 'diff', '--name-only', f'HEAD~{i}', f'HEAD~{i-1}'],
                    cwd=source_root, capture_output=True, text=True, timeout=15)
                if result.returncode == 0:
                    for f in result.stdout.strip().split('\n'):
                        f = f.strip()
                        if f and f not in seen:
                            seen.add(f)
                            files.append(f)
        return files, None
    except (subprocess.TimeoutExpired, FileNotFoundError) as e:
        return None, str(e)


def is_git_repo(path: str):
    try:
        r = subprocess.run(['git', 'rev-parse', '--git-dir'],
                           cwd=path, capture_output=True, timeout=5)
        return r.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def get_git_toplevel(path: str):
    r = subprocess.run(['git', 'rev-parse', '--show-toplevel'],
                       cwd=path, capture_output=True, text=True, timeout=5)
    return r.stdout.strip() if r.returncode == 0 else None


# ── detection: content-based ────────────────────────────────────────


def detect_via_content(source_root: str, output_root: str):
    """Find CN files whose content has drifted from EN.

    Heuristic: compare section structure and body length between CN and EN.
    A section is flagged when:
    - Section exists in CN but is missing in EN (new section)
    - EN section body is much shorter or longer than CN section body (ratio <0.4 or >2.5)
    - EN section still has CJK characters outside code blocks
    """
    changed = []
    for root, _dirs, files in os.walk(source_root):
        for f in files:
            if not f.endswith('.md'):
                continue
            cn_path = os.path.join(root, f)
            rel = os.path.relpath(cn_path, source_root)
            en_path = os.path.join(output_root, rel)
            if not os.path.exists(en_path):
                changed.append((rel, 'NEW'))
                continue

            with open(cn_path, encoding='utf-8') as fp:
                cn_content = fp.read()
            with open(en_path, encoding='utf-8') as fp:
                en_content = fp.read()

            # If EN still has CJK outside code blocks, it's out of sync
            if cjk_outside_code(en_content):
                changed.append((rel, 'CJK_RESIDUE'))
                continue

            cn_sections = split_sections(cn_content)
            en_sections = split_sections(en_content)

            if not cn_sections and not en_sections:
                continue

            # Check section count mismatch
            if abs(len(cn_sections) - len(en_sections)) > 2:
                changed.append((rel, f'SECTION_MISMATCH cn={len(cn_sections)} en={len(en_sections)}'))
                continue

            # Index EN sections by heading
            en_map = {}
            for sec in en_sections:
                _, htext, body = sec
                key = normalize_heading(htext)
                en_map[key] = body

            for sec in cn_sections:
                _, htext, body = sec
                key = normalize_heading(htext)

                en_body = en_map.get(key)
                if en_body is None:
                    # Try fuzzy match
                    for ek, eb in en_map.items():
                        if key and ek and (key in ek or ek in key):
                            en_body = eb
                            break

                if en_body is None and htext:
                    # Section exists in CN but not in EN
                    changed.append((rel, f'NEW_SECTION: {htext}'))
                    break

                if en_body and body and htext:
                    cn_clean = strip_code_blocks(body)
                    en_clean = strip_code_blocks(en_body)
                    if cn_clean.strip() and en_clean.strip():
                        ratio = len(cn_clean) / max(len(en_clean), 1)
                        # Flag when CN is much longer (updated) or EN is tiny
                        if ratio > 3.0 or (ratio > 2.0 and len(en_clean) < 50 and len(cn_clean) > 100):
                            changed.append((rel, f'CN_EXPANDED {ratio:.1f}x: {htext}'))
                            break
    return changed


# ── consistency check ───────────────────────────────────────────────


def check_consistency(source_root: str, output_root: str):
    """Run consistency check on ALL file pairs.

    Returns list of issues: (file, type, detail)
    """
    issues = []
    pairs = 0
    for root, _dirs, files in os.walk(source_root):
        for f in files:
            if not f.endswith('.md'):
                continue
            cn_path = os.path.join(root, f)
            rel = os.path.relpath(cn_path, source_root)
            en_path = os.path.join(output_root, rel)
            pairs += 1

            if not os.path.exists(en_path):
                issues.append((rel, 'MISSING', 'English file does not exist'))
                continue

            with open(cn_path, encoding='utf-8') as fp:
                cn_content = fp.read()
            with open(en_path, encoding='utf-8') as fp:
                en_content = fp.read()

            # Check 1: Chinese residue & formatting in English (outside code blocks)
            cjk = cjk_outside_code(en_content)
            if cjk:
                chars = ''.join(sorted(cjk))[:50]
                issues.append((rel, 'CJK_RESIDUE', f'Chinese chars in EN: {chars}'))

            # Check 1a: Chinese punctuation in English (outside code blocks)
            cn_punct_pattern = re.compile(r'[\u3000-\u303f\u300a\u300b\u300c\u300d\u300e\u300f\u3010\u3011\uff00-\uffef]')
            punct_issues = []
            for i, line in enumerate(en_content.split('\n'), 1):
                clean = re.sub(r'```[\s\S]*?```', '', line)
                m = cn_punct_pattern.search(clean)
                if m:
                    punct_issues.append(f'L{i}: {m.group()}')
            if punct_issues:
                issues.append((rel, 'CN_PUNCTUATION', '; '.join(punct_issues[:5])))

            # Check 1b: Missing spaces around markdown links in English text
            link_spacing = re.compile(r'(?<=[a-zA-Z0-9)\]])\[(?=[a-zA-Z])|(?<=[a-zA-Z0-9)\]])(?=\[)')
            for i, line in enumerate(en_content.split('\n'), 1):
                clean = re.sub(r'```[\s\S]*?```', '', line)
                if re.search(r'[a-zA-Z0-9)\]]\[', clean) or re.search(r'\][a-zA-Z]', clean):
                    issues.append((rel, 'LINK_SPACING', f'L{i}: missing space before/after link'))
                    break

            # Check 1c: Chinese period 。at end of English sentences
            for i, line in enumerate(en_content.split('\n'), 1):
                clean = re.sub(r'```[\s\S]*?```', '', line).strip()
                if clean.endswith('。') and not any(clean.startswith(p) for p in ['#', '|', '>', '-', '`']):
                    issues.append((rel, 'CN_PERIOD', f'L{i}: ends with 。'))
                    break

            # Check 2: Section structure
            cn_sections = split_sections(cn_content)
            en_sections = split_sections(en_content)

            if abs(len(cn_sections) - len(en_sections)) > 2:
                issues.append((rel, 'SECTION_COUNT',
                               f'CN has {len(cn_sections)} sections, EN has {len(en_sections)}'))

            # Check 3: Content ratio per section
            en_map = {}
            for sec in en_sections:
                _, htext, body = sec
                en_map[normalize_heading(htext)] = body

            for sec in cn_sections:
                _, htext, body = sec
                if not htext or not body:
                    continue
                en_body = en_map.get(normalize_heading(htext))
                if en_body is None:
                    continue
                cn_clean = strip_code_blocks(body).strip()
                en_clean = strip_code_blocks(en_body).strip()
                if cn_clean and en_clean:
                    ratio = len(cn_clean) / max(len(en_clean), 1)
                    # Only flag when CN is much longer than EN
                    # (CN was expanded but EN not updated).
                    # Do NOT flag when EN is longer (natural in translation).
                    if ratio > 3.0:
                        issues.append((rel, 'CN_EXPANDED',
                                       f'{ratio:.1f}x longer in section "{htext[:40]}"'))
                        break
                    # Also flag if EN is extremely short compared to CN
                    # (suspect missing content)
                    if ratio > 2.0 and len(en_clean) < 50 and len(cn_clean) > 100:
                        issues.append((rel, 'CN_EXPANDED',
                                       f'CN={len(cn_clean)} vs EN={len(en_clean)} chars in "{htext[:40]}"'))
                        break

    return pairs, issues


# ── main ────────────────────────────────────────────────────────────


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Sync diff for CN→EN docs')
    parser.add_argument('source_dir', help='Chinese source directory')
    parser.add_argument('output_dir', help='English output directory')
    parser.add_argument('--detect', action='store_true', help='Detect changed Chinese files')
    parser.add_argument('--check', action='store_true', help='Full consistency check')
    parser.add_argument('--sync', metavar='FILE', help='Output sync data for a changed files list')
    parser.add_argument('--since', metavar='REVISION',
                        help='Git revision for --detect (e.g. HEAD~3, <commit>..HEAD)')
    args = parser.parse_args()

    source_root = os.path.abspath(args.source_dir)
    output_root = os.path.abspath(args.output_dir)

    if args.check:
        print(f'{"="*60}')
        print(f'  Consistency Check')
        print(f'  Source: {source_root}')
        print(f'  Output: {output_root}')
        print(f'{"="*60}')
        pairs, issues = check_consistency(source_root, output_root)
        print(f'\n  Files checked: {pairs}')
        print(f'  Issues found:  {len(issues)}')
        if issues:
            print()
            for rel, itype, detail in issues:
                print(f'  [{itype}] {rel}')
                print(f'           {detail}')
        else:
            print('\n  ✅ All files are consistent.')
        return

    if args.detect:
        print(f'{"="*60}')
        print(f'  Change Detection')
        print(f'  Source: {source_root}')
        print(f'  Output: {output_root}')
        print(f'{"="*60}')

        # Try git first
        if is_git_repo(source_root):
            git_root = get_git_toplevel(source_root)
            print(f'\n  Git repo detected at: {git_root}')
            git_files, err = detect_via_git(source_root, since=args.since)
            if git_files is not None:
                # Filter to only zh-cn/application-dev files
                prefix = os.path.relpath(source_root, git_root)
                changed = []
                for f in git_files:
                    full = os.path.normpath(f)
                    if full.startswith(prefix) and f.endswith('.md'):
                        rel = os.path.relpath(full, prefix)
                        changed.append((rel, 'GIT'))
                if changed:
                    print(f'\n  📋 Files changed in last commit: {len(changed)}')
                    for rel, src in changed:
                        print(f'     {rel}')
                else:
                    print('\n  No Chinese files changed in last commit.')
                # Write changed file list for --sync
                list_path = os.path.join(os.path.dirname(output_root), 'sync_changed.txt')
                with open(list_path, 'w') as fp:
                    for rel, _ in changed:
                        fp.write(rel + '\n')
                print(f'\n  File list written to: {list_path}')
                return
            else:
                print(f'  Git detection failed: {err}')

        # Fallback: content-based
        print('  No git history available, using content-based detection...')
        changed = detect_via_content(source_root, output_root)
        if changed:
            print(f'\n  📋 Files possibly out of sync: {len(changed)}')
            for rel, reason in changed:
                print(f'     [{reason}] {rel}')
            list_path = os.path.join(os.path.dirname(output_root), 'sync_changed.txt')
            with open(list_path, 'w') as fp:
                for rel, _ in changed:
                    fp.write(rel + '\n')
            print(f'\n  File list written to: {list_path}')
        else:
            print('\n  No files detected as out of sync.')
        return

    if args.sync:
        changed_list_path = args.sync
        if not os.path.exists(changed_list_path):
            print(f'Error: changed file list not found: {changed_list_path}')
            sys.exit(1)
        with open(changed_list_path) as f:
            changed_files = [l.strip() for l in f if l.strip()]

        print(f'{"="*60}')
        print(f'  Sync Output — {len(changed_files)} files')
        print(f'{"="*60}')

        sync_dir = os.path.join(os.path.dirname(output_root), 'sync_data')
        os.makedirs(sync_dir, exist_ok=True)
        out_path = os.path.join(sync_dir, f'sync_{int(time.time())}.txt')

        count = 0
        with open(out_path, 'w', encoding='utf-8') as out:
            for rel in changed_files:
                cn_path = os.path.join(source_root, rel)
                en_path = os.path.join(output_root, rel)
                if not os.path.exists(cn_path):
                    continue
                with open(cn_path, encoding='utf-8') as f:
                    cn_content = f.read()
                out.write(f'# FILE: {rel}\n')
                out.write(f'# --- Chinese source ---\n')
                out.write(cn_content)
                out.write('\n\n---\n\n')
                count += 1

        print(f'\n  {count} files written to: {out_path}')
        print(f'  Translate each file above and write to the output path.')
        return

    print('Specify --detect, --check, or --sync <file>.')
    sys.exit(1)


if __name__ == '__main__':
    main()
