---
name: aet-diagnosing-bug
description: Systematic bug diagnosis skill - reproduces bugs, traces root causes, identifies affected files, and produces a structured diagnosis report for fix planning
---

## Language Detection and Response

### Language Detection

- Automatically detect the language of user input

### Response Language Matching

- Respond in the same language as the user input

## When to Use

Use this skill when:

- You need to systematically diagnose a bug before fixing it
- You need to identify root cause and all affected files
- You need a structured diagnosis report to feed into fix planning
- Called from the `aet-bugfix` agent workflow

## Input

This skill accepts:

- Bug description (from issue or direct input)
- Error messages, stack traces, logs
- Reproduction steps (if available)
- Feature folder path (if exists)

## Output

This skill produces TWO artifacts per invocation:

1. **Diagnosis Report** — design-level: bug summary, root cause analysis, affected files, impact assessment, **solution design**, **acceptance criteria**
2. **Fix Plan** — implementation-level: checkbox tasks consumable by `aet-implementing-requirement`

## Output Mode

The form of the two artifacts depends on whether a feature folder is provided:

### Feature Mode (feature folder path was passed in)

Persist both artifacts to disk:

| Artifact         | Path                                                                            |
| ---------------- | ------------------------------------------------------------------------------- |
| Diagnosis Report | `./ai_assistance/features/{feature-name}/bugfix/{YYYYMMDD-HHMMSS}-diagnosis.md` |
| Fix Plan         | `./ai_assistance/features/{feature-name}/bugfix/{YYYYMMDD-HHMMSS}-fix-plan.md`  |

Return BOTH file paths to the caller.

### In-memory Mode (no feature folder)

Do **NOT** write any file under `.aet/`. Return BOTH artifacts as inline markdown
strings to the caller, so they can be passed directly as inputs to the next step
(`aet-implementing-requirement`).

Project source code / test edits made in later steps still go to their normal
locations, regardless of mode.

## Small Bug Fast Path (Light Path)

When the caller (`aet-bugfix` agent, `main.md` Step 1.6 Size Triage) passes
`path=light` — i.e. the bug is in In-memory mode and all three Size Triage conditions
hold (root cause stated + fix direction stated + estimated footprint ≤ 50 lines) — this
skill takes the **Small Bug Fast Path** instead of the full Phase 0-6 workflow.

**What the fast path does:**

- **Phase 1-3 still execute** (Bug Understanding → Root Cause Localization → Affected
  Files Analysis) — these are needed to extract/confirm the root cause and identify the
  affected files that fill the inline summary.
- **Phase 4 (Diagnosis Report Generation) is skipped** — no full structured report is
  produced.
- **Phase 5 (Hand off Diagnosis Report) still runs**, but hands off the inline summary
  (not file paths).
- **Phase 6 (Generate Fix Plan) is skipped** — no checkbox fix-plan is produced.

**Output: a ≤10-line inline summary** (format below), passed forward as an inline
markdown string to Step 3 (`aet-implementing-requirement`). **No file is written to disk**
(In-memory mode constraint).

```
## Bug Inline Summary (Light Path)
- Root Cause: [1-2 行，从输入提取]
- Affected Files: [1-3 行，文件:行范围 + 变更类型]
- Acceptance Criteria: [1-3 行，bug regression 验收点]
```

