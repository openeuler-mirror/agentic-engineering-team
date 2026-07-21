---
name: aet-building-doc-mdbook
description: |
  Build HTML documentation from Markdown files using mdbook.
  Use this skill when the user wants to build documentation from markdown files,
  mentions "构建文档", "生成文档", "build docs", "编译文档", wants to generate
  HTML docs from markdown sources, or needs help setting up an mdbook project.
  Also trigger when the user references book.toml, SUMMARY.md, or mdbook build.
  Make sure to use this skill whenever the user has a collection of markdown files
  and wants to turn them into a browsable HTML documentation site, even if they
  don't explicitly mention "mdbook".
---

# mdbook Documentation Builder

Build HTML documentation from Markdown files using [mdbook](https://github.com/rust-lang/mdBook) — a popular static site generator for documentation.

This skill does **not** bundle mdbook binaries. It checks whether mdbook is already installed and, with user consent, installs it automatically from the network.

## Files in this skill

- `SKILL.md` — This skill definition

## Workflow

### Step 1: Understand the user's project structure

Use the `question` tool to ask the user about their markdown documentation project. Collect at minimum:

1. **Source directory** — Where are the markdown files located? (absolute path)
2. **Project name / title** — What is the documentation project called?
3. **Output directory** — Where should the built HTML go? (default: `book/` under source directory)

Also inform the user that a standard mdbook project requires these files:

| File | Purpose | Required |
|------|---------|----------|
| `book.toml` | mdbook configuration (title, author, theme, plugins, etc.) | Yes (generated if missing) |
| `src/SUMMARY.md` | Table of contents — defines the chapter hierarchy | Yes (must exist) |
| `src/*.md` | Chapter markdown files referenced in SUMMARY.md | Yes (must match SUMMARY.md) |
| `src/images/` or `src/assets/` | Images and other static assets | Optional |

If the user does **not** have a `book.toml`, offer to generate one for them with sensible defaults. If they do not have a `src/SUMMARY.md`, ask them to describe their chapter structure and generate it.

### Step 2: Check if mdbook is installed

Run this to detect mdbook:

```bash
command -v mdbook && mdbook --version
```

If `mdbook` is found, record its version and skip to Step 4.

If `mdbook` is **not** found, proceed to Step 3.

### Step 3: Install mdbook (with user consent)

Ask the user for permission to install mdbook. If they consent, detect the platform and install accordingly:

**macOS (Homebrew):**
```bash
brew install mdbook
```

**Linux / macOS / Windows (via Cargo, requires Rust toolchain):**
```bash
cargo install mdbook
```

**Linux (Debian/Ubuntu via apt):**
```bash
apt-get install -y mdbook
```

**Download pre-built binary (any platform):**
Determine the platform with `uname -s` and `uname -m`, then download the correct release from https://github.com/rust-lang/mdBook/releases/latest:

| Platform | URL pattern |
|----------|-------------|
| macOS x86_64 | `https://github.com/rust-lang/mdBook/releases/latest/download/mdbook-v*-x86_64-apple-darwin.tar.gz` |
| macOS ARM64 | `https://github.com/rust-lang/mdBook/releases/latest/download/mdbook-v*-aarch64-apple-darwin.tar.gz` |
| Linux x86_64 | `https://github.com/rust-lang/mdBook/releases/latest/download/mdbook-v*-x86_64-unknown-linux-gnu.tar.gz` |
| Linux ARM64 | `https://github.com/rust-lang/mdBook/releases/latest/download/mdbook-v*-aarch64-unknown-linux-gnu.tar.gz` |
| Windows x86_64 | `https://github.com/rust-lang/mdBook/releases/latest/download/mdbook-v*-x86_64-pc-windows-msvc.zip` |

If the user declines auto-install, provide manual guidance:
- Download the correct binary from https://github.com/rust-lang/mdBook/releases
- Extract and place `mdbook` (or `mdbook.exe`) in a directory listed in PATH
- Run `mdbook --version` to verify

After installation, verify with `mdbook --version`.

### Step 4: Validate the project structure

Navigate to the source directory and verify:

```bash
# Must exist
test -f book.toml || echo "MISSING: book.toml"
test -f src/SUMMARY.md || echo "MISSING: src/SUMMARY.md"
```

If `book.toml` is missing, generate a minimal one:

```bash
cat > book.toml << 'EOF'
[book]
title = "<user-provided-title>"
authors = ["<user-name-or-unknown>"]
language = "en"
multilingual = false
src = "src"

[output.html]
no-section-label = false
git-repository-url = ""
edit-url-template = ""
EOF
```

If `src/SUMMARY.md` is missing, work with the user to enumerate their chapters and generate it.

### Step 5: Build the documentation

```bash
cd <source-directory>
mdbook build
# Optionally with a custom output directory:
# mdbook build --dest-dir <output-directory>
```

### Step 6: Report the result

Tell the user:
- Whether the build succeeded or failed (check the exit code)
- The output path (default: `<source-directory>/book/` or the custom output directory)
- How to view the docs: open `<output-dir>/index.html` in a browser
- If the build failed, show the error output and suggest fixes (e.g., missing markdown files referenced in SUMMARY.md)

## Notes

- If the user has an existing mdbook project, Steps 1 and the file generation parts of Step 4 can be skipped. Ask them to confirm they just want to build.
- The skill can also serve the documentation locally: `mdbook serve --open` starts a local HTTP server and opens the browser.
- For advanced mdbook configuration (plugins, themes, custom CSS), refer to https://rust-lang.github.io/mdBook/
