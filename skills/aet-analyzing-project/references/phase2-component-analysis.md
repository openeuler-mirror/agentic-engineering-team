# Phase 2: Detailed Module Analysis

**Input Dependencies**: Overview.md, Architecture.md, Modules.md

**Quality Standard**: Each module detail file reaches the level of "a new developer can independently modify this module after reading it."

**Based on Previous Analysis**: NEVER proceed with analysis without Modules.md; if this file cannot be loaded, MUST prompt user and stop.

---

## [S1] Evaluate Analysis Depth and Confirm Scope

Not all modules need equal depth of analysis. Classify based on dependency relationships and module responsibilities from the previous output file `Modules.md`.

**Flat Module Analysis**: If submodules exist in Modules.md, you need to analyze all modules flatly, not nested submodules.

### Priority Classification Criteria

| Priority | Criteria | Analysis Depth |
|--------|------|----------|
| High | Depended on by most modules / contains core business logic / high modification frequency | Complete analysis: all function signatures, complete flow tracing, design pattern identification |
| Medium | Moderately depended on / specialized domain logic | Standard analysis: complete public interfaces, key flows, omit minor internal functions |
| Low | Utility classes / configuration / rarely modified | Simplified analysis: mainly interface contracts and dependency relationships, omit internal implementation details |

### Execution Requirements

1. Extract module list, paths, dependency relationships from Modules.md
2. Assign priority to each module according to above criteria
3. If module count > 8, show user the priority classification results, confirm whether to analyze all or handle high-priority modules first
4. **Do not start any Subagent before analysis scope confirmation**

---

## [S2] Generate Module Documents in Parallel

- Use `aet-analyzing-project` SKILL to conduct in-depth analysis of each module within the confirmed scope separately.
- Delegate multiple Subagents simultaneously, modules start at the same time, not serially waiting.
- Output to component analysis files under the `components/` directory (e.g., `C001-Core.md`)

### Subagent Task Template

For each module, use the following template to generate Subagent task description:

```text
Task: Conduct in-depth analysis of module {ModuleID}-{ModuleName} and generate module detail file according to `assets/module-detail-template.md` template in `aet-analyzing-project` SKILL

Context:
  Project Path: {project-path}
  Module Path: {module_path}
  Priority: {High/Medium/Low}
  Belongs to Layer: {layer}
  Depends on: {dependencies} (from Modules.md)
  Depended on by: {dependents} (from Modules.md)

Output File: {output-directory}/components/{ModuleID}-{ModuleName}.md

Execution Steps:

1. Load SKILL Template (Required)
   - Load 'aet-analyzing-project'
   - `assets/module-detail-template.md` for output structure

2. Deep Code Reading
   Read all files under the module path to establish complete understanding.

   a. File Structure Organization
      - List all files, understand import relationships between files
      - Identify entry files (index / main / most referenced by external)

   b. Public Interface Analysis
      - Identify all exports (functions, classes, types, constants)
      - Record complete signatures (parameter types, return types, generic constraints)
      - Annotate file path and line number for each export

   c. Internal Implementation Analysis
      - Trace core call chains (entry → processing → output)
      - Identify design patterns and locate code evidence
      - Analyze data flow: inbound form → intermediate transformation → outbound form
      - Record key algorithms and business strategies

   d. Dependency Relationship Validation
      - Check all import / require statements
      - Distinguish internal dependencies (project modules) and external dependencies (third-party packages)
      - Verify consistency with dependencies declared in Modules.md

   e. Quality and Risk Assessment
      - Identify code smells (large classes, long functions, hard coding, etc.)
      - Evaluate test coverage situation
      - Annotate potential risks (unhandled exceptions, concurrency safety, memory leaks)

3. Generate File According to Template
   MUST generate based on template in assets of `aet-analyzing-project` SKILL
   Load 'assets/module-detail-template.md', fill in section by section.
   
   Ensure:
   - Overview accurately reflects the module's role in the system
   - All public interfaces are listed, signatures match source code
   - Code references include file:line format
   - Design patterns have code evidence, not speculation
   - Call chains and sequence diagrams for key flows reference specific file:line
   - All paths use relative paths, no absolute paths

Priority Adjustments:
  - High priority: Complete all sections of template
  - Medium priority: Can omit "Key Algorithms/Strategies" and extension guides in "Development Guide"
  - Low priority: Can omit entire "Internal Implementation" section, sequence diagrams in "Key Flows", "Code Quality and Risk"
```