> Total ≤ 10 lines. The inline summary replaces both the Diagnosis Report and the Fix Plan
> in the light path. Acceptance Criteria in the summary must be specific enough to drive a
> regression test (cover the bug's Reproduction Steps or Trigger Conditions).

## Diagnosis Workflow

### Phase 0: Vulnerability Identifier Detection (CVE)

**Before starting standard diagnosis, check if the input contains vulnerability identifiers.**

1. **Detect Vulnerability Identifiers**
   - Scan input for patterns: `CVE-YYYY-NNNNN`
   - Also check for references like "vulnerability ID", "security advisory", or localized equivalents

2. **If Vulnerability ID Found**:
   - Run the vulnerability info fetcher script:
     ```bash
     node skills/aet-researching-cve/scripts/vulinfo.js --id <vulnerability-id>
     ```
   - Parse the output and use web search tool to figure out:
     - Vulnerability description and severity
     - Affected products/versions/components
     - Known attack vectors
     - Recommended remediation from advisory

3. **Cross-Reference with Local Code**:
   - Match affected products/libraries against project dependencies (package.json, requirements.txt, pom.xml, go.mod, etc.)
   - Check if the vulnerable version is in use
   - Search local codebase for the vulnerable code patterns described in the CVE
   - Identify specific files and functions that match the vulnerability pattern

4. **Proceed to Phase 1** with enriched context from the vulnerability database

   > If vulnerability ID is NOT found in input, skip directly to Phase 1.

### Phase 1: Bug Understanding

1. **Parse Bug Description**
   - Extract: error messages, stack traces, expected vs actual behavior
   - Identify: affected component, trigger conditions, environment info
   - If CVE/vulnerability info was fetched in Phase 0, incorporate that context
   - **Clarity check (gate to user query):** before proceeding, judge whether the bug
     description / issue text is concrete enough to diagnose. Missing concretes
     include: no clear symptom, no expected vs actual, no error message, no
     environment, no entry point, contradictory statements. If the description
     is **not clear enough**, use the Question tool to ask the user with a
     focused, option-based prompt listing the specific gaps. Wait for the
     user's reply, then re-parse. Do NOT proceed to step 2 with a vague description.

2. **Capture Reproduction Steps (if reproducible)**
   - If the user provided reproduction steps, record them verbatim
   - If the bug description implies a reproducible path (specific input + specific
     command + observable output), extract those steps
   - These steps become the **acceptance test source of truth** for Phase 4
     Acceptance Criteria and Phase 6 fix-plan Step 1 (the failing regression test)
   - If the bug is non-reproducible / intermittent / environment-only:
     mark it as such and rely on Trigger Conditions instead. Do NOT fabricate
     steps and do NOT block on inability to reproduce.

3. **Read Error Messages Carefully**
   - Don't skip past errors or warnings
   - Read stack traces completely
   - Note line numbers, file paths, error codes
   - They often contain the exact location of the problem

### Phase 2: Root Cause Localization

1. **Check Recent Changes**
   - Use `git log` and `git diff` to identify recent changes
   - Look for changes related to the affected component
   - Check for new dependencies, config changes

2. **Trace Data Flow**
   - Start from the error/symptom point
   - Trace backward through the call stack
   - For each step: Where does the bad value originate?
   - Keep tracing until you find the source

3. **Gather Evidence in Multi-Component Systems**
   - For each component boundary:
     - What data enters the component?
     - What data exits the component?
     - Where does the data transform incorrectly?
   - Run diagnostics to determine WHERE exactly it breaks

4. **Find Working Examples**
   - Locate similar working code in the same codebase
   - Compare working vs broken code
   - Identify all differences, however small

5. **Pinpoint Root Cause**
   - Form hypothesis: "The root cause is X because Y"
   - Verify with evidence (logs, code analysis, test results)
   - Distinguish between root cause and symptoms
   - If multiple plausible hypotheses remain, document them and pick the one
     with the strongest evidence; do NOT query the user here. (User clarification
     is reserved for Phase 1 step 1 when the bug description itself is unclear.)

### Phase 3: Affected Files Analysis

1. **Direct Impact Files**
   - Files containing the bug (root cause location)
   - Files where the fix needs to be applied

2. **Indirect Impact Files**
   - Files that depend on the buggy code
   - Files that may need adjustment after the fix
   - Test files that cover the affected code

3. **For Each Affected File, Document:**
   - File path
   - Specific lines/functions affected
   - Type of change needed (fix, adjust, test update)
   - Priority (critical/secondary/optional)

### Phase 4: Diagnosis Report Generation

Generate a structured diagnosis report:

```
## Bug Diagnosis Report

### Bug Summary
- Description: [concise bug description]
- Severity: [critical/high/medium/low]
- Trigger Conditions: [observed inputs / environment / state when the bug surfaces]
- Reproducible: [yes / no / intermittent]
- Reproduction Steps: [verbatim or extracted in Phase 1 step 2; OMIT this field if Reproducible = no]

### Root Cause Analysis
- Root Cause: [specific technical explanation]
- Evidence: [how we know this is the root cause]
- Category: [logic error / data issue / config error / race condition / etc.]

### Affected Files
| File | Location | Change Type | Priority |
|------|----------|-------------|----------|
| path/to/file.ts | function/line | fix | critical |
| path/to/other.ts | function/line | adjust | secondary |
| path/to/test.ts | test case | test update | required |

### Impact Assessment
- Scope: [how many components/features affected]
- Risk: [risk level of the fix]
- Regression Potential: [areas that could regress]

### Recommended Fix Direction
- [High-level description of the recommended approach]
- [Alternative approaches if applicable]

### Solution Design
- **Approach**: [Expand on Recommended Fix Direction — describe the change strategy and why other approaches were rejected]
- **Module-Level Changes**: [Group by affected file; describe the semantic-level change for each group]
- **Interface / Contract Impact**: [Whether public interfaces, config schema, database schema, etc. change]
- **DFx Considerations**: [Performance / security / observability / compatibility impact]

### Acceptance Criteria
- [ ] **If Reproducible = yes**: executing the Reproduction Steps no longer triggers the issue (primary acceptance criterion)
- [ ] **If Reproducible = no/intermittent**: use Trigger Conditions as the source of truth; construct an equivalent scenario to verify
- [ ] A regression test covering this bug is added; for reproducible bugs the regression test
  MUST be written strictly from the Reproduction Steps, must fail before the fix, and pass after it
- [ ] Every file listed in Affected Files is handled (fix / adjust / test update)
- [ ] No Regression Potential listed in Impact Assessment is introduced
- [ ] lint / test suite / build all pass (verified by aet-checking-implementation)
```

### Phase 5: Hand off Diagnosis Report

Branch by Output Mode (see "Output Mode" section at the top of this skill):

**Feature mode:**

1. Persist diagnosis report to `./ai_assistance/features/{feature-name}/bugfix/{YYYYMMDD-HHMMSS}-diagnosis.md`
2. Proceed to Phase 6 (fix plan also persisted)
3. Return `{diagnosis_path, fix_plan_path}` to the caller
   - `diagnosis_path` → consumed as `design document` by `aet-implementing-requirement`
   - `fix_plan_path` → consumed as `implementation plan` by `aet-implementing-requirement`

**In-memory mode:**

1. Hold diagnosis report content in memory (do NOT write to disk)
2. Proceed to Phase 6 (fix plan content also kept in memory)
3. Return `{diagnosis_content, fix_plan_content}` as inline markdown strings to the caller
   - `diagnosis_content` → passed inline as design input to next step
   - `fix_plan_content` → passed inline as plan input to next step

No user confirmation in either mode. The only point at which this skill queries
the user is **Phase 1 step 1** — when the bug description / issue text is not
clear enough to diagnose.

### Phase 6: Generate Fix Plan

Based on the Affected Files table and Solution Design, generate a checkbox-format
fix plan compatible with `aet-implementing-requirement/WORKFLOW.md`.

For each affected file (or logical change unit), emit a Task block:

```markdown
## Task N: {File or logical change unit}

**Files:**

- Modify: `{path}:{line-range}` (or Create / Test)

- [ ] **Step 1: Write failing regression test**
  - If `Reproducible = yes`: encode the diagnosis report's Reproduction Steps directly into the test
  - If `Reproducible = no/intermittent`: derive the test from Trigger Conditions
  - Test must fail BEFORE the fix is applied (red)

- [ ] **Step 2: Run the regression test, confirm it fails**

- [ ] **Step 3: Apply the minimum code change to make it pass**

- [ ] **Step 4: Run the regression test, confirm it passes (green)**

- [ ] **Step 5: Run full test suite, confirm no regression**

- [ ] **Step 6: Commit (message references the diagnosis report)**
```

**Output handling:**

- Feature mode → persist as `{YYYYMMDD-HHMMSS}-fix-plan.md` next to the diagnosis report
- In-memory mode → return as inline markdown content; do NOT write to disk

## Integration with Systematic Debugging

This skill builds upon the methodology:

- Phase 0 is a new addition for vulnerability-specific diagnosis
- Phase 1-2 correspond to Phase 1 (Root Cause Investigation)
- Phase 2 includes Phase 2 (Pattern Analysis)

## Scripts

- **`scripts/vulinfo.js`** - Fetches vulnerability information from public databases (CVE/CNVD/CNNVD). Used in Phase 0 when vulnerability identifiers are detected in the input.

## Red Flags - Return to Earlier Phase

- Proposing fixes before completing root cause analysis
- Assuming root cause without evidence (document multiple hypotheses instead of guessing)
- Skipping the Phase 1 step 1 clarity gate when the bug description is vague
- For reproducible bugs: failing to capture / use Reproduction Steps as the regression test source
- Missing affected files in the analysis
- Confusing symptoms with root cause
- For CVE-based bugs: skipping vulnerability info fetching and going straight to code analysis
- Writing files under `.aet/{task-id}/` when no feature folder was provided (In-memory mode must NOT touch disk)
