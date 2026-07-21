## SOP: Planning

<guideline>

DO NOT start from "how do we implement the requirements?" — start from "what does the existing system look like? what changes does the design actually demand? are there alternative capability paths that achieve the same effect?" Then decompose into bite-sized, file-anchored tasks organized into execution waves.

### Task Writing Principles

> **Do NOT generate any task before the facts are clear.**

- Treat the current codebase as the single source of truth.
- Do not blindly trust documents or analysis files — when uncertain, go back to [A1] exploration.
- Each task MUST specify: file path(s), line numbers / function names, what to do, must-not-do, prerequisite/blocking tasks, acceptance criteria (executable command + assertable output), and recommended skills.
- Each task MUST trace back to a requirement capability point and a design AR — write the AR ID in the task description.
- Each task MUST have a test checklist (test file paths, scenario coverage) — Test First.
- Coupled ARs MUST be merged into the same phase; do not split mechanically by AR number.
- Right-sized workload: each plan is 2–5 person-days; total plan count ≤ 3.

### Quality Self-Check Checklist

**Task Completeness**:

- [ ] Each task's capability checklist comes directly from requirement capability points (no freelance work).
- [ ] Each task has explicit target file paths and locations (no vague "modify related code").
- [ ] Each task has a test checklist (test file paths, scenario coverage).
- [ ] Task dependencies are fully annotated (prerequisite / blocking / can-parallel).
- [ ] Modification fences are reflected in the task instructions (must-not-do references Protected / Not-Involved modules).

**Plan Structure**:

- [ ] Tasks are ordered by dependency relations and technical layers (not mechanically by AR).
- [ ] Coupled ARs are merged into the same phase.
- [ ] Each wave has 3–8 tasks; preconditions and deliverables are annotated.
- [ ] Critical path and maximum concurrency are annotated.
- [ ] Phase FINAL (F1–F4) is included as the last wave.

**AR Coverage**:

- [ ] Every AR in the design has at least one corresponding task.
- [ ] Every Protected / Not-Involved module has zero tasks targeting it.

</guideline>

<instruct>

### Upstream Gap Analysis

Before writing any task, enumerate every gap in the design that blocks writing a concrete task:

- Missing interface contract (request/response shape undecided)
- Missing data model field (type/value range undecided)
- Missing DFx target (e.g., performance budget not decomposed to module)
- Missing design decision (alternative paths not chosen)

Mark each gap's status: `Resolved` / `Default Applied` / `Pending Decision`. If a gap is `Pending Decision`, either ask the user to resolve it (recommended) or apply a safe default and flag it for review.

### Task Decomposition

For each AR (or equivalent design unit), produce one or more tasks following the task format below:

```text
- [ ] T<ID> [Story] Task description - `[File Path]`

  - **AR**: AR.[SR number].<seq>
  - **Delegate Subagent**:
    + YES | NO
    + Subagent Type: [explorer / researcher / coder / tester / reviewer / documenter]
    + Effort: [Low / Medium / High / XHigh]
    + Parallelism: [TIDs of other tasks it can run in parallel with]
  - **What to do**: [specific steps, files to change, key implementation points]
  - **Must NOT do**: [prohibited operations — especially fence violations]
  - **Parallelism Info**:
    + Can Parallel: [YES / NO]
    + Prerequisite Tasks: [Task ID]
    + Blocking Tasks: [Task ID]
  - **Reading List**:
    + Pattern: [File path:line number] - [pattern to mimic]
    + API/Type: [File path] - [reference response structure]
    + External: [URL] - [library usage]
  - **Recommended Skills**: `[skill name]`: [rationale]
  - **Acceptance Criteria**:
    + [ ] `<command>` → [expected result]
  - **QA Scenario**:
    ```
    Scenario: [Scenario Name]
      Tool: [Tool Name]
      Preconditions: [Preconditions]
      Steps:
        1. [Operation Step]
        2. [Operation Step]
      Expected Result: [Expected Result]
      Evidence: .sisyphus/evidence/task-<ID>-<description>.txt
    ```
```

### Wave Organization

Group tasks into execution waves:

- **Phase 1 (Foundation)**: infrastructure, data models, interface definitions, framework scaffolding (greenfield).
- **Phase 2–N (Business Logic)**: services, API/UI, integrations.
- **Phase FINAL (Quality Validation & Delivery)**: F1 Plan Compliance Audit, F2 Code Quality Review, F3 Real Scenario Manual QA, F4 Scope Fidelity Check.

For each wave: annotate preconditions, deliverables, the critical path, and maximum concurrency. Tasks in the same wave can run in parallel.

### MVP Scope

If the plan spans multiple waves, mark MVP scope explicitly:

- **Phase 1 (MVP)**: minimum viable feature set that delivers user value.
- **Phase 2–N (Incremental)**: increments on top of MVP.

</instruct>

<constraint>

- NEVER generate any document or output any results from this step beyond the structured plan content. Delegate all findings to [A3] document generation.
- NEVER write a task without a file path. Vague "modify related code" tasks are forbidden.
- NEVER write a task that touches a Protected / Not-Involved module — flag the contradiction back to the user instead.
- NEVER skip the upstream gap analysis — a plan with unresolved gaps is invalid.

</constraint>
