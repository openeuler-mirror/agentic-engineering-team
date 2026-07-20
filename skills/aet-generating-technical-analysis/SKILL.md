---
name: aet-generating-technical-analysis
description: |
  Generate in-depth technical analysis documents based on project code and overall project design documents. Focus on the main features of the project and deeply analyze "why it was designed this way".
  You can specify a particular feature, or let the skill automatically extract key features and deeply analyze the technical principles. One or more documents can be generated.
---

# Technical Deep Analyzer

## Invocation Condition

Invoke this skill when the user provides project code, design documents, or other technical materials and requests a technical deep analysis document:

- Requesting deep analysis of the design principles for certain technical features
- Requesting explanation of "why it was designed this way"
- Requesting analysis of technical architecture and implementation principles
- Requesting generation of technical principle documentation

## Step 0: Language Selection

Before starting the technical deep analysis, you MUST ask the user about their document language preference:

```text
Question: "请选择技术深度分析文档的语言 / Please select the language for the technical deep analysis document:"
Options: "简体中文 (Simplified Chinese)", "English"
```

**Language-Specific Requirements:**

- **简体中文 (Simplified Chinese)**: All descriptive content MUST be written in Simplified Chinese, except for:
    - Technical terms and keywords (API, SDK, framework names, etc.)
    - Code and code comments
    - Proper nouns that are typically kept in English
    - Keywords in code blocks

- **English**: All descriptive content MUST be written in English, including:
    - All section titles
    - All descriptive text
    - All explanations
    - Only code, technical terms, and proper nouns remain in their original form

Store the selected language and apply it consistently throughout the entire document generation process.

## Workflow

### Step 1: Collect Project Information

#### 1.1 Identify Project Structure

Search and analyze key files in the project root directory:

