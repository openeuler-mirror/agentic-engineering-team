---
name: aet-generating-readme
description: Generate comprehensive README documentation for code repositories. Use this skill when the user wants to create, update, or improve a README.md file for any codebase. Triggers on requests like "generate README", "create repository documentation", "write README for this project", "add project documentation", or when analyzing a repository that lacks proper documentation. This skill analyzes codebase structure, reads existing docs if available, and produces polished README with project title, description, core challenges, core features, demo/screenshots, quick start, project structure, roadmap, and license sections. This skill generates bilingual README files (README.md in English and README_zh.md in Chinese) by default.
---

# README Generator

Generate high-quality bilingual README documentation (English and Chinese) for any code repository by analyzing the codebase and existing documentation.

## Key Requirements

1. **Bilingual Output**: Generate both English (README.md) and Chinese (README_zh.md) README files by default
2. **Chinese Interaction Language — CRITICAL**: All user-facing interactions during the process MUST be in Chinese. This includes, but is not limited to:
   - All `question` tool calls (Question, Header, Options text)
   - All informational messages and notifications sent to the user
   - All content displayed to users for confirmation or review
   - The final report/completion message
   - Any error messages or guidance messages

   **Rule**: If the user can see it in the terminal, it MUST be in Chinese. This applies regardless of the final output language (README.md may be English, but all user communication during generation is in Chinese).
3. **Image Support**: Check for images in figures/, images/, docs/images/ directories and include them with detailed descriptions
4. **Image Description Format**: Every image must have a 2-4 sentence description explaining what it shows, key elements visible, and how it helps users understand the project

## Workflow

### Pre-Step: Scan Repository for Existing README

**This pre-step runs for all intents. It scans the repository for existing README files and determines the generation path.**

1. **Scan for README.md**: Use `glob` to search for `README.md` at the repository root.

2. **If README.md exists**:
   - Inform the user: "已检测到仓库中存在 README.md 文件。"
   - Depending on user intent:
     - **"生成/创建/generate" or unclear intent**: Use `question` tool to ask:
       - **Question**: "已检测到仓库中存在 README.md，您希望从零生成全新的 README，还是在已有的 README 基础上更新？"
       - **Header**: "选择操作"
       - **Options**:
         1. "从零开始生成" - 生成全新的 README 文件 → proceed to **Scenario A**
         2. "在已有README上更新" - 更新已有 README 内容 → proceed to **Scenario B**
     - **"更新/修改/update"**: Inform the user "将为您在现有 README 基础上进行更新。" and automatically proceed to **Scenario B**.

3. **If README.md does not exist**:
   - Inform the user: "仓库中暂无 README 文档。"
   - Depending on user intent:
     - **"生成/创建/generate" or unclear intent**: Inform the user "将为您从零开始生成全新的 README。" and automatically proceed to **Scenario A**.
     - **"更新/修改/update"**: "当前仓库中没有 README 文件，无法执行更新操作。是否改为从零生成？" Use `question` tool to ask:
       - **Question**: "当前仓库中没有 README 文件，无法执行更新操作。是否改为从零生成？"
       - **Header**: "无法更新"
       - **Options**:
         1. "改为从零生成" - Switch to scratch generation → proceed to **Scenario A**
         2. "取消" - Terminate the process

**IMPORTANT**: Do NOT proceed until the generation mode is determined.

---

### Scenario A [Scratch]: Supplementary Content Confirmation

After user selects "从零开始生成", use `question` tool to ask:

- **Question**: "生成文档默认会扫描整个仓库，为了生成更丰富的文档，是否有要补充的内容？如果有请输入本地路径（文件或目录路径），如果没有请选择跳过。"
- **Header**: "补充内容"
- **Options**:
  1. "补充内容" - 输入本地文件或目录路径作为补充材料
  2. "跳过" - 不需要补充内容，直接继续

When user selects **"补充内容"**: The `question` tool automatically shows a "Type your own answer" input. The user enters a local file or directory path. Record this path and use it in Step 1 (read content from that path as supplementary material). The repository scan still runs as usual.