### Quality Requirements

| Requirement | Validation Method |
|------|----------|
| All exports listed | Compare `grep -r "export" {module_path}` results with document's public interface section |
| Code references have line numbers | All code references in document include `:{line}` or `L{line}` format |
| Design patterns have code evidence | Each pattern line includes `path:line` not just text description |
| Key flows have specific file links | Call chain format is `file.ts:45 → file.ts:23`, not "A calls B" |
| Dependencies match Modules.md | Dependency list in document matches dependencies declared in Modules.md |
| No absolute paths | `grep -E "^/|[A-Z]:\\\\" {output_file}` has no results |

---

## [S3] Parallel Validation of Module Documents

Start validation only after all generation Subagents complete. Validation Subagents use independent context, do not inherit memory from generation phase—this ensures validation objectivity and avoids inheriting blind spots from generation.

- **Ask User**: MUST ask user if validation can be skipped, as this phase is long; if user says it can be skipped, do not execute
- **Parallel Execution**: Simultaneously delegate multiple Subagents to fact-check all generated module documents
- **Fix Issues**: For documents with issues, MUST prompt user and correct before finishing

---

## [S4] Split principles Files

Goal: Traverse all module files under `components/` (if any), read the last section `## Development Guide` of each file, and combine with `Architecture.md` and `Modules.md`. When `components/` lacks sufficient information, you may extract project-level golden principles based on your own understanding, provided there is supporting evidence (e.g., actual code patterns, architecture docs, or established conventions).

- **Load Template**: Load `assets/principles-template.md` for output structure.
- **Generate Files**: Split all principles into the `principles/` folder, categorized into independent Markdown files by theme.

### File Naming

- Use `kebab-case.md`
- File name should directly express the theme, for example:
  - `naming-style.md`
  - `error-handling-principle.md`
  - `skill-writing-principle.md`
  - `dependency-principle.md`

### Classification Rules

Cluster by theme, not mechanically split by module, such as:

- **Engineering**: Error handling, logging, testing, configuration
- **Architecture**: Module boundaries, dependency direction, extension points
- **Writing**: Document organization, SKILL writing, template usage
- **Governance**: Checklists, change processes, risk control

### Abstraction Rules

1. **Code First**: Principles must have code, architecture, or module document evidence.
2. **Prioritize Merging Commonalities**: Rules that appear repeatedly across multiple modules should be merged into project-level principles first.
3. **Distinguish Scope**:
   - Applies only to a single module → module principle
   - Applies to a category of modules → category principle
   - Runs throughout the entire project → project principle
4. **Avoid Over-generalization**: Don't directly upgrade "a module's habit" to global standard.

---

## [S5] Update SKILL.md

This document is the entry and index to project analysis results; need to update generated Modules.md, principle files, and other information.

- **Be Realistic**: Update according to currently generated documents, leave items not yet generated blank.

---

## Completion Checklist

- [ ] Modules analyzed flatly
- [ ] Each module file meets all quality requirements
- [ ] Deep code reading has been executed (not relying on speculation)
- [ ] Generated files validated, Subagents delegated in parallel
- [ ] All serious issues have been corrected
- [ ] Module IDs in module detail files match Modules.md
- [ ] Layering information in module detail files matches Architecture.md
- [ ] Principle files have been generated and categorized by theme
- [ ] SKILL.md has been updated and accurately reflects analysis results
