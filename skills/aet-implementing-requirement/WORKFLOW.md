# Implementation Workflow

## Step 1: Read Design and Plan

- Read design document from provided path
- Read implementation plan for task breakdown
- Understand requirements and approach

### Implementation Plan Format (Checkbox Syntax)

The implementation plan **MUST use checkbox syntax** for task tracking:

```markdown
## Task 1: Component Name

**Files:**
- Create: `src/components/Component.tsx`
- Modify: `src/utils/helper.ts:10-20`
- Test: `tests/components/Component.test.tsx`

- [ ] **Step 1: Write the failing test**

```typescript
describe('Component', () => {
  it('should render correctly', () => {
    // test code
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Implement minimal code**

- [ ] **Step 4: Run test to verify it passes**

- [ ] **Step 5: Commit**

---

## Task 2: Next Component

...
```

## Step 1.5: Load Coding Standards (编程语言规范)

Before writing any code, load the coding standards that apply to this implementation. **These standards are the authoritative reference for how code must be written in this project/company.**

1. **Collect the target files** from the implementation plan's `Files:` sections (the files you will create / modify).
2. **Run the resolver** (动态解析,**禁止自行读取规范文件** —— 只有脚本会按分层覆盖顺序解析):

   ```bash
   node <skill path>/scripts/resolve-standards.mjs --files <comma-separated target files>
   ```

   - For framework variants the extension can't disambiguate (Django / React / Angular / NestJS / Qt), pass them explicitly: `--langs django,react`.
   - You may also use `--dir <path>` to scan a directory.
3. **Follow the returned document** for every file you create or modify. Its header lists, per language, **which config layer won** (项目自定义 → 项目基线 → 公司自定义 → 公司基线), so you know exactly which standard is in force.
4. If a language reports **「回退通用最佳实践」** (no standard at any layer), apply that language's general best practices and the project's existing style.

Resolution order (highest priority first):

```
./.aet/implement/custom/language-standards/<lang>.md   项目自定义
./.aet/implement/aet/language-standards/<lang>.md       项目基线
~/.aet/implement/custom/language-standards/<lang>.md    公司自定义
~/.aet/implement/aet/language-standards/<lang>.md        公司基线 (安装时 seed)
```

## Step 2: Execute Implementation

### For Each Task:
1. Follow each step exactly (plan has bite-sized steps)
2. Run verifications as specified
3. Mark task steps as completed by updating checkbox:
   - Change `- [ ]` to `- [x]` after completing each step
4. Commit after completing all steps in task

### Task Execution Example:
```
Task 1: User Authentication Component

Reading plan for Task 1...
Found 5 steps, all unchecked. Starting Task 1.

Executing Step 1: Write failing test
✓ Test written

Executing Step 2: Run test to verify it fails
✓ Test failed as expected

Executing Step 3: Implement minimal code
✓ Code implemented

Executing Step 4: Run test to verify it passes
✓ Test passed

Executing Step 5: Commit
✓ Committed

Updating Task 1 checkbox in plan file...
Moving to Task 2...
```

### Per-task Template & Light Path TDD Notes

**Per-task template authority (5 steps).**

The per-task checkbox template defined above in "Implementation Plan Format" is the
**authoritative** template for this skill — it has **5 steps** (Step 5 = Commit). This
WORKFLOW.md is the single source of truth for how `aet-implementing-requirement` executes
each task.

**Phase 6 fix-plan template inconsistency (ignore its Step 5).**

`aet-diagnosing-bug/SKILL.md` Phase 6 emits a fix-plan template with **6 steps** where
Step 5 is `Run full test suite` and Step 6 is `Commit`. This is a legacy inconsistency.
When consuming a fix-plan produced by `aet-diagnosing-bug`, **ignore the Phase 6 Step 5
`Run full test suite`** — it does not belong in the per-task loop. The full-suite
verification belongs to Step 4 of the bugfix workflow (`aet-checking-implementation`),
not to each per-task commit.

**Regression check scope.**

- Per-task verification runs **only** that task's specific test (the regression test
  written in Step 1 of the task).
- Regression checks should be **scoped** to the affected files — do not run unrelated
  tests at the per-task level.
- Full-suite verification (lint + entire test suite + build) is the responsibility of
  `aet-checking-implementation` (bugfix Step 4 / dev-plan Phase FINAL), not the per-task
  loop.

**Light path TDD (merged red-green commit).**

When the caller passes `path=light` (In-memory mode, `aet-bugfix` Size Triage passed),
the red-green discipline is preserved but **merged into a single commit is allowed**:

- Write the failing regression test (red).
- Apply the minimum code change to make it pass (green).
- Verify the test passes.
- Commit all three (test + fix + verification evidence) in **one** commit, rather than
  enforcing separate red and green commits.

The regression test must still cover the bug's Reproduction Steps or Trigger Conditions
(as captured in the inline summary's Acceptance Criteria). Skipping the regression test
entirely is **not** permitted in light path — only the commit granularity is relaxed.

## Step 3: Return Implementation Result

- Return path to implementation documentation
- Report completion status