When user selects **"跳过"**: Proceed to Step 1 directly.

**Note**: If a path is provided, read the content from that path during Step 1 and incorporate it into the README generation.

---

### Scenario B [Update]: Collect Update Requirements

When user selects "在已有README上更新", follow this interactive process:

**Scenario B1: Input update description**

Use the `question` tool to ask:
- **Question**: "请输入您想要更新的内容描述（例如：核心功能增加一个功能点、添加新的API接口等）"
- **Header**: "更新内容"
- **Options**:
  1. "输入更新描述" - 输入更新内容的详细描述
  2. "跳过" - 不提供更新描述，自动识别需更新的部分

When user selects **"输入更新描述"**: The `question` tool automatically shows a "Type your own answer" input. The user enters the update description. Use it as the update description and proceed to B2.

When user selects **"跳过"**: User doesn't provide description, skip B2 and B3, proceed directly to Step 1 → Step 3 → Step 4.

**Scenario B2: Ask for input content directory**

After collecting the update description, use the `question` tool to ask:
- **Question**: "为了更精准地更新，建议您提供相关的输入目录或文件路径作为参考。\n\n请选择："
- **Header**: "输入内容目录"
- **Options**:
  1. "提供目录路径" - 输入文件或目录路径作为参考
  2. "跳过" - 无具体目录，agent 将扫描仓库查找相关内容

When user selects **"提供目录路径"**: The `question` tool automatically shows a "Type your own answer" input. The user enters a directory or file path. Use it as the input directory or file path for reference.

When user selects **"跳过"**: Treat it as no directory provided.

**IMPORTANT**:
- **If user provided a valid directory** → Proceed directly to Step 4 (no need to explore the repo)
- **If user chose "跳过"** → Proceed to Step 1 (explore the repo), then Step 3 (analyze existing docs), then Step 4
- The collected update information will be used in Step 4 to guide the update process

---

### Step 1: Explore the Repository

**If user provided a supplementary content path in Scenario A's supplementary step**: Read the content from that path and incorporate it as supplementary material for README generation.

Explore the repository structure to understand:
- What type of project this is (library, framework, application, CLI tool, documentation repo, etc.)
- Programming languages and frameworks used
- Main entry points and core modules
- Configuration files and build systems

Use bash `ls` command to list directory contents:
- List root directory to see all top-level files and folders
- List docs/ subdirectory to see all documentation categories
- List any subdirectories inside docs/ to understand documentation structure

Use glob and grep to find:
- Package.json, Cargo.toml, pom.xml, go.mod, requirements.txt (dependencies)
- README.md, CONTRIBUTING.md, docs/ (existing documentation)
- Makefile, Dockerfile, docker-compose.yml (build/deployment)
- src/, lib/, main/, app/ (source code directories)
- test/, tests/, spec/ (test directories)

**IMPORTANT**: Always verify directory existence by listing them. Do NOT assume or infer directories that may not exist.

#### Check for Images (Required)

**You MUST check for images in the repository.** Look for image directories that may contain screenshots, diagrams, or architecture images:

- `figures/`, `images/`, `docs/images/`, `img/`, `assets/images/`
- Use `ls` to list these directories and note any existing image files (.png, .jpg, .svg, .gif)

For each image found:
1. Verify the image file exists
2. Note the relative path from repository root
3. Include in README using Markdown image syntax with detailed description

**Image Description Format** (REQUIRED for every image):
```markdown
![Image Title](path/to/image.png)

The image shows [what the image displays]. Key elements include [key features visible], which helps users understand [how this image aids comprehension].
```

Example:
```markdown
![Cangjie Architecture Overview](figures/architecture.png)

The architecture diagram illustrates the Cangjie compilation pipeline from source code to execution. It shows the compiler frontend parsing, type checking, and AST transformation, followed by the backend code generation targeting the runtime. This visual representation helps developers understand how their code flows through the system.
```

---

### Step 2: Fetch Repository Issues and Pull Requests (On-Demand)

This step is only triggered when information gathered from Steps 1 and 3 is insufficient to complete the README. It should NOT be triggered proactively - call it on-demand only when actually needed.

