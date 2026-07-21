---
name: aet-generating-manual
description: |
  Generate user manual documentation from codebase information. Two trigger scenarios:
  1. User manual generation: installation and configuration guide, feature usage, troubleshooting (all types or specific type)
  2. Generate documentation from Issue link: parse Issue content and generate corresponding user manual documentation
  This skill analyzes the codebase (code, design docs, README, issues, supports Gitee/AtomGit/GitHub) to generate comprehensive user manuals. Uses aet-operating-issues skill and aet-operating-pr skill for Issue/PR operations. Output documents to local file path.
---

# User Manual Generator

> **Language**: All user-facing interactions (prompts, confirmations, option displays) and generated documentation default to **Chinese**. All output documents are written in Chinese unless the user explicitly requests otherwise.

## Overview

This skill generates comprehensive user manual documentation from information extracted from the codebase. It can produce multiple document types in markdown format based on user requirements.

## When to Use

Use this skill when users request:
- User manual generation (all types or specific type)
- Installation or setup guides
- Feature usage tutorials or operation guides
- Troubleshooting guides or FAQ documents
- Generate documentation from Issue link
- Updating existing user documentation

## Workflow

### Step 1: Determine Intent and Route

Determine the user's intent from their request and route to the correct scenario:

- User requests to **generate/create new** user manual → ask user to choose:
  1. **Scenario A - Generate from scratch**: Create new user manual from codebase information
  2. **Scenario B - Update existing**: Update existing user manual with latest codebase changes
  > **Note for AI**: The user's request may sound like "generate" but always ask to choose. Do NOT skip this step — even if the user says "生成/创建", you must present both options.
- User requests to **update/modify** existing user manual → go directly to **Scenario B**
- User provides an **Issue link** → go directly to **Scenario C**
- Intent is **unclear** (generic request, no specific keywords) → use the `question` tool to ask user to confirm the scenario:
  - Options:
    - "场景 A - 从零生成"
    - "场景 B - 更新已有"
    - "场景 C - 从Issue生成"

### Scenario A: Generate Documentation from Codebase

Triggered when user selects Mode A (Generate from scratch) in Step 1.

#### A0. User Supplement Prompt

**Must follow the order below, do not skip step 1:**

1. **First output the following text to the user (mandatory):**
   ```
   输出文档默认会扫描整个仓库收集信息，为了更好的分析与输出，请提供以下内容：
   1. 设计文档与特性说明：系统架构设计文档、特性说明等与功能使用相关的文档
   2. 本地补充目录（可选）：包含额外补充信息的本地目录路径
   如不提供将以代码仓已有内容进行分析和输出。
   ```

2. **Then use the `question` tool to ask the user:**
   - **"提供补充内容"** — After selection, use plain text to prompt the user for the directory path (do NOT use the `question` tool)
   - **"跳过"** — Skip the supplement step and proceed

#### A1. Determine Document Types

Determine the document types to generate from the user's request:

- User specifies **installation guide / setup** → generate installation guide only
- User specifies **feature usage / tutorial** → generate feature usage guides only
- User specifies **troubleshooting / FAQ** → generate troubleshooting document only
- User specifies a **specific feature name** → generate that feature's document only
- User requests **all / full manual / general generation / 生成用户文档 / 生成手册** → generate all types
- Scope is **unclear** → use the `question` tool to ask user to confirm with the options:

| 请求内容 | Documents to Generate |
| :--- | :--- |
| 用户手册生成 / 生成用户手册 / 生成用户文档 / 生成手册 | All types (Installation + All Feature Docs + Troubleshooting) |
| 安装指南 / 安装 / 设置 | Installation guide only (installation.md) |
| 功能使用 / 如何使用 / 教程 | Feature usage guides only |
| 故障排除 / FAQ / 常见问题 | Troubleshooting document only |
| 特定功能名称 | That specific feature's document only |

#### A2. Collect Codebase Information

Search and analyze the following sources:

