---
name: aet-checking-bad-smell
description: Code quality inspection skill - detects code bad smells based on Martin Fowler's refactoring catalog, covering naming issues, structural problems, OOP violations, control flow issues, dead code, and over-engineering. Loads matching reference guides and produces actionable refactoring suggestions.
---

## Language Detection and Response

Automatically detect the language of user input and respond in the same language.

## When to Use

Use this skill when:
- You need to review code quality and identify bad smells
- You want to detect design issues, redundant code, and readability problems
- You need refactoring recommendations with priority guidance
- Called from the `aet-reviewing-code` orchestrator skill

---

## Core Inspection Methodology

### Phase 1: Bad Smell Detection Scan

Scan the target code for each category below.
**For each matched bad smell, load the linked reference file and follow its detection rules.**

#### Category A — Naming & Readability → [code-smell-naming.md](reference/code-smell-naming.md)

| Bad Smell | Detection Signal |
|-----------|-----------------|
| Mysterious Name | Variable/function name ≤ 2 chars (non-loop index); name is `temp/data/info/flag/obj/val/res` without meaningful qualifier |
| Long Method | Function body > 30 lines; nesting depth > 3; function name contains `And`; multiple comment-separated logic sections inside one function |

#### Category B — Structural Problems → [code-smell-structure.md](reference/code-smell-structure.md)

| Bad Smell | Detection Signal |
|-----------|-----------------|
| Duplicated Code | Similar code blocks (> 5 lines) appear ≥ 2 times; identical logic in sibling or unrelated functions |
| Long Parameter List | Function with > 4 parameters; multiple same-type adjacent parameters |
| Global Data | `public static` mutable fields; singleton class holding mutable state; module-level variables mutated across files |
| Data Clumps | 3+ data items always passed together to multiple functions |

#### Category C — OOP Problems → [code-smell-oop.md](reference/code-smell-oop.md)

| Bad Smell | Detection Signal |
|-----------|-----------------|
| Large Class | File > 300 lines; class with > 15 fields or > 20 methods; class named `*Manager/*Handler/*Processor/*Utils` |
| Feature Envy | Method calls 3+ getters on another class; method uses more external data than its own |
| Primitive Obsession | String used for phone/currency/ID types; int literal as type discriminator (magic number) |
| Message Chains | Method chain depth > 3, e.g. `a.getB().getC().getD()` |
| Middle Man | > 50% of class methods are single-line delegation calls with no added logic |

#### Category D — Control Flow Problems → [code-smell-oop.md](reference/code-smell-oop.md)

| Bad Smell | Detection Signal |
|-----------|-----------------|
| Deep Nesting | Code indentation level > 4 (4+ nested blocks) |
| Flag Argument | Boolean parameter controlling which behavior a function executes |
| Null Check Proliferation | Same variable null-checked in 3+ separate places |
| Repeated Conditional | Identical condition (e.g. `if (user.isAdmin())`) appearing in 3+ places |

#### Category E — Module, Comments & Dead Code → [code-smell-module.md](reference/code-smell-module.md)

| Bad Smell | Detection Signal |
|-----------|-----------------|
| Divergent Change | Class modified for multiple unrelated reasons (e.g. mixes IO + business logic + formatting) |
| Shotgun Surgery | One concept or rule is scattered across 5+ files requiring simultaneous edits |
| Speculative Generality | Interface with only one implementation; abstract methods that are empty no-ops; unused parameters |
| Commented-Out Code | 3+ consecutive comment lines that contain code syntax |
| Excessive Comments | Comment restates exactly what the adjacent code already clearly expresses |
| Dead Code | Unused imports, unreachable branches (`if false`), never-called private methods, empty catch blocks |

### Phase 2: Reference-Guided Confirmation

For each detected bad smell:
1. **Load the linked reference** (e.g., `[code-smell-naming.md](reference/code-smell-naming.md)`)
2. **Apply the detection rules** in the reference to confirm the smell is genuine
3. **Assess severity**:

| Severity | Bad Smells |
|---------|-----------|
| High | Duplicated Code, Large Class, Long Method, Shotgun Surgery |
| Medium | Feature Envy, Long Parameter List, Deep Nesting, Divergent Change, Dead Code |
| Low | Mysterious Name, Message Chains, Flag Argument, Excessive Comments, Middle Man |

4. **Identify the refactoring technique**: Extract Method, Introduce Parameter Object, Move Method, Replace Conditional with Polymorphism, etc.

### Phase 3: Finding Documentation

For each confirmed bad smell:

```
### [SEVERITY] Bad Smell Type — File:Line

**Description**: What the smell is and why it is problematic.

**Affected Code**:
(condensed code snippet)

**Why It Hurts**:
Specific impact on maintainability / readability / testability.

**Refactoring Technique**:
Name of applicable refactoring (e.g., Extract Method).

**Suggested Fix**:
Concrete before/after code example.
```

---

## Output Format

```markdown
# Code Quality Inspection Report

## Summary
- Files analyzed: N
- Bad smells detected: N (High: X, Medium: X, Low: X)

## High Priority Issues

### [HIGH] Duplicated Code — src/service/OrderService.java:45 & :89
...

### [HIGH] Large Class — src/controller/UserController.java
...

## Medium Priority Issues

### [MEDIUM] Long Parameter List — src/api/ReportApi.java:23
...

## Low Priority Issues

### [LOW] Mysterious Name — src/util/DataHelper.java:12
...

## Technical Debt Summary
Estimated effort to address all findings: [Small / Medium / Large]
Recommended refactoring sequence: ...
```