When the information collected from Steps 1 and 3 is insufficient to generate the README (e.g., missing feature details for roadmap, difficult to identify bug patterns from code), supplement using the following methods:

Use the `aet-operating-issues skill` and `aet-operating-pr skill` from the same directory to fetch Issue and Pull Request information:

1. **Use aet-operating-issues skill to fetch Issue information**:
   - Call aet-operating-issues skill to query Issues
   - Support filtering by labels: feature, enhancement, bug, documentation, etc.
   - Support filtering by status: opened, closed, all

2. **Use aet-operating-pr skill to fetch Pull Request information**:
   - Call aet-operating-pr skill to query PRs
   - Support filtering by status: open, closed, merged, all

**Extract key information**:
- Feature requests → Use for Core Features and Roadmap sections
- Bug reports → Use for Core Challenges section
- Common pain points mentioned in Issues → Use for Core Challenges
- User suggestions → Use for additional features or FAQ

**Citation format**:
```
Issue #123: [Feature] Add dark mode support
- User requested dark mode for better night-time usage
- Related to UI/UX enhancement
```

**Do NOT proactively fetch Issues/PRs.** Only call this step in these situations:
- Project description in code is unclear, and feature requests could help clarify
- Difficult to identify bug patterns from code, bug reports could provide better context
- Roadmap section needs specific user-requested items
- User explicitly requests fetching Issues/PRs

---

### Step 3: Analyze Existing Documentation

If reference documents exist in the repository:
- Read existing README.md, CONTRIBUTING.md, docs/
- Extract key information: project name, description, features, setup instructions
- Use this as the primary source when available

If no documentation exists:
- Analyze source code to infer project purpose
- Look at main entry files for functionality hints
- Check package.json/name, Cargo.toml/package name, or similar for project identity

---

### Step 4 [Update]: Prepare Update Content

Use the information collected in Scenario B:

1. **If user selected "跳过" in B1**: No update description provided. Automatically identify sections that need updating by comparing the existing README with the current repository state (code, dependencies, config, docs from Step 1 and Step 3). Proceed directly to prepare updated content for Step 8.

2. **If user provided an update description**: Check if directory was also provided in B2.
   - **If user provided a valid directory** (not "跳过"):
     - Read the content from the provided directory/file
     - Extract relevant information for the requested update sections
   - **If user selected "跳过" or no directory provided**:
     - Scan the repository to find relevant content for the update
     - Use the user's update requirements to guide the scan
     - Look for relevant code, docs, or design files that match the update requirement

3. **Read the existing README.md** to understand current content structure

4. **Generate update content**:
   - If user provided directory: Use content from that directory
   - If no directory: Analyze repository to find relevant content for the requested update
   - If B1 was "跳过": Use auto-identified sections that need updating

5. **Prepare the updated sections** with the new content (do NOT write files yet)

6. **Decision**:
   - If update content found → Proceed to Step 8 (content will be written there)
   - If no relevant content found → Inform user and ask for more guidance

---

### Step 5: Generate README Content

**Generate both English (README.md) and Chinese (README_zh.md) versions.** Both versions should contain the same sections with appropriate translations.

Generate a comprehensive README with these sections. Only include sections that have relevant content from the repository analysis:

- **Title**: Project name from package.json, Cargo.toml, or directory name
- **Badges**: Build status, version, license, downloads, etc. (shields.io badges) - only if applicable
- **Description**: 2-3 sentences describing what the project does and its primary purpose. If the repository contains relevant images (in figures/, images/, docs/images/, etc.), embed them here to illustrate the project. Each image must include a detailed description (2-4 sentences) explaining what it shows, key elements visible, and how it helps users understand the project.
- **Core Challenges**: 3-5 bullet points on key problems this project solves
- **Core Features**: 5-10 key features with brief descriptions. If applicable, embed related images (architecture diagrams, UI screenshots, etc.) within relevant feature descriptions.
- **Quick Start**: Prerequisites, installation commands, and basic usage examples
- **Configuration**: Only include if the project has environment variables or config files to document
- **API Reference**: Only for libraries/SDKs - key classes, functions, usage examples. Skip if not applicable
- **Project Structure**: Top-level directory structure with descriptions
- **Contributing**: Only include if there's a CONTRIBUTING.md or clear contribution guidelines
- **Changelog**: Only include if CHANGELOG.md exists in the repository
- **Roadmap**: 3-5 planned features or improvements (can be inferred or marked as TBD)
- **License**: License name and brief description (default to MIT if not specified)
- **Acknowledgments**: Only include if there are credits, related projects, or inspiration to mention
- **FAQ**: Only include if common questions can be identified from issues or docs