1. **Code Files**: Read relevant source code to understand functionality
2. **Design Documents**: Search the entire repository for architecture docs, design specs, and technical specifications (e.g., DESIGN.md, architecture/, design/, *.md files with "design", "architecture", "spec" in the name)
3. **README**: Use as reference if available
4. **Existing Documentation**: Check docs/, documents/ folders
5. **Install Scripts**: Read install.sh, setup.sh, postinstall.mjs, Makefile - these often contain the latest/correct installation steps (MUST READ even if INSTALL.md exists)
6. **package.json**: Check scripts field for build/test/install commands
7. **Issue Tracker**: Check issues with "feature" label for feature requirements and implementation details

   **When to fetch from remote**: Only when information from code files, design docs, README, existing documentation, install scripts, package.json, configuration files, and test files is insufficient to generate documentation.

   Use **aet-operating-issues skill** to fetch issues (the skill will determine the appropriate API based on the platform).
   Look for CHANGELOG.md or RELEASE_NOTES.md that document implemented features

8. **Configuration Files**: Find config examples, environment variables
9. **Test Files**: Extract usage examples

#### A3. Information Consistency Verification

After collecting codebase information and before generating documentation, verify key information for consistency:

1. **Repository URL Verification**:
   - Search all possible repository URL references (e.g., repository.url in package.json, URLs in documentation, clone addresses in install scripts)
   - Compare URLs from multiple sources and ensure consistent correct address is used
   - If inconsistencies found, prefer the address used in existing user documentation or official maintained docs