1. **Design Documents**: Look for DESIGN.md, ARCHITECTURE.md, design/, docs/design/, docs/architecture/ directories and files
2. **README**: Project overview and feature descriptions
3. **Root Config Files**: package.json, Cargo.toml, go.mod, pom.xml, build.gradle, *config* etc.
4. **Entry Files**: main.*, index.*, App.*, src/main/* etc.
5. **Core Code**: src/ etc.
6. **Build Scripts**: Makefile, build.sh, scripts/ etc.

#### 1.2 Identify Project Type

Determine project type based on structure and config files:

- **Frontend Project**: React, Vue, Angular, Flutter etc.
- **Backend Project**: Node.js, Java, Go, Python, Rust, etc.
- **Mobile**: iOS, Android, HarmonyOS etc.
- **Tool/Framework**: SDK, framework, library etc.
- **System-level**: Operating system, embedded, low-level library etc.

#### 1.3 Identify Key Modules

Identify core modules and main functionalities:

- Review directory structure to identify core modules
- Analyze entry files to determine main exports
- Review config files to understand project capabilities
- Analyze test files to understand core functionality

### Step 2: Extract Key Features

#### 2.1 User-Specified Features

If user specifies particular features, proceed directly to deep analysis:

1. Locate the feature's implementation in the code
2. Analyze related data structures, algorithms, and architecture
3. Trace the source of design decisions

#### 2.2 Auto-Extract Features

If user does not specify, automatically extract key features:

**Priority Rules:**

| Priority | Feature Type | Criteria |
|:---:|:---|:---|
| P0 | Core Functionality | Main exported functions/classes/modules, features mentioned in README's first line |
| P1 | Unique Features | Distinctive implementations, features highlighted in documentation |
| P2 | Key Infrastructure | Core modules/data structures relied on by multiple modules |
| P3 | Optimization Features | Performance optimization, caching, concurrency enhancements |

**Extraction Methods:**

1. Extract feature list from README and design documents
2. Identify key modules from directory structure
3. Analyze public API purposes from entry files
4. Understand core use cases from test files
5. Review Issue/CHANGELOG to learn about implemented features

### Step 3: Deep Analysis of "Why This Design"

#### 3.1 Analysis Dimensions

For each key feature, analyze from the following dimensions:

##### 3.1.1 Background

- What problem does this feature solve
- What pain points does it address
- Who are the target users and use cases
- Are there alternative solutions, why was the current approach chosen

##### 3.1.2 Design Solution

- What is the overall architecture design
- Core module (data structure/component/algorithm) selection and reasoning
- Relationships and interactions between modules
- Why this tech stack/framework was chosen
- Key architectural patterns (layered, event-driven, microservices, etc.)
- Application of design principles (SOLID, KISS, DRY, etc.)

Mermaid diagrams may be used to enhance readability (architecture diagrams, flowcharts, etc.).

##### 3.1.3 Implementation Principles

- What is the core flow
- Key code logic
- Execution flow
- State management approach
- Extension points design
- Boundary condition handling

##### 3.1.4 Trade-offs

What trade-offs were made:

- Performance vs. Maintainability
- Simplicity vs. Rich functionality
- Generality vs. Specificity
- Space vs. Time complexity

##### 3.1.5 Usage and Examples

Explain how users utilize this feature, provide key commands (brief explanation only).

##### 3.1.6 Evolution History

Note: Output this content only if there is directly referenceable evolution history in the input; otherwise, do not generate.

- How the design evolved (check git history if available)
- What refactorings were experienced
- Possible future improvement directions

#### 3.2 Information Sources

- **Design Documents**: DESIGN.md, architecture/*.md, docs/spec/, docs/design
- **Code Comments**: Important comments explain design intent
- **README**: Feature introductions and background
- **CHANGELOG**: Version changes and feature evolution
- **Test Cases**: Understand behavior through test cases
- **Issue/PR**: Design discussions (if available)
- **Code Structure**: Understand design through naming and structure

### Step 4: Generate Technical Deep Document

#### 4.1 Document Structure Example

Each technical deep analysis document's table of contents can follow this template (adjust as needed):

```markdown
# {Feature Name} Technical Deep Analysis

## Overview

Briefly introduce what this feature is and provide necessary background information.
Length: 1-2 paragraphs.

## Background

### Current Problems and Pain Points

What problem does this feature solve.

Current challenges faced, why this feature is needed.

### Goals

What are the design goals of this feature, what effects to achieve.

## Design Solution

### Overall Architecture

Use architecture diagrams or text to explain the overall design approach.

### Core Design

What design principles were followed, and why.

### Extensibility

How to support extensions and how to evolve in the future.

## Implementation Principles

### Core Flow

Sequence diagrams or flowcharts for the main process.

### Key Implementation

Key code snippets explaining implementation details.

### State Management

How state flows and is managed.

### Boundary Handling

Boundary conditions and exception handling.

## Trade-offs

### Performance vs. Maintainability

What trade-offs were made.

### Other Trade-offs

Other design trade-offs.

## Usage and Examples

Brief introduction of how to use this feature with commands.

## Evolution History

> **Note:** This section is optional. If there are directly referenceable evolution history references in the input (CHANGELOG, git log, design document update records), output this content and annotate the information source for each sub-item. **If there is no direct evidence, this section MUST be deleted, and evolution history must not be generated based on inference.**

## Summary

Core key points summary.
```

#### 4.2 Content Requirements

- **Depth**: Dive into implementation details, don't stay on the surface
- **Traceability**: Answer "why", not just "what"
- **Multi-dimensional**: From requirements, design, implementation, trade-offs
- **Specific**: Have concrete code examples and data support

#### 4.3 Format Requirements

- Use Markdown format
- Correct title hierarchy progression
- Code blocks should specify language
- Tables for structured information
- **Mermaid Diagram Requirements (CRITICAL)**: All Mermaid diagrams MUST use correct syntax to ensure rendering:

    **Forbidden patterns that cause parse errors:**
    - **Curly braces `{}` in node IDs**: Use `skill_name` instead of `{skill_name}`, use `NodeA` instead of `{NodeA}`
    - **HTML tags like `<br/>`**: Mermaid does NOT support HTML in node labels
    - **Pipe character `|` in node text without proper escaping**: In edge labels, use `|label|` but never use bare `|` inside node brackets `[]`
    - **Unbalanced brackets**: Ensure all `[` has a matching `]`

    **Correct syntax for common patterns:**

    ```mermaid
    flowchart TB
        subgraph Name
            NodeA[Text]
            NodeB[Multi\nLine Text]
        end
        
        NodeA -->|label| NodeB
    ```

    **Line breaks in node labels**: Use `\n` (not `<br/>`):

    ```mermaid
    node[Line1\nLine2\nLine3]
    ```

    **Edge labels**: Use pipe characters around the label:

    ```mermaid
    A -->|this is a label| B
    A -.->|dashed label| B
    ```

    **Subgraph naming**: Use plain text without special characters:

    ```mermaid
    subgraph Container
        node1[Node 1]
    end
    ```

- **Architecture diagrams**: When using ASCII/text diagrams, all box lines MUST be properly aligned:
    - Use monospace characters for consistent character width
    - Ensure horizontal lines (`---`, `===`, `+---+`) align across all boxes at the same level
    - Ensure vertical lines (`|`) align vertically between rows
    - Box content should have consistent indentation
    - Prefer Mermaid diagram syntax for complex diagrams (as it handles alignment automatically)
    - When using text diagrams, verify visual alignment before finalizing

**Output Language Requirement (based on user selection in Step 0):**

If **简体中文 (Simplified Chinese)** was selected:

- The generated document MUST be written in Simplified Chinese, except for:
    - Technical terms and keywords (API, SDK, framework names, etc.)
    - Code and code comments
    - Proper nouns that are typically kept in English
    - Keywords in code blocks

If **English** was selected:

- All descriptive content MUST be written in English
- Section titles, explanations, and body text are all in English
- Only code, technical terms, and proper nouns remain in their original form

### Step 5: Handle Insufficient Information

#### 5.1 Scenarios of Insufficient Information

- Design documents are missing or incomplete
- Key code lacks comments
- Cannot determine reasons for design decisions

#### 5.2 Handling Methods

Information inferred through reasoning MUST be clearly marked with Note:

> **Note:** [Inferred based on code analysis/typical patterns, verification recommended. The reason for this inference is: xxx]

**The following scenarios MUST trigger Note marking or skip:**

1. **Evolution History**: Without CHANGELOG/git history, **this section MUST be deleted**
2. **Design Decision Reasons**: When lacking design document evidence, add Note explaining it as inference
3. **Version numbers/dates**: When lacking source code comment support, add Note or use "Inferred" prefix
4. **Module introduction time/purpose**: Without related commit messages or documentation, add Note

Inferrable directions:

1. **Infer from code**: Infer design intent from code structure, naming, patterns
2. **Infer from tests**: Understand behavior and boundaries from test cases
3. **Infer from comparison**: Compare with similar project/framework implementations
4. **Mark assumptions**: Mark undetermined items as reasonable assumptions

#### 5.3 Skip Principles

- If completely lacking information and cannot infer, skip that part
- Must clearly mark what is assumption-based

### Step 6: Quality Check

#### 6.1 Content Check

- [ ] Each feature has a requirements background explaining "why"
- [ ] Design decisions have reason analysis
- [ ] Key conclusions have code or evidence support
- [ ] Example code has key code comments
- [ ] Trade-offs are clearly explained, remain objective, cover both strengths and limitations
- [ ] **All inferred content has Note marking** (checkpoints: evolution history, design decisions without evidence, feature descriptions without direct source)
- [ ] **Sections without evidence-based evolution history have been deleted** (cannot generate based on inference)

#### 6.2 Structure Check

- [ ] Document structure is complete (Overview → Requirements → Design → Implementation → Trade-offs → Usage → Summary)
- [ ] Title hierarchy is correct and clear, body discussion is thorough

#### 6.3 Format Check

- [ ] Document output matches the user's selected language (Simplified Chinese or English)
- [ ] If Simplified Chinese: Chinese punctuation is used in descriptions (，。：；？！""etc.)
- [ ] If English: English punctuation is used in descriptions
- [ ] Terminology is consistent
- [ ] Technical terms kept in original form when appropriate
- [ ] **Architecture diagram box lines are properly aligned** (when using ASCII/text diagrams, ensure boxes are aligned using monospace characters, consistent indentation, and straight vertical/horizontal lines)
- [ ] **Mermaid diagrams have correct syntax** (no `{}` in node IDs, no `<br/>`, no unescaped `|` in node text, all brackets balanced)

#### 6.4 Language Check

**If Simplified Chinese was selected:**

- [ ] All descriptive content (non-code, non-term) is in Simplified Chinese
- [ ] Chinese punctuation marks are used correctly (，。：；？！""etc.)
- [ ] Technical terms, code, and proper nouns remain in English as needed

**If English was selected:**

- [ ] All descriptive content is in English (including section titles, explanations, body text)
- [ ] English punctuation marks are used correctly
- [ ] Code and technical terms remain in their original form

## Output Requirements

- **Language:** Based on user's selection in Step 0 (Simplified Chinese or English)
- **Format:** Markdown format output
- **Quantity:** One document (user-specified feature) or multiple documents (auto-extracted features) can be generated
- **Destination:** Output to user-specified local path

## Execution Steps

0. Ask user to select document language (Simplified Chinese or English)
1. Collect project information (code, design documents, README, etc.)
2. Determine key feature list (user-specified or auto-extracted)
3. Conduct deep analysis for each feature
4. Generate technical deep analysis documents (in the selected language)
5. Conduct quality checks (including **inferred content Note check** and **unfounded evolution history deletion check**)
6. Output documents to specified path