---

### Step 6: Adapt to Project Type

After generating content in Step 5, adjust the README content based on project type BEFORE user confirmation:

1. **Library/SDK**: Focus on API, installation, usage examples, migration guides
2. **CLI Tool**: Show command examples, configuration options, terminal output
3. **Web Application**: Include deployment instructions, environment variables, screenshots
4. **Framework**: Highlight getting started, plugins/extensions, comparison with alternatives
5. **Infrastructure/DevOps**: Emphasize configuration, Kubernetes manifests, docker-compose

---

### Step 7 [Scratch]: Confirm Core Features

**This step only applies when user selected "从零开始生成" in Pre-Step.**

After generating the **Core Features** section in Step 5 and adapting to project type in Step 6, BEFORE proceeding to the remaining sections, you MUST:

1. **Output Core Features summary to user via normal text** — display only a concise bullet-point summary (1-2 lines per feature, no implementation details) in a code block or short list. Do NOT embed the full content inside the `question` tool.
2. **Ask for confirmation/modification** using the `question` tool with ONLY a brief question (no re-displaying the content):

   - **Question**: "以上是核心功能概览，如需修改请选择修改并输入意见，如无修改请选择继续。"
   - **Header**: "确认核心功能"
   - **Options**:
     1. "修改内容" - 输入对核心功能的修改意见
     2. "不再修改，直接继续" - 接受当前内容并继续

3. **If user selects "修改内容"**: The `question` tool automatically shows a "Type your own answer" input. The user enters modification instructions. Apply the modifications to the Core Features content, then **loop back to step 1** (re-display the modified features briefly and ask for confirmation again), allowing multiple rounds of modification until user chooses "不再修改，直接继续".

4. **If user selects "不再修改，直接继续"**: Proceed to Step 8.

**CRITICAL**: Never embed the full generated Core Features content inside the `question` tool's `question` parameter. This floods the terminal and makes interaction impossible. Always output content as normal text first, then use `question` with a short confirmation message.

---

### Step 8: Handle Existing README and Write Files

**Scenario A (Scratch) — if an existing README was detected in Pre-Step:**
Before writing, use `question` tool to ask:
- **Question**: "仓库中已存在 README.md 文件，是否覆盖该文件？"
- **Header**: "覆盖确认"
- **Options**:
  1. "覆盖" - Overwrite the existing README.md and README_zh.md
  2. "不覆盖" - Create differentiated filenames (README_new.md / README_new_zh.md)

If user chooses **"覆盖"**: Proceed with normal file writing (overwrite existing files).
If user chooses **"不覆盖"**: Write to differentiated filenames instead:
  - Write `README_new.md` instead of `README.md`
  - Write `README_new_zh.md` instead of `README_zh.md`
  - Inform the user: "已生成新的 README 文件，文件名为 README_new.md 和 README_new_zh.md，原文件保持不变。"

**Scenario A without existing README / Scenario B (Update)**: Proceed directly to writing (no overwrite prompt needed).

This step writes the final README files. The source of content depends on the generation mode:

- **Scenario A (Scratch)**: Use the full content generated in Steps 5-7
- **Scenario B (Update)**: Merge the prepared content from Step 4 with the existing README

**Write BOTH English and Chinese README files** (using the filenames determined above):

1. Write README.md / README_new.md (English version) to the repository root
2. Write README_zh.md / README_new_zh.md (Chinese version) to the repository root

