---
name: aet-doc-translator
description: "Document and folder translation skill. Default direction is Chinese to English. Use when the user wants to translate documents (any text-based format: .md, .txt, .html, .docx, etc.) from one language to another. Supports three modes: (1) Full translation — translate entire document, single file outputs _en suffixed file in same dir, folder outputs to sibling _en folder with original filenames; (2) Incremental translation — document mixes English with Chinese, translate only Chinese portions, modifies files in-place; (3) Sync translation — user modified Chinese file, sync the corresponding English file at a specified English folder path (same relative path), section-by-section compare and update, create English file if missing. User may specify custom output location for folder translation. Supports single file and recursive folder batch translation. Preserves all original formatting. For long documents, splits by headings for chunk-by-chunk translation with cross-chunk context."
---

# Aet Doc Translator

## Mode Selection

- **Full translation**: Source document is entirely (or predominantly) in Chinese. Translate the whole document to English.
- **Incremental translation**: Source document mixes English and Chinese. Identify Chinese text portions and translate only those to English. Existing English text stays untouched.
- **Sync translation**: User modified Chinese files. Update corresponding English files under a specified English root folder (same relative path). Compare section-by-section; if they mismatch, re-translate and update. Create English file with full directory structure if not found.

## Core Rules

- **Default direction**: Chinese → English. Use user-provided language pair otherwise.
- **Preserve all formatting**: headings, paragraphs, lists, tables, code blocks, inline code,
  links, images, bold/italic, blockquotes, horizontal rules. Only translate text content.
  Never modify structure, markup, or non-text elements.
- **Word spacing in translations**: Chinese text has no word spacing. English translations
  MUST have proper spaces between words. For example, `# 应用开发导读` → `# Application
  Development Guide` (NOT `# ApplicationDevelopmentGuide`). Check each heading/paragraph
  after translation to ensure words are separated by spaces.
- **Long document handling**: Split by `##` or `###` headings. Translate chunk-by-chunk,
  reading previous chunk before translating the next to maintain terminology and style consistency.
  Keep a running glossary of key terms across chunks.
