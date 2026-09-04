---
name: aet-checking-implementation
description: PR Quality Check - ensures code passes lint, tests, and build verification, and meets design requirements (plan compliance + scope fidelity)
---

# PR Quality Check

## Overview

Claiming work is complete without verification is dishonesty, not efficiency.

**Core principle:** Evidence before claims, always.

**Violating the letter of this rule is violating the spirit of this rule.**

## Inputs

This skill is content-source agnostic. The Acceptance Criteria / requirements / plan
that drives verification may be provided as **either**:

- A **file path** (e.g., `./ai_assistance/features/{name}/bugfix/{ts}-diagnosis.md`,
  `./ai_assistance/features/{name}/implementation/dev-plan.md`) — read the file, then verify against it.
- **Inline markdown content** passed directly by the caller (used in in-memory bugfix
  mode where no `.aet/` artifact is written) — use the content as-is.

Both sources are first-class. The verification discipline below applies identically
regardless of source. If neither is provided, halt and request one — do NOT
fabricate criteria.

## The Iron Law

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

If you haven't run the verification command in this message, you cannot claim it passes.

## Fresh Evidence Clarification

**"Fresh evidence"** means verification evidence produced by a command run **after** the
most recent code change — i.e. after the last commit (or last staged edit) that touched
the code under verification.

- **Code unchanged since last verification → do NOT re-run.** If the code under
  verification has not changed since the last verification run, re-running the identical
  command adds no new evidence. Stating the previous result is honest **only if** you
  confirm no code change occurred in between.
- **Code changed since last verification → MUST re-run.** If any source/test file under
  verification has changed (even a one-line tweak), the previous evidence is stale and the
  command must be run again before any completion claim.
- **How to judge "changed":** use VCS diff — `git diff` against the commit at which the
  last verification ran. If the diff is empty for the files in scope, the evidence is
  still fresh; otherwise it is stale.

This clarification sharpens the Iron Law: "FRESH" is measured relative to the most recent
code change, not relative to the wall clock. It does not weaken the law — it makes the
"fresh" predicate precise and auditable.

## The Gate Function

```
BEFORE claiming any status or expressing satisfaction:

1. IDENTIFY: What command proves this claim?
2. RUN: Execute the FULL command (fresh, complete)
3. READ: Full output, check exit code, count failures
4. VERIFY: Does output confirm the claim?
   - If NO: State actual status with evidence
   - If YES: State claim WITH evidence
5. ONLY THEN: Make the claim

Skip any step = lying, not verifying
```

## Common Failures

| Claim                 | Requires                        | Not Sufficient                 |
| --------------------- | ------------------------------- | ------------------------------ |
| Tests pass            | Test command output: 0 failures | Previous run, "should pass"    |
| Linter clean          | Linter output: 0 errors         | Partial check, extrapolation   |
| Build succeeds        | Build command: exit 0           | Linter passing, logs look good |
| Bug fixed             | Test original symptom: passes   | Code changed, assumed fixed    |
| Regression test works | Red-green cycle verified        | Test passes once               |
| Agent completed       | VCS diff shows changes          | Agent reports "success"        |
| Requirements met      | Line-by-line checklist          | Tests passing                  |

## Red Flags - STOP

- Using "should", "probably", "seems to"
- Expressing satisfaction before verification ("Great!", "Perfect!", "Done!", etc.)
- About to commit/push/PR without verification
- Trusting agent success reports
- Relying on partial verification
- Thinking "just this once"
- Tired and wanting work over
- **ANY wording implying success without having run verification**

## Rationalization Prevention

| Excuse                                  | Reality                |
| --------------------------------------- | ---------------------- |
| "Should work now"                       | RUN the verification   |
| "I'm confident"                         | Confidence ≠ evidence  |
| "Just this once"                        | No exceptions          |
| "Linter passed"                         | Linter ≠ compiler      |
| "Agent said success"                    | Verify independently   |
| "I'm tired"                             | Exhaustion ≠ excuse    |
| "Partial check is enough"               | Partial proves nothing |
| "Different words so rule doesn't apply" | Spirit over letter     |

## Key Patterns

**Tests:**

```
✅ [Run test command] [See: 34/34 pass] "All tests pass"
❌ "Should pass now" / "Looks correct"
```

**Regression tests (TDD Red-Green):**

```
✅ Write → Run (pass) → Revert fix → Run (MUST FAIL) → Restore → Run (pass)
❌ "I've written a regression test" (without red-green verification)
```

**Build:**

```
✅ [Run build] [See: exit 0] "Build passes"
❌ "Linter passed" (linter doesn't check compilation)
```

**Requirements:**

```
✅ Re-read plan → Create checklist → Verify each → Report gaps or completion
❌ "Tests pass, phase complete"
```

**Agent delegation:**

```
✅ Agent reports success → Check VCS diff → Verify changes → Report actual state
❌ Trust agent report
```

## Why This Matters

From 24 failure memories:

- your human partner said "I don't believe you" - trust broken
- Undefined functions shipped - would crash
- Missing requirements shipped - incomplete features
- Time wasted on false completion → redirect → rework
- Violates: "Honesty is a core value. If you lie, you'll be replaced."

## When To Apply

**ALWAYS before:**

- ANY variation of success/completion claims
- ANY expression of satisfaction
- ANY positive statement about work state
- Committing, PR creation, task completion
- Moving to next task
- Delegating to agents

**Rule applies to:**

- Exact phrases
- Paraphrases and synonyms
- Implications of success
- ANY communication suggesting completion/correctness

## The Bottom Line

**No shortcuts for verification.**

Run the command. Read the output. THEN claim the result.

This is non-negotiable.

## Light Path Scoped Verification

When the caller (`aet-bugfix` agent, `main.md` Step 1.6 Size Triage) passes `path=light`
(In-memory mode, Size Triage passed), this skill performs **scoped verification** instead
of the full test suite.

**Scoped verification scope:**

1. **Bug regression test** — the regression test written against the bug's Reproduction
   Steps or Trigger Conditions (from the inline summary's Acceptance Criteria). This test
   MUST pass.
2. **Tests for directly affected files** — run the tests that cover the files modified by
   the fix (the "Affected Files" listed in the inline summary). These MUST pass.

**What scoped verification does NOT run:**

- The full test suite (lint across the whole project, every test file, full build) is
  **not** part of light path. The full-suite run belongs to the full path only (bugfix
  Step 4 in full path, or dev-plan Phase FINAL for feature work).

**Iron Law still applies.** Light path is **not** a license to skip verification. The
"NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE" rule and the Gate Function
(IDENTIFY → RUN → READ → VERIFY → CLAIM) are unchanged — only the **scope** of the
RUN step is narrowed (scoped tests instead of full suite). You must still run the scoped
commands fresh and read their output before claiming the bug is fixed.