**Formatting rules**:
- Use clear markdown formatting
- Add table of contents for long READMEs
- **Embed images in relevant sections**: If images are found in figures/, images/, etc., embed them in Description or Core Features sections (not in a separate Demo/Screenshots section). Each image must include a detailed description (2-4 sentences) in the same location.
- **Image Placeholders**: Only add text placeholders like `[TODO: Add screenshot]` in Description or Core Features sections if no images are found but the project would benefit from visuals.

**Decision**:
- If no changes are needed (existing README already matches the content) → Tell user: "README.md 和 README_zh.md 已与当前项目状态保持同步。未检测到重大更改。" Do NOT write files.
- Otherwise → Write both files.

---

### Step 9: Post-Generation Validation

After writing the README, verify the output:

1. **Read the generated README file(s)** (README.md and README_zh.md, or README_new.md and README_new_zh.md if differentiated) to confirm they were written correctly
2. **Check for completeness**:
   - All required sections are present
   - No empty sections without meaningful content
   - Placeholders are appropriate (only where needed)
3. **Verify accuracy** (CRITICAL):
   - Project name matches package.json/Cargo.toml/directory
   - Commands in Quick Start are valid and complete
   - **ALL directories listed in Project Structure MUST exist** - verify by listing them
   - **ALL features listed must be verifiable** - do not claim features that don't exist
   - **License information must match actual license file**
   - For documentation repos: verify docs/ subdirectories by actually listing them
   - For image references: verify image files exist before using them in Markdown

## Content Guidelines

**Generate both English (README.md) and Chinese (README_zh.md) versions.** Both versions should have the same sections with appropriate translations.

Only include sections that have relevant content from the repository analysis:

1. **Title**: Use project name from package.json, Cargo.toml, or derive from directory name
2. **Badges**: Add shields.io badges for build status, version, license, downloads - only if applicable
3. **Description**: 2-3 sentences, state what the project does, who it's for. Embed relevant images (architecture diagrams, UI screenshots) here to illustrate the project. Each image must include a detailed description (2-4 sentences).
4. **Core Challenges**: 3-5 bullet points on key problems solved
5. **Features**: List 5-10 key features with brief descriptions. Embed related images within relevant feature descriptions. **Each image must include a detailed description** (2-4 sentences). If no images are found but the project would benefit from visuals, add descriptive text placeholders. Include the same images in both English and Chinese README versions with appropriately translated descriptions.
6. **Quick Start**: Provide copy-pasteable commands
7. **Configuration**: Document env vars, config files, settings - only if applicable
8. **API Reference**: For libraries - key classes, functions, usage examples - skip if not a library
9. **Structure**: Show top-level directory structure with descriptions
10. **Contributing**: Include only if CONTRIBUTING.md exists or guidelines are clear
11. **Changelog**: Include only if CHANGELOG.md exists in repository
12. **Roadmap**: Include 3-5 planned features or improvements (infer from codebase, or use Issues if available)
13. **License**: Default to MIT if not specified, or state "See LICENSE file"
14. **Acknowledgments**: Include only if there are credits, related projects (optional)
15. **FAQ**: Include only if common questions can be identified (optional)

## Language Requirements

Write in a professional, substantive style that avoids generic AI-generated language:

1. **Avoid overused phrases** such as:
   - "seamlessly", "effortlessly", "powerful", "robust", "cutting-edge"
   - "revolutionize", "game-changing", "state-of-the-art"
   - "simple", "easy", "just", "basic" (when describing complex things)
   - Generic superlatives without evidence

2. **Use concrete descriptions**: Replace generic claims with specific technical details
   - Instead of: "Powerful CLI tool for X"
    Write: "Command-line interface supporting subcommands for X operations"
   - Instead of: "Seamlessly integrates with X"
    Write: "Provides adapter interface for X with connection pooling and retry logic"

3. **Provide substantive information**: Each section should contain meaningful details
   - Description section: specific use cases, target users, problem domain
   - Features section: what each feature does and why it matters
   - Quick Start section: complete working commands with expected outputs