- **Code blocks**: Never translate code or code block content. Only translate surrounding text.
- **Post-translation verification**: After writing each output file, run:
   1. **Chinese residue & formatting check**: Scan the output for any Chinese text or Chinese punctuation outside code blocks. This catches incomplete translations and formatting issues:
      - **CJK characters** (U+4E00–U+9FFF) → incomplete translation.
      - **Chinese punctuation**（， 。、：；？！【】（）「」""）→ should use English equivalents.
      - **Missing spaces around markdown links** (e.g., `word[link](url)word` → should be `word [link](url) word`).
      - **Missing spaces around inline code** (e.g., `word`text``word` → should be `word ``text`` word`).
      - **Chinese-style CJK punctuation mixed in English sentences** (e.g., `。` at end of English sentence).
      
      Note: Chinese inside code blocks (string literals, example data) is legitimate and should NOT be flagged.

   2. **Structural match check**: Compare heading count, code block count, and total line count between source and output. Large mismatches indicate a translation error (e.g., collapsed content). Re-translate the file if counts diverge significantly. ⚠️ Minor heading count mismatches (±1–5) are common and do NOT necessarily indicate an error — translators may split or merge sections for readability. The `validate_links.py` script warns about these but still builds partial heading maps for the matching headings.
   3. **Link validation**: Run the link validation script (`scripts/validate_links.py`) to detect and fix broken internal links. After the first pass, follow the [Post-Fix Residual Handling](#post-fix-residual-handling) workflow for remaining issues.
   4. **Content consistency check**: Run `scripts/sync_diff.py` to verify that every Chinese section has a corresponding English translation and no sections diverge significantly in content volume. This detects:
      - Missing English files.
      - Chinese characters remaining in English (incomplete translation).
      - Section structure mismatches (headings added/removed in Chinese but not reflected in English).
      - Chinese sections that have been significantly expanded without English updates.
      ```bash
      python3 /path/to/skills/doc-translator/scripts/sync_diff.py <source_dir> <output_dir> --check
      ```
   5. **Directory cleanup**: Delete backup files (`.bak`, `.orig`, `~`), artifacts (`.DS_Store`), and any other files not present in the source directory. Verify that the output mirrors the source exactly (same set of files at the same relative paths).
   6. **Translation log**: After any translation/sync/incremental operation completes, **always** write a log file named `{output_dir_name}_sync.log` in the same parent directory as the output folder (or, for incremental/in-place mode, in the source directory's parent). The log contains:
       
       **a) Operation summary** — mode, source, target, timestamp:
       ```
       ============================================================
         Sync Translation
         Source: source_zh_cn/
         Target: source_en/
         Time: 2026-06-17
       ============================================================
       ```
       
       **b) Modified files** — every file touched, with what was done:
       ```
       [MODIFIED] cmd-tools/cjdb_manual.md
           → Added 3 new sections (thread switching, thread control, Python extension)
       [FIXED]   cmd-tools/cjfmt_manual.md
           → Replaced 7 instances of Chinese brackets 【】 with **bold**
       [ADDED]   cmd-tools/cjpm_manual.md
           → Added 12 sections (bundle, publish, organization, ...)
       [UNCHANGED] cmd-tools/cjprof_manual.md
           → Already in sync
       ```
       
       **c) Verification results** — per-file pass/fail from all checks:
       ```
       [PASS] command_line_overview.md — CJK residue: 0, links: 0
       [PASS] cmd-tools/cjpm_manual.md — CJK residue: 0, links: 0
       ```
       
       **d) Remaining issues** (only if any exist), with classification:
       ```
       [BROKEN_LINK] cmd-tools/cjpm_manual.md L270 — anchor not found
       ```
       If zero issues, replace this section with: `No issues found.`
       
       Collect issue data from validators:
       ```bash
       python3 /path/to/skills/doc-translator/scripts/validate_links.py <source_dir> <output_dir> --scope-only 2>&1 | grep "^  \["
       python3 /path/to/skills/doc-translator/scripts/sync_diff.py <source_dir> <output_dir> --check 2>&1 | grep "^  \["
       ```

## Prohibited: Dictionary/Pattern-Based Scripts

**DO NOT write Python (or any) dictionary-based translation scripts.** Past attempts at
pattern/script-based translation produced garbled output (e.g., `泛typeArrayasCollectionEx子type`),
where individual Chinese words were replaced with English but the sentence structure broke.

The only acceptable approach is **direct LLM translation**: read a source file, translate it
in its entirety using your language capabilities, write the output.

⚠️ **RULE**: You may write a script ONLY for directory mirroring / file listing. You must
NOT write a script that does any translation work. Translate each file individually using
the Read and Write tools.

## Link Handling

When headings are translated from Chinese to English, auto-generated anchor IDs change (e.g., `#接口` → `#interfaces`). Any internal cross-reference links pointing to those anchors become broken. This section defines how to handle anchor updates and link rewriting systematically.

### Anchor Generation Rule

Use the **GFM (GitHub-Flavored Markdown)** anchor algorithm for prediction:
1. Take heading text, strip `#` markers.
2. Remove inline code backticks (code text treated as plain text).
3. Convert to lowercase.
4. Remove any character that is not `[a-z0-9_-]`, space, or hyphen.
5. Replace spaces with hyphens. Existing hyphen runs are preserved (e.g., `--flag` stays as `--flag`).
6. If two headings produce the same anchor, the second gets suffix `-1`, third `-2`, etc.
7. ⚠️ **Do NOT remove HTML tags or angle brackets** — `<T>` in headings like `func foo<T>` is literal text, not HTML. The `[^\w\s-]` removal in step 4 handles `<`, `>` automatically.

### Heading Map

For each source/output file pair, build a heading map `{old_anchor: new_anchor}` to use for link rewriting:

```
# 接口            →  # Interfaces        →  map: "接口" → "interfaces"
# 功能：          →  # Description:      →  map: "功能" → "description"
```

Store these maps keyed by output file path for cross-file lookups.

### Link Rewriting Process

After all files in a batch are translated, rewrite links:

1. **Collect** all heading maps from every source→output file pair in the output directory.
2. **For each output file**, scan every markdown link URL:
   - If the URL has an anchor fragment (`file.md#旧锚点` or `#旧锚点`):
     - Resolve the file part to an absolute path within the output directory.
     - Look up that file's heading map.
     - If the old anchor exists in the map, replace it with the new anchor.
   - If the URL is a relative path to a `.md` file that exists in the source but not in the output: the file was not translated, leave the link as-is (still points to the Chinese original).
3. **Handle link text separately**: The link's display text may also contain heading references (e.g., `[接口](#接口)`), but the display text is translated during normal content translation. Only the URL fragment needs map-based correction.
4. **Report unresolved links to the user**: After the link validation script runs, if there are remaining broken links (e.g., cross-package links pointing to untranslated docs), collect and present them to the user. Ask whether they want to:
   - **Accept them** as-is (will be fixed when those packages are translated later).
   - **Translate the referenced packages** now so links can be fully resolved.
   - **Strip or change the links** in some other way.

Reference-style link definitions (``[ref]: url``) must also be scanned and updated.

### Link Validation Script

A Python script at `scripts/validate_links.py` (in this directory) validates
all internal links in the output directory, reports broken links, and optionally fixes anchor
fragments automatically. The embedded code in previous versions of this SKILL.md has been
moved to the standalone file; see `scripts/validate_links.py` for the full implementation.

```bash
python3 /path/to/skills/doc-translator/scripts/validate_links.py <source_dir> <output_dir> [--fix] [--scope-only]
```

The script:
1. Walks source/output file pairs and builds heading maps `{old_anchor → new_anchor}` by comparing heading text at the same index.
2. Rewrites link URL fragments using these maps (`--fix`).
3. Validates all internal links by resolving each URL to a file + anchor, checking existence.
4. For cross-package links pointing to files outside the output scope, indexes the target file on demand and validates anchors.
5. Supports `--scope-only` to ignore cross-package broken links (expected until those packages are also translated).

### Post-Fix Residual Handling

After `--fix` runs, remaining broken links typically fall into these categories:

#### 1. Already-English Anchors (Most Common)

Links reference English-like anchor IDs (e.g., `#obtaining-uiability-context-information`) that do not match the actual GFM anchor (`#obtain-the-context-information-of-uiability`). The heading map approach cannot fix these because the old anchor in the link is English, not Chinese — so it never matches any key in the `{Chinese_anchor → English_anchor}` map.

**Fix**: For each broken anchor, compute the correct GFM anchor from the actual heading text in the target file, then replace. Use a fuzzy match by extracting all heading anchors from the target file and finding the best word-overlap match (threshold ≥ 0.4). See `scripts/fix_residual_anchors.py` for a reference implementation.

#### 2. Spaces or Invalid Characters in URL Fragments

Some anchors contain spaces (e.g., `#Example Code`) or garbled text (`#enum-sc, and uty`). These are typically translation errors where the link text was partially translated.

**Fix**: Replace spaces with hyphens, lowercase, and strip non-word characters matching the GFM algorithm. Look up the result against the target file's heading anchors.

#### 3. Cross-Package Wrong Paths

Links pointing outside the output directory with paths that don't resolve correctly after translation (e.g., `../../application-dev/security/...` when the English files are at `../security/...`).

**Fix**: Determine the correct relative path from the source file to the target file within the output directory structure and update the link URL.

#### 4. False Positives: Code/Type Syntax

Language-specific syntax in headings can be misidentified as markdown links. Common cases:
- Constructor syntax: `### MyClass() [constructor]` — the `[constructor]` pattern looks like a markdown link `[text](url)` but is actually a code annotation.
- Inline code references to types like `std::vector<int>`.

**Check**: Verify the context around each "broken" link. If it's inside a heading or code block, it's a false positive — skip it.

### Link Repair Workflow

For best results, follow this iterative process:

1. **First pass**: `validate_links.py <source_dir> <output_dir> --fix --scope-only`
2. **Categorize remaining**: Group remaining broken links by type (anchor mismatch, path error, false positive).
3. **Second pass (fuzzy fix)**: For anchor mismatches, compute the correct GFM anchor from the target file's heading text and replace. A Python script using `validate_links.generate_anchor()` and `extract_headings()` is recommended — this is NOT a translation script, only a link-rewriting script (allowed).
4. **Third pass (targeted)**: Fix cross-package paths, space-containing anchors, and other stragglers manually or with `sed`.
5. **Verify**: Run `validate_links.py` again to confirm all fixable links are resolved. Remaining issues should be either pre-existing source errors or false positives.

## Full Translation

Translate every text portion from source language to target language.

⚠️ **CRITICAL: Do NOT write translation scripts.** For each file, read the source with the
Read tool and translate it using your LLM capabilities, then write the output with the Write
tool. Writing dictionary/pattern scripts produces garbled text.

### Single File

1. Walk the source directory to find all files. For each file:
   a. **Read** the full source file.
   b. Determine if document is long (≥20 headings or >200 lines). If yes, split by `##` or
      `###` headings, translate chunk-by-chunk, reading previous chunk for context before
      translating the next.
   c. **Write** the translated result to the output path.
2. Output location for single file: `{basename}_en{ext}` in the **same directory**.
   - `docs/guide.md` → `docs/guide_en.md`
3. **Verify**: Run post-translation verification (residual Chinese check + structural match).
   For single files with internal anchor links, also run link validation. Fix issues if found.
4. **Log**: Write translation log (see Core Rules §6).

### Folder (Recursive)

1. Walk the source directory recursively. For each `.md` file found:
   a. Compute the output path by mirroring the subdirectory structure under the output root.
   b. **Read** the full source file.
   c. **Translate** using your LLM capabilities (chunk-by-chunk for long docs).
   d. **Write** the result to the output path.
2. **Default output**: create sibling `{source_dir_name}_en` directory at the same level
   as the source folder. Mirror the full subdirectory structure exactly.
   - `zh-cn/application-dev/` → `zh-cn/application-dev_en/`
   - `docs/guide.md` → `docs_en/guide.md`
   - `a/b/c/` → `a/b/c_en/`; `a/b/c/file.md` → `a/b/c_en/file.md`
3. **Custom output**: if user specifies an output path, write there instead (same
   subdirectory structure and original filenames).
4. **Parallel processing**: For large folders (>30 files), dispatch subdirectory batches
   to separate tasks. Each task handles 10-20 files per batch. Do NOT consolidate files
   into a single batch.
5. **Verify**: After all files are written, run:
    a. **Chinese residue & formatting check** on every output file. Check for CJK characters,
       Chinese punctuation（，。、：；？！【】（）「」""）, missing spaces around links/inline code,
       and mixed Chinese-English fragments. Fix all issues found. Note: Chinese inside code
       blocks (string literals, example data) is legitimate and should NOT be flagged.
    b. **Structural match**: compare heading count, code block count, line count between
       source and output. Re-translate if counts diverge significantly.
    c. **Link validation**: Run `scripts/validate_links.py <source_dir> <output_dir> --fix`
       to detect and fix broken anchors, then run the [Post-Fix Residual Handling](#post-fix-residual-handling)
       workflow for remaining issues.
     d. **Sentence-by-sentence matching**: For each file, split Chinese content into sentences (by `。！？；` or newline), excluding code blocks. Verify each Chinese sentence has a corresponding English translation in the output. Flag any sentence where:
        - The entire sentence is missing from the English output.
        - Key Chinese terms (>3 CJK characters) have no counterpart in the English section.
        Use the content line ratio check from `sync_diff.py --check` as a proxy; a section with CN:EN ratio > 1.5 likely has untranslated sentences.
     e. **Content consistency check**: Run `scripts/sync_diff.py <source_dir> <output_dir> --check`
       to verify section-level match, formatting quality, and Chinese residue/punctuation.
6. **Directory cleanup**: After verification, run a file-level diff between source and output:
    - Delete any **backup files** (`.bak`, `.orig`, `~` suffix) created by `sed` or other
      editing tools.
    - Delete any **artifacts** (`.DS_Store`, `Thumbs.db`, temp files, report files,
      `__pycache__/`) not present in the source directory.
    - Delete any **process/script files** generated during translation work (e.g.,
      temporary fix scripts, pattern-based translation templates, `sync_data/`
      directory with intermediate sync output) that are not part
      of the skill's permanent toolset.
    - **Verify file parity**: Compare the full file listing (not just `.md`) between source
      and output. The output should mirror the source exactly. Any extra files should be
      removed; any missing files should be flagged.
   ```bash
   python3 -c "
   import os
   src, out = '$source_dir', '$output_dir'
   src_set = set()
   out_set = set()
   for r, _, fs in os.walk(src):
       for f in fs:
           if not f.startswith('.'):
               src_set.add(os.path.relpath(os.path.join(r, f), src))
   for r, _, fs in os.walk(out):
       for f in fs:
           if not f.startswith('.'):
               out_set.add(os.path.relpath(os.path.join(r, f), out))
   extra = out_set - src_set
   missing = src_set - out_set
   if extra: print('EXTRA files:', *sorted(extra), sep='\\n  ')
   if missing: print('MISSING files:', *sorted(missing), sep='\\n  ')
   if not extra and not missing:
       print('Output directory mirrors source exactly.')
   "
   ```
 7. **Log**: Write translation log (see Core Rules §6).

## Incremental Translation

Input documents are a mix of English and Chinese. Identify Chinese text spans and translate only those segments to English, keeping all existing English content untouched.

### Detection Logic

Scan the document for CJK Unified Ideographs (U+4E00–U+9FFF). For each paragraph or sentence:
- Contains Chinese → extract Chinese spans, translate each, replace in place
- No Chinese → leave paragraph entirely unchanged

### Chunking for Long Documents

Same split-by-heading strategy as full translation. However, within each chunk, only process paragraphs that contain Chinese characters. Completely English paragraphs require no work.

### Paragraph-Level Preservation

Within a mixed-language paragraph (e.g., `"English lead-in 中文内容 more English"`), identify each contiguous Chinese span, translate it with the surrounding English as context, and substitute the translation into the original position. The non-Chinese parts of the paragraph remain verbatim.

### Single File

Overwrite the original file directly with the translated result. No separate output file.
- `docs/report.md` → (in-place modification of `docs/report.md`)
4. **Verify**: Run post-translation verification (residual Chinese check + structural match + link validation) on the modified file. Fix issues if found.
5. **Log**: Write translation log (see Core Rules §6). Log file name: `{parent_dir_name}_sync.log` in the parent directory of the modified file.

### Folder (Recursive)

Walk the source directory recursively. For each file, identify Chinese portions and translate them, then overwrite each file in-place. No separate output directory. All files within the original folder structure are modified directly.
- `docs/` → (each file in `docs/` modified in-place)
- **Verify**: After all files are processed, run post-translation verification (residual Chinese check + structural match + link validation) on every modified file. Fix issues if found.
- **Log**: Write translation log (see Core Rules §6). Log file name: `{source_dir_name}_sync.log` in the parent directory of the source folder.

## Sync Translation

User provides:
1. **Chinese source** (file or folder path) — where the modified Chinese documents are
2. **English folder** — the root directory where corresponding English files live

Map each Chinese file to its English counterpart by matching the relative path under the English folder. For example:
- Chinese file: `source_zh-cn/hello/123/my.md`
- English folder: `en/`
- Expected English file: `en/hello/123/my.md`

### Change Detection

Use `scripts/sync_diff.py` to identify which Chinese files need syncing:

```bash
# If source is a git repo (recommended):
python3 /path/to/skills/doc-translator/scripts/sync_diff.py <source_dir> <output_dir> --detect --since HEAD~5

# If no git history available (content-based heuristic):
python3 /path/to/skills/doc-translator/scripts/sync_diff.py <source_dir> <output_dir> --detect
```

The script checks:
- **Git mode**: Runs `git diff` from the source directory (which must be inside a git repo). Only files under the source dir's relative path within the repo are reported.
- **Content mode (fallback)**: Compares section structure and content volume between CN and EN to find out-of-sync files.

Then output the changed Chinese content for translation:
```bash
python3 /path/to/skills/doc-translator/scripts/sync_diff.py <source_dir> <output_dir> --sync <changed_files_list>
```

This writes Chinese source files to `sync_data/sync_<timestamp>.txt` for batch LLM translation.

### Single File

1. Compute the relative path of the Chinese file within its parent, then resolve it under the English folder.
2. If the English file **exists** at that path:
   - Read both files.
   - Split both into aligned sections by heading structure (`##`).
   - For each section pair: perform **sentence-by-sentence matching**. Split the Chinese section into sentences (by `。`, `！`, `？`, `；`, or newline), and verify each sentence has a corresponding English translation. For each unmatched Chinese sentence:
     - If the English is missing that sentence entirely: translate and insert it at the correct position within the English section.
     - If the English translation is outdated or inaccurate: replace the corresponding English span with a fresh translation.
   - If a Chinese section has no matching English section: translate and insert it.
   - If an English section has no matching Chinese section: remove it.
3. If the English file **does not exist**:
   - Create all intermediate directories under the English folder.
   - Perform a **full translation** of the Chinese file into the new path.
4. **Verify**: Run post-translation verification (residual Chinese check + structural match + sentence-by-sentence matching + link validation + content consistency check) on every updated or created file. Fix issues if found.
5. **Log**: Write translation log (see Core Rules §6). Log file name: `{english_folder_name}_sync.log` in the parent directory of the english folder.

### Folder (Recursive)

1. Walk the Chinese source directory recursively.
2. For each file found, compute its relative path and resolve it under the English folder.
3. Process each file following the same single-file sync logic above.
4. **Verify**: After all files are synced, run post-translation verification (residual Chinese check + structural match + sentence-by-sentence matching + link validation + content consistency check) on every affected English file. Fix issues if found.
5. **Log**: Write translation log (see Core Rules §6). Log file name: `{english_folder_name}_sync.log` in the parent directory of the english folder.