2. **Configuration Location Verification**:
   - Verify correct location for configuration files (e.g., .env vs .opencode/*.jsonc)
   - If multiple configuration locations exist, prefer references from existing user documentation

3. **Commands and Paths Verification**:
   - Verify correct format for installation commands (e.g., npm install vs install.sh)
   - Verify path references are correct

#### A4. Outline Review and Confirmation

After information collection and verification, generate an outline based on the document types determined in A1 and present it to the user for review:

1. **Generate outline**: Granularity depends on document count:
   - **Single document**: Generate the chapter/section outline within that document (H2/H3 hierarchy), each item with a brief description
   - **Multiple documents**: Generate the hierarchical relationship between documents, each item with a brief description

2. **Present outline**: Start with "已生成以下文档大纲，请审阅：", format depends on document count:

   **Single document** — Show the internal chapter/section hierarchy:
   ```
   已生成以下文档大纲，请审阅：
   - 安装指南
     - 系统要求
     - 安装步骤
       - 环境准备
       - 安装过程
     - 初始配置
   ```

   **Multiple documents** — Show the inter-document hierarchy:
   ```
   已生成以下文档大纲，请审阅：
   - 安装指南
   - 功能使用指南
     - 项目管理
     - 用户管理
   - 故障排查
   ```

   > **Note: In multi-document mode, only show document names and their hierarchical relationships. Do NOT expand internal chapter/section structures (H2/H3).**

    Then use the `question` tool to ask the user:
     - **"修改大纲"** — After selection, use plain text to prompt the user for modification content (do NOT use the `question` tool)
     - **"不修改，接受当前大纲"** — Accept the current outline and proceed to generation

3. **If user inputs modifications**:
   - Accept user's addition, deletion, or modification requests
   - Update the outline accordingly
   - Display the **updated hierarchical outline** again
    - Use the `question` tool to ask again; repeat until user selects "不修改，接受当前大纲"

4. **Per-document outline confirmation for feature usage guides** (multi-document mode only): After the inter-document hierarchy is confirmed, show the internal chapter outline in compact format (H2/H3 level) for each **feature usage guide** document one by one. For each feature usage guide, use the `question` tool to ask the user:
   - **"修改这篇文档大纲"** — After selection, use plain text to prompt the user for modification content (do NOT use the `question` tool)
   - **"接受"** — Confirm this document's outline, proceed to the next

   After updating, re-display the updated outline for that document, repeat until user selects "接受". After all feature usage guides are confirmed, proceed to the next step.

   > **Note: Installation guide (installation.md) and troubleshooting (troubleshooting.md) are NOT confirmed per-document in this step. Only feature usage guide documents.**

5. **Proceed to generation**: Use the finalized outline as the blueprint to generate full content for each document (Step 2-8)

### Scenario B: Update Existing Documentation

Triggered when user selects Mode B (Update existing) in Step 1.

#### B1. Determine Update Scope

Determine the scope of documents to update from the user's request:

- User specifies **installation guide / setup** → update installation guide only
- User specifies **feature usage / tutorial** → update feature usage guides only
- User specifies **troubleshooting / FAQ** → update troubleshooting document only
- User specifies a **specific feature name** → update that feature's document only
- User requests **all / full manual / general update / 更新用户手册 / 更新用户文档 / 更新手册** → update all types
- Scope is **unclear** → use the `question` tool to ask user to confirm with the options:

| 请求内容 | Documents to Update |
| :--- | :--- |
| 全部更新 / 更新全部手册 / 更新用户手册 / 更新用户文档 / 更新手册 | All types (Installation + All Feature Docs + Troubleshooting) |
| 更新安装指南 / 安装 / 设置 | Installation guide only (installation.md) |
| 更新功能使用 / 如何使用 / 教程 | Feature usage guides only |
| 更新故障排除 / FAQ / 常见问题 | Troubleshooting document only |
| 更新特定功能名称 | That specific feature's document only |

#### B2. Review Existing Documentation and Collect Requirements

Based on the determined scope, locate and present existing documents, then collect update requirements:

1. Search common documentation locations matched against the scope
2. **Display found documents in compact format** — List each document as one line: `- {filename}`
 3. **Collect update description**: Use the `question` tool to ask the user:
     - **"描述更新内容"** — After selection, use plain text to prompt the user for update description (do NOT use the `question` tool)
     - **"跳过"** — Skip step 4, proceed to step 5 for auto-detect scan
  4. **Content directory** (optional, only if step 3 was not skipped): Inform the user that they can provide a directory with input materials needed for the update (e.g., design docs, code directories), then use the `question` tool to ask the user:
     - **"提供补充目录"** — After selection, use plain text to prompt the user for the directory path (do NOT use the `question` tool)
     - **"跳过"** — Scan the repository guided by the update description
5. **Scan for changes**: Based on the user's input, scan using the appropriate approach:
   - **Update description provided** → scan targeted at what the description mentions, including relevant code files, design docs, configs, APIs, and test files
   - **Content directory provided** → scan the provided directory, no additional scanning needed
   - **No update description (auto-detect)** → compare codebase against existing documentation to identify changes. Analyze:
     - **CHANGELOG / Release Notes**: New features, breaking changes, deprecations
     - **Design Documents**: Check for updated architecture docs, design specs
     - **Existing Documentation**: Cross-check against current codebase for mismatched content (changed APIs, removed features, outdated screenshots or commands)
     - **Install Scripts** (install.sh, setup.sh, Makefile): Changes in installation steps or dependencies
     - **package.json / config files**: New/changed scripts, dependencies, environment variables
     - **Code structure changes**: New directories, CLI commands, API endpoints, renamed or removed features
     - **Test Files**: Check for new usage examples or changed APIs in tests
6. Record user requirements and scan results for the update

#### B3. Execute Update

Use the existing documentation as base, apply user requirements and scanned content to generate the updated version (Step 3-8).

### Scenario C: Generate Documentation from Issue Link

Triggered when user provides an Issue link.

#### C1. Fetch and Analyze Issue

1. Parse Issue link to determine codebase and Issue number
2. Use **aet-operating-issues skill** to fetch Issue content (the skill will determine the appropriate API)
3. Analyze Issue labels, confirm if it's a "feature" label
4. Determine if Issue content requires generating user manual documentation

**Decision Rules:**
- If Issue involves user-facing features/config/operations → generate documentation
- If Issue is internal-only (refactor, performance, backend-only) → skip, notify user
- If unclear → use the `question` tool to ask user to confirm (options: "是，生成文档" / "否，跳过")

#### C2. Collect Codebase Context

When generating documentation from an Issue, **always** also collect relevant codebase information to provide proper context:

1. **Code Files**: Read relevant source code files related to the Issue
2. **Design Documents**: Check for existing design specs or architecture docs related to the feature
3. **README**: Reference setup and usage information if available
4. **Existing Documentation**: Check docs/ folder for related feature documentation
5. **Install Scripts**: Read install.sh, setup.sh if installation is involved
6. **package.json**: Check scripts for build/test commands
7. **Test Files**: Extract usage examples from tests
8. **Configuration Files**: Find config examples and environment variables
9. **Issue Tracker**: Look for CHANGELOG.md or RELEASE_NOTES.md

**This is critical** - the Issue provides the feature requirements, but the codebase provides the implementation details needed for accurate documentation.

#### C3. Fetch Related PR/MR

After confirming documentation is needed, fetch related Pull Requests/Merge Requests to understand the complete implementation:

1. **Find linked PRs/MRs**:
   - Check Issue's `pull_request` field (if exists in API response)
   - If no direct link, search PRs by keywords

2. **Enhanced PR Search Strategy**:
   > **Important**: Many Issues don't have direct PR links. Use the following search approach:

   - **Step 1**: Extract key keywords from Issue title/body
     - Example: Issue #118 title → "【feature】支持自动多轮skill自优化"
     - Extract: "自优化", "多轮", "迭代", "optimization"

   - **Step 2**: Query PRs with multiple states
     ```bash
     # Search merged PRs with keywords
     curl -s ".../pulls?state=merged&per_page=100" | grep "keyword"
     
     # Also check closed PRs
     curl -s ".../pulls?state=closed&per_page=100" | grep "keyword"
     ```

   - **Step 3**: Match by keywords in body OR title
     - Keywords should cover feature description, not exact Issue number
     - Common patterns: "迭代", "iterative", "自优化", "optimize", "feature name"

3. **Fetch PR/MR content**:
   - Use **aet-operating-pr skill** to find related PRs (the skill will determine the appropriate API)
   - Get PR title, description, and changed files

4. **Analyze code changes**:
   - Identify new files added
   - Identify modified files and key changes
   - Extract configuration changes, API additions, UI components, etc.
   - Look for test files to understand usage patterns

5. **Extract implementation details**:
   - New configuration options and environment variables
   - New API endpoints or changes
   - Database schema changes
   - New dependencies added

**This is critical** - the Issue provides feature requirements, but the PR/MR provides the actual implementation code and changes needed for accurate documentation.

#### C4. Scope Confirmation

Based on the Issue analysis and codebase context, determine the documentation scope and present to the user for confirmation:

1. **Analyze scope**: Determine if the Issue content is best suited as:
   - A **standalone new document** (new feature, independent functionality)
   - A **subsection merged into existing documentation** (enhancement to existing feature)
2. **Present recommendation** to user with analysis details:
   - Whether existing related documentation was found
   - Proposed document structure (standalone or which existing doc to merge into)
3. **User confirms or adjusts**: Use the `question` tool to ask "是否确认以上范围？确认请选择确认，如需调整请直接输入修改点", with options:
   - **"确认"** — Proceed with the recommended scope
   - (User directly inputs modification points; adjust and re-present until confirmed)

#### C5. Generate Issue-based Documentation

Based on the confirmed scope from C4:
1. Parse Issue requirements (background, requirements, API, usage, etc.)
2. Use codebase context to understand actual implementation
3. Generate corresponding document content with accurate details (Step 3-8, plus Step 2 if creating a standalone document)
4. Add as sub-section to corresponding feature document, or create new document as determined in C4

### Step 2: Structure Documentation

Organize content into appropriate sections with consistent hierarchy. Each document should include a metadata header (document version, date, status) and a table of contents for documents longer than 5 sections.

#### Installation Guide
- **Document metadata**: Software version, document version, last updated date
- **System requirements**: Hardware specs, OS support, supported versions
- **Required dependencies and versions**: Runtime, libraries, tools with exact version ranges
- **Environment variables**: Required and optional variables with descriptions and defaults
- **Prerequisites**: Account setup, network access, permissions needed before installation
- **Installation methods**: Provide all supported methods (package manager, binary download, source build, docker) with platform-specific notes
- **Step-by-step installation guide**: Numbered steps with expected outputs at each step
- **Initial configuration**: First-time setup, default values, minimum required config
- **Verification steps**: Commands or checks to confirm successful installation
- **Upgrade and migration**: Upgrading from previous versions, breaking changes, data migration
- **Uninstallation**: Clean removal steps, data backup recommendations

#### Feature Usage Guide (one per major feature)
- **Overview**: What this feature does and when to use it
- **Prerequisites**: Feature-specific dependencies, enabled flags, prior setup
- **Common use cases**: Typical scenarios with brief descriptions
- **Usage instructions**: Step-by-step procedures with code examples and expected output
- **CLI / API reference** (if applicable): Commands, parameters, options with examples
- **Configuration options**: Feature-specific config with descriptions and defaults
- **Best practices**: Recommended patterns, performance considerations, common pitfalls
- **Error handling**: Common errors, their causes, and recovery steps
- **Integration notes**: How this feature interacts with other features

#### Troubleshooting
- **Diagnosis workflow**: Systematic approach to identify the root cause
- **Common issues and solutions**: Symptom → Cause → Solution table
- **Error messages and their meanings**: Error code/snippet → Explanation → Resolution
- **Log collection**: Where logs are located, how to enable verbose logging
- **Debug tips**: Tools, commands, and techniques for investigation
- **Environment info**: How to gather system/environment details for support
- **FAQ section**: Frequently asked questions organized by topic
- **Support resources**: Links to issue tracker, community forums, contact info

### Step 3: Handle Images

Analyze whether the generated document needs images and follow these guidelines:

**Determine if images are needed:**
- Images are needed when content involves UI display, operation flows, architecture diagrams, topology, or comparison of before/after states
- Content that can be clearly expressed with text alone does not need images
- Prefer diagrams over text for complex relationships or multi-step workflows

**Image types and usage:**
- **Screenshots**: Capture only relevant portions, add numbered callouts matching steps in text, avoid outdated UI versions
- **Architecture diagrams**: Show component relationships, data flow direction, and protocol labels; use consistent shapes for the same concept
- **Flow diagrams**: Map decision points, branching logic, and process steps; align with step-by-step instructions
- **Before/after comparisons**: Show configuration changes or upgrade effects side by side

**Image handling:**
- **Use existing images**: If screenshots or diagrams exist in the codebase or Issue, search for matching image files (e.g., ./images/, ./docs/images/, ./*.png, ./*.jpg), reference with correct path
- **Placeholder for missing images**: If no matching images exist in codebase, add clear placeholder in bold with detailed description:

> **TODO: 添加截图 - [在此处上下文中，描述该图片应显示的内容，包括图片在文档中出现的位置、前置内容引接和后续内容衔接]**

**Image quality standards:**
- **Naming**: Use descriptive names (e.g., `install-wizard-step3.png`), not auto-generated names
- **Alt text**: Every image must have meaningful alt text describing its content and purpose for accessibility
- **Format**: Prefer PNG for screenshots and diagrams, JPEG for photographs
- **Resolution**: Ensure text in screenshots is legible at display size

### Step 4: Document Writing Style

Maintain a consistent, professional writing style throughout all generated documents.

**Tone and voice:**
- Use active voice ("运行命令" not "命令应被运行")
- Address the reader directly with "您" where appropriate
- Keep a neutral, factual tone without marketing language
- Match the technical level of the target audience (beginner vs advanced)

**Structure and hierarchy:**
- **Headings**: Keep concise (under 60 characters). H1 for title, H2 for major sections, H3 for subsections, H4 for sub-subsections. Avoid skipping levels.
- **Paragraphs**: Keep under 5 sentences per paragraph, one idea per paragraph
- **Lists**: Use ordered lists for sequential steps, unordered lists for options or items; keep list items parallel in structure

**Content quality:**
- **Avoid overly brief descriptions**: Each section should have sufficient context and explanation
- **Provide background information**: Explain why this step is needed and what problem it solves
- **Connect content**: Use transitional phrases to link sections (e.g., "基于上述内容...", "完成此步骤后...", "接下来...")
- **Include examples**: Show practical examples with command outputs and expected results
- **Explain consequences**: Describe what happens after each action
- **Use consistent terminology**: Maintain consistent terminology throughout the document; define acronyms on first use
- **Add context**: Before each major section, briefly introduce what will be covered and why it matters

**Formatting conventions:**
- **Code blocks**: Use fenced code blocks with language identifier (```bash, ```yaml, ```json); inline code for short references (\`command\`)
- **Callouts**: Use blockquotes for notes and warnings:
  - `> **Note：**` for additional context
  - `> **Warning：**` for potential data loss or breaking changes
  - `> **Tip：**` for best practices and shortcuts
- **Links**: Use descriptive link text (not "点击此处"); prefer internal cross-references within the same document set
- **Version compatibility**: Clearly mark features or commands that are version-specific (e.g., "v2.0 引入")

**Accessibility:**
- All images must have descriptive alt text
- Link text must describe the destination (not "click here" or "read more")
- Use tables with header rows for structured data
- Avoid using color alone to convey meaning

Each section description should be 2-4 sentences that provide context, purpose, and connection to help readers understand the flow of the document.

### Step 5: Confirm Output Path and Generate Files

Automatically determine the output directory using this logic:

- If `docs/` exists in the repository root → use it as the output path
- If `docs/` does not exist → fall back to the repository root directory
- If not in a repository → use the current working directory

**Do not ask the user for the output path.** Silently use the determined default.

**File naming conventions:**
- Software installation → `installation.md`
- Feature usage guide → `{feature-name}.md` (one document per major feature)
- Troubleshooting → `troubleshooting.md`

**Handling Issue-generated content:**
- If content is generated from an Issue, add it as a new section to the corresponding feature document
- If corresponding feature document doesn't exist, create a new document

Each document should:
- Have clear hierarchical structure (H1 for title, H2 for sections, H3 for subsections)
- Include practical examples where applicable
- Have table of contents if document is long
- Use consistent formatting

**Overwrite Confirmation:**

Before writing any files, check **all** target file paths first. Collect every path where the file already exists into a list. Then handle them together:

1. **If no files exist**: Proceed to write all files normally.
2. **If some files exist**: Present the list of existing files as context, then use the `question` tool to let the user choose:
   - **"全部覆盖"** — replace all existing files
   - **"全部重命名"** — generate unique filenames for all (append timestamp/suffix, e.g. `installation-20250525.md`)

Apply the chosen strategy to all output files, then generate and write them to disk.

After writing, **inform the user of the exact file paths** where documents were saved.

### Step 6: Generate Overview File

After all documents have been written, generate an overview file named `manual-overview.md` in the output directory that lets users see all user manual documents at a glance:

1. **Scan the output directory** for all user manual document files (both pre-existing and newly generated), including:
   - `installation.md` (installation guide)
   - `{feature-name}.md` files (feature usage guides)
   - `troubleshooting.md` (troubleshooting guide)
   - Other `.md` files that are part of the user manual

2. **Generate an overview** with the following structure — include a status column to show which documents were newly generated in this run vs pre-existing. For documents where new content was added as a subsection (e.g., Scenario C merging into an existing doc), mark them accordingly:
   ```markdown
   # 用户手册概览

   | 文档 | 说明 | 状态 |
   | :--- | :--- | :--- |
   | installation.md | 安装指南 | 新生成 |
   | {feature-name}.md | {功能简要说明} | 已有 |
   | troubleshooting.md | 故障排查 | 新增章节：{新章节名} |
   ```

   Status values:
   - **新生成** — document was created from scratch in this run
   - **已有** — document existed before and was not modified
   - **新增章节：{章节名}** — existing document that received new subsection(s) in this run
   - **已更新** — existing document whose content was modified/updated in this run

 3. **Analyze user usage scenarios with feature relationships** — Based on collected codebase information from A2, generate typical user usage scenarios that demonstrate how multiple features work together in real workflows:

    a. **Identify feature relationships from codebase**:
       - Determine prerequisite dependencies between features from code structure, configuration, and documentation
       - Identify which features are designed to work together (shared configs, API calls, data flow)
       - Analyze the typical workflow order based on design docs, scripts, and common use patterns
       - Note features that can be used independently vs those that build on others

    b. **Generate usage scenarios** — Create 2-5 representative user scenarios based on actual codebase analysis:
       - Each scenario should describe a realistic end-to-end user workflow (e.g., "首次安装并初始化项目", "日常开发与迭代工作流")
       - List which features are involved in each scenario and in what order they are used
       - Explain the functional dependency and collaboration relationships between features within each scenario
       - Reference the corresponding documents relevant to each scenario

    c. **Present scenario analysis** — Generate the following structured section in `manual-overview.md`:
       ```markdown
       ## 典型使用场景与功能关系

       ### 场景一：{场景名称}
       **场景描述**：{用户在此场景下的完整目标和工作流程概述}

       **涉及功能**：
       1. {功能A} → 基础功能，在此场景中作为前置环节
       2. {功能B} → 依赖功能A，提供{扩展能力说明}
       3. {功能C} → 与功能B配合使用，实现{效果说明}

       **功能关系**：{功能A} → {功能B} ←→ {功能C}
       （→ 表示前置依赖，←→ 表示协同使用）

       **参考文档**：{feature-A}.md → {feature-B}.md → {feature-C}.md
       ```

    d. **Include feature relationship summary table**:
       ```markdown
       ## 功能关系总览

       | 功能 | 前置依赖 | 协同功能 | 独立可用 |
       | :--- | :--- | :--- | :--- |
       | {功能A} | 无 | {功能B}, {功能C} | 是 |
       | {功能B} | {功能A} | {功能C} | 否 |
       | {功能C} | {功能A} | {功能B} | 否 |
       ```

    e. **If feature relationships cannot be fully determined from available information**, use reasonable defaults:
       - Installation is always the prerequisite for all other features
       - Core/main features are independent; advanced features typically depend on core features
       - Features that share configuration files or are invoked in the same workflow are likely related
       - Troubleshooting does not have functional dependencies but serves as a reference for all features

4. **Overwrite directly** if `manual-overview.md` already exists — no confirmation needed.

### Step 7: Handle Insufficient Information

If certain information is not available in the codebase:
- Use reasonable assumptions based on common practices for that type of software
- Mark uncertain information clearly with: `> **Note:** [Information based on typical patterns, please verify]`
- Skip the section if absolutely no information can be reasonably inferred
- Clearly indicate in the document which sections are based on assumptions

### Step 8: Quality Check

Before presenting output, verify:
- [ ] All sections are complete and well-structured
- [ ] Code examples are accurate and functional
- [ ] Instructions are clear and actionable
- [ ] Image requirements have been analyzed and handled correctly (use real images or add placeholders)
- [ ] Placeholder images are clearly marked with descriptions
- [ ] Cross-references between documents are accurate
- [ ] Language is clear and consistent
- [ ] Assumptions are clearly marked when information is insufficient
- [ ] **Information Consistency**: Key information (repository URLs, configuration locations, command formats) is consistent throughout the document

## Output Format

Output should be in **Chinese** markdown format with proper heading hierarchy, code blocks for examples, and tables for structured information. Save to the auto-determined local path and always notify the user of the exact save location.