4. **Be specific about capabilities**: Don't use vague language
   - Avoid: "Supports multiple formats"
   - Write: "Supports CSV, JSON, and Parquet formats with automatic schema inference"

## Markdown Format Requirements

Ensure the output strictly follows Markdown best practices:

1. **Headings**: Use ATX-style (# ## ###) with proper nesting
   - Single H1 (title) at top
   - H2 for major sections
   - H3 for subsections
   - No skipping heading levels

2. **Lists**: Use consistent formatting
   - Unordered lists: use hyphen (-) not asterisk (*)
   - Ordered lists: use period (1. 2. 3.) not parentheses
   - Indent subordinate items with 2 spaces
   - Add blank line before and after lists

3. **Code blocks**: Properly format all code
   - Use fenced code blocks (```) with language identifier
   - Use inline code (`) for commands, paths, short values
   - Add blank line before and after code blocks
   - Use consistent indentation (2 or 4 spaces)

4. **Links**: Use proper Markdown link syntax
   - `[text](url)` for external links
   - `[text](#anchor)` for internal links
   - Use descriptive link text, avoid "click here"

5. **Tables**: Use proper table syntax with alignment
   - Include header row with dashes
   - Use pipe (|) as column separator
   - Ensure columns align properly

6. **Emphasis**: Use appropriate emphasis
   - **Bold** for UI elements, directory names, important terms
   - *Italic* for book titles, new concepts, emphasis
   - `Code` for file paths, commands, technical values

## Final Checklist

Before completing, verify all of the following:

1. **Content Completeness**
   - [ ] Title section present and accurate (in both English and Chinese)
   - [ ] Description provides clear project overview (2-3 sentences minimum) in both languages
   - [ ] Core Challenges section addresses real user problems
   - [ ] Core Features section lists actual features with descriptions
   - [ ] Quick Start includes working commands
   - [ ] Project Structure reflects actual directory layout
   - [ ] Roadmap reflects known/planned features (from Issues if available, otherwise inferred)
   - [ ] Both README.md (English) and README_zh.md (Chinese) are generated

2. **Markdown Quality**
   - [ ] All headings use ATX-style (#)
   - [ ] Lists use consistent bullet characters (- or 1.)
   - [ ] Code blocks have language identifiers
   - [ ] No bare URLs (use link syntax)
   - [ ] Tables properly formatted

3. **Language Quality**
   - [ ] No generic AI phrases detected
   - [ ] Descriptions are specific and technical
   - [ ] Feature descriptions explain what and why
   - [ ] Commands produce expected outputs

4. **Accuracy**
   - [ ] Project name matches package.json/Cargo.toml/directory
   - [ ] Installation commands are valid and complete
   - [ ] File paths in structure section exist
   - [ ] License information correct

5. **User Experience**
   - [ ] Table of contents added for long READMEs (>200 lines)
   - [ ] Placeholders only where images genuinely needed
   - [ ] Sections ordered logically
   - [ ] All images have detailed descriptions (2-4 sentences explaining what they show)
   - [ ] Images included in both English and Chinese versions with appropriate descriptions
   - [ ] Both README.md and README_zh.md have consistent sections

## Edge Cases

- If repository has extensive docs already: Create a summary README that links to them
- If project is a monorepo: Create separate READMEs for each package or one overview README
- If project is private/enterprise: Omit sensitive URLs, use placeholder descriptions
- If no clear project identity: Use directory name as project name with generic description

## Tools

Use these tools as needed:
- glob: Find relevant files (package.json, README.md, source directories)
- grep: Search for key information in files
- read: Read existing documentation and key source files
- write: Create both README.md and README_zh.md files
- skill: Use `aet-operating-issues skill` and `aet-operating-pr skill` for fetching repository Issues and Pull Requests (see Step 2)

## Report to User

After completion, report to the user in Chinese:
- "README.md 和 README_zh.md（或 README_new.md 和 README_new_zh.md）已成功生成/更新于 [路径]"
- List the sections included in the README
- Mention any placeholder areas that need manual completion (e.g., `[TODO: 添加截图]`)
- Note any assumptions made during generation
- List images included and their descriptions