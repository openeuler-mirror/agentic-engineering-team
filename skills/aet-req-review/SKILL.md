---
name: aet-req-review
description: |
  Gate pipeline for requirement deliverables — enforces automated quality gates and interactive user validation before handover. Trigger when: (1) structured PRD/spec/DPS reviews are required, (2) executing a Stage demanding review-then-revision cycles, (3) workflows necessitate HCritic automated checks coupled with user-in-the-loop revision.
disable-model-invocation: true
metadata:
  pattern: pipeline
  stages: 5
  sub_patterns: [reviewer]
---

<role>

**Triage**: orchestrate the gate pipeline — enforce gate cycles, manage user-interactive revision cycles, and route state transitions based on gate outcomes.

</role>

<guideline>

- The end-to-end pipeline comprises: A subagent-driven initial gate loop → A user-in-the-loop gate loop → A conditional subagent re-gate loop triggered by user modification volume and preference.
- **Triage**: halt any gate loop exceeding 2 iterations → request user intervention (options: ignore and proceed OR continue gate loop).
- Gate Routing: `fully passed` → skip next gate iteration; `conditionally passed` → skip next gate iteration; `failed` → mandatory next gate iteration.
- State routing decisions as a structured JSON object: `{"next_state": one of ["A1","A2","A3","A4","A5"], "reason": short justification, "iteration_counts": {"A1": int, "A4": int}}`.
- Post-revision: Systematically verify that chain impacts (terminology, cross-references) are consistently updated across the entire document.

</guideline>

<instruct>

### [A1] SubAgent Gate

- Validate input completeness by confirming path existence ONLY — DO NOT read the content.
- Delegate the deliverable and Review Materials to a Subagent for gate evaluation. (Reference the prompt template in <example>).
- If multiple deliverables exist, parallelize delegation to independent subagents. Final routing decisions MUST follow the worst-case result principle.

### [A2] Deliverable Revision

- Ascertain the gate grade: **fully passed**, **conditionally passed**, or **failed**.
- Address each gate issue sequentially.
- **Diagnostic**: never apply superficial text patches — trace back to the deliverable's generation methodology, identify impacted steps, and re-execute from scratch if necessary (e.g., re-explore codebase, re-interview user, redesign logic). Fix the source material, not just the document surface.
- Ensure document-wide consistency for all chain impacts (terminology, cross-references).
- NEVER introduce new non-conformities during the revision phase.

### [A3] User Gate & Revision

- Load the `aet-req-user-review` Skill — this is MANDATORY for interactive revision functionality.
- IF the Skill fails to load -> prompt the user to either proceed directly to [A5] or halt and wait for resolution.
- IF the Skill crashes during execution -> capture partial results, set state='error', notify the user with the error log, and offer choices: retry (maximum one automatic retry), skip-to-A5, or abort.
- Execute the exact sequence defined in `aet-req-user-review` (prepare -> guide -> finalize -> process).
- Process user comments and apply deliverable revisions adhering strictly to the hunk-processing rules in `aet-req-user-review`.

### [A4] SubAgent Re-gate & Revision

- Trigger ONLY if [A3] yielded extensive modifications (defined as: user changes that modify >100 characters total) AND the user explicitly authorizes it.
- Ask the user: "是否需要进行复审？" providing options: ["需要复审", "跳过复审"].
- Execution semantics mirror [A1] and [A2].

### [A5] End

- Output exactly: `文档审查结束，再见。`
- Halt all further actions and terminate the gate pipeline.

</instruct>

<example>

## SubAgent Delegation Prompt Template (Used in [A1] & [A4])

```text
You are an authoritative Quality Assurance Reviewer. Your objective is to rigorously evaluate the deliverable against the specified gates.

## Input
- Review Materials: <path_to_review_materials>
- Deliverable: <path_to_deliverable>

## Task
1. Strictly adhere to the criteria, methodology, and checklists defined in the **Review Materials**.
2. Scrutinize the **Deliverable** to identify all logical flaws, missing requirements, inconsistencies, and non-conformities.
3. Output a definitive gate grade. It MUST be exactly one of the following: [fully passed, conditionally passed, failed].
4. If a SubAgent returns any grade outside [fully passed, conditionally passed, failed] or returns malformed output, treat the result as 'failed' and request a SubAgent rerun; if the SubAgent is unresponsive after one retry, escalate to user intervention with error details.
5. Provide a structured, exhaustive list of all identified issues, accompanied by specific and actionable remediation recommendations.
```

</example>

<constraint>

- NEVER fabricate content — all deliverable text must strictly trace back to Skill methodology or user input.
- **Relentless**: never bypass a failed gate — enforce the fix-and-reassess loop (within maximum iteration limits).
- Halt: any gate loop exceeding 2 iterations → halt, request user intervention. The user may choose to either ignore and proceed to the next stage OR continue the gate loop (resetting the iteration counter).
- ALWAYS enforce the worst-case result principle for multi-deliverable routing.
- ERROR RECOVERY: If a Skill or SubAgent crashes after processing begins, capture partial results, set state='error', notify the user with the error log, and offer choices: retry (maximum one automatic retry), skip-to-A5, or abort. Never silently swallow errors or continue without user acknowledgment.

</constraint>

<patch>

- Do not dynamically compress **critical sub-agent findings** or **important code snippets** your exploration before the design is finalized — doing so risks losing essential details that degrade design quality.
- ALWAYS recreate snapshots upon re-entering [A3] — previous snapshots are destroyed post-[A3] in `aet-req-user-review`.
- The `aet-req-user-review` Skill dependency at [A3] is absolute. If unloadable, interactive revision is blocked. Demand a user decision; do not silently bypass.
- Dynamic Review Materials: If the Review Materials are executable scripts/tools rather than static documents, NEVER execute them directly. Mirroring the strict content-blindness rule, explicitly delegate tool execution to the SubAgent to derive the gate results.

</patch>

<input>

1. **Deliverable Path to be Reviewed**
   - If the path is missing -> abort with fatal error. The gate pipeline cannot proceed without a deliverable.

2. **Review Materials Path**
   - Encompasses `reviewer role` and `checklist` (may be unified into a single document).
   - If the path is missing -> prompt the user: "No Review Materials found. Options: (1) provide materials, (2) proceed with limited checks (treat all checks as 'failed'), (3) abort."

</input>

<output>

- The in-place modified deliverable (DO NOT generate or output to new files).

</output>

<condition>

### Initial Gate Loop

- IF A1 gate PASS (`fully` OR `conditionally`) THEN execute A2 revisions -> proceed directly to A3.
- IF A1 gate FAIL AND A1 iteration count < 2 THEN execute A2 revisions -> return to A1 for re-gate.
- IF A1 gate FAIL AND A1 iteration count >= 2 THEN halt -> request user intervention (options: ignore and proceed to A3 OR continue gate loop with reset iteration counter).

### User Gate Loop

- IF A3 user makes ZERO modifications across the entire flow THEN proceed directly to A5.
- IF A3 user MAKES modifications THEN initiate a new A3 user gate loop.
- IF A3 user makes ZERO modifications in the current round AND modified > 50 chars in previous rounds THEN prompt user for re-gate confirmation.
- IF A3 user selects "需要复审" THEN proceed to A4.
- IF A3 user selects "跳过复审" THEN proceed directly to A5.

### Re-gate Loop

- IF A4 gate PASS (`fully` OR `conditionally`) THEN execute A4 revisions -> proceed directly to A5.
- IF A4 gate FAIL AND A4 iteration count < 2 THEN execute A4 revisions -> return to A4 for re-gate.
- IF A4 gate FAIL AND A4 iteration count >= 2 THEN halt -> request user intervention (options: ignore and proceed to A5 OR continue gate loop with reset iteration counter).

</condition>
