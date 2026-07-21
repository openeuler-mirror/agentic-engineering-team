# 7-Axis Code Review Checklist

> **Source attribution**: The main body of this document (sections "Review Process Overview" through "Resources" below) is **adapted from [`SpillwaveSolutions/pr-reviewer-skill`](https://github.com/SpillwaveSolutions/pr-reviewer-skill)** (`references/review_criteria.md`).
>
> ⚠️ **License caveat**: The source repository does **not** contain a LICENSE file at the time of this copy. We rely on attribution + transformative-use norms. See [`../LICENSES/SpillwaveSolutions-pr-reviewer-skill.NOTICE.md`](../LICENSES/SpillwaveSolutions-pr-reviewer-skill.NOTICE.md) for details and removal guidance.
>
> AET-authored sections (axis-coverage matrix below, and "Confidence Scoring" at the end) are clearly marked.

---

## AET-Authored: Axis Coverage Matrix

Which component of `aet-reviewing-code` covers each axis:

| Axis | Covered by |
|---|---|
| 1. Functionality & Correctness | This skill — Step 4 (inline LLM review) |
| 2. Security & Best Practices   | This skill — Step 2 (`security-check` sub-skill) |
| 3. Testing & Quality Assurance | This skill — Step 5 (inline LLM review). Covers both **coverage gap** (does each changed source have a matching test?) and **test quality** (do the tests assert behavior?). |
| 4. Readability & Maintainability | This skill — Step 3 (`aet-checking-bad-smell` sub-skill) |
| 5. Performance & Efficiency    | This skill — Step 6 (inline LLM review) |
| 6. Style & Conventions         | Mostly delegated to linters (filtered out — see `false-positive-filter.md`); LLM only flags project-convention violations linters miss |
| 7. Overall PR Quality          | This skill — Step 7 (inline LLM review, only when `--pr-context` is supplied) |

The LLM reviewer should **sweep axes 1→7 in order**, considering "is there anything to write here?" at each axis. **You do NOT need a finding from every axis** — if it's clean, skip.

A medium-sized PR typically produces findings in 3–5 axes, totaling 5–15. **>20 findings** usually means noise — apply false-positive filtering.

---

## Code Review Criteria

*The following sections are reproduced from `SpillwaveSolutions/pr-reviewer-skill/references/review_criteria.md`.*

This document outlines the comprehensive criteria for conducting pull request code reviews. Use this as a checklist when reviewing PRs to ensure thorough, consistent, and constructive feedback.

## Review Process Overview

When reviewing a PR, the goal is to ensure changes are:
- **Correct**: Solves the intended problem without bugs
- **Maintainable**: Easy to understand and modify
- **Aligned**: Follows project standards and conventions
- **Secure**: Free from vulnerabilities
- **Tested**: Covered by appropriate tests

## 1. Functionality and Correctness

### Problem Resolution
- [ ] **Does the code solve the intended problem?**
  - Verify changes address the issue or feature described in the PR
  - Cross-reference with linked tickets (JIRA, GitHub issues)
  - Test manually or run the code if possible

### Bugs and Logic
- [ ] **Are there bugs or logical errors?**
  - Check for off-by-one errors
  - Verify null/undefined/None handling
  - Review assumptions about inputs and outputs
  - Look for race conditions or concurrency issues
  - Check loop termination conditions

### Edge Cases and Error Handling
- [ ] **Edge cases handled?**
  - Empty collections (arrays, lists, maps)
  - Null/None/undefined values
  - Boundary values (min/max integers, empty strings)
  - Invalid or malformed inputs

- [ ] **Error handling implemented?**
  - Network failures
  - File system errors
  - Database connection issues
  - API errors and timeouts
  - Graceful degradation

### Compatibility
- [ ] **Works across supported environments?**
  - Browser compatibility (if web app)
  - OS versions (if desktop/mobile)
  - Database versions
  - Language/runtime versions
  - Doesn't break existing features (regression check)

## 2. Readability and Maintainability

### Code Clarity
- [ ] **Easy to read and understand?**
  - Meaningful variable names (avoid `x`, `temp`, `data`)
  - Meaningful function names (verb-first, descriptive)
  - Short methods/functions (ideally < 50 lines)
  - Logical structure and flow
  - Minimal nested complexity

### Modularity
- [ ] **Single Responsibility Principle?**
  - Functions/methods do one thing well
  - Classes have a clear, focused purpose
  - No "god objects" or overly complex logic

- [ ] **Suggest refactoring if needed:**
  - Extract complex logic into helper functions
  - Break large functions into smaller ones
  - Separate concerns (UI, business logic, data access)

### Code Duplication
- [ ] **DRY (Don't Repeat Yourself)?**
  - Repeated code abstracted into helpers
  - Shared logic moved to libraries/utilities
  - Avoid copy-paste programming

### Future-Proofing
- [ ] **Allows for easy extensions?**
  - Avoid hard-coded values (use constants/configs)
  - Use dependency injection where appropriate
  - Follow SOLID principles
  - Consider extensibility without modification

## 3. Style and Conventions

### Style Guide Adherence
- [ ] **Follows project linter rules?**
  - ESLint (JavaScript/TypeScript)
  - Pylint/Flake8/Black (Python)
  - RuboCop (Ruby)
  - Checkstyle/PMD (Java)
  - golangci-lint (Go)

- [ ] **Formatting consistent?**
  - Proper indentation (spaces vs. tabs)
  - Consistent spacing
  - Line length limits
  - Import/require organization

### Codebase Consistency
- [ ] **Matches existing patterns?**
  - Follows established architectural patterns
  - Uses existing utilities and helpers
  - Consistent naming conventions
  - Matches idioms of the language/framework

### Comments and Documentation
- [ ] **Sufficient comments?**
  - Complex algorithms explained
  - Non-obvious decisions documented
  - API contracts clarified
  - TODOs tracked with ticket numbers

- [ ] **Not excessive?**
  - Code should be self-documenting where possible
  - Avoid obvious comments ("increment i")

- [ ] **Documentation updated?**
  - README reflects new features
  - API docs updated
  - Inline docs (JSDoc, docstrings, etc.)
  - Architecture diagrams current

## 4. Performance and Efficiency

### Resource Usage
- [ ] **Algorithm efficiency?**
  - Avoid O(n²) or worse in loops
  - Use appropriate data structures
  - Minimize database queries (N+1 problem)
  - Avoid unnecessary computations

### Scalability
- [ ] **Performs well under load?**
  - No blocking operations in critical paths
  - Async/await for I/O operations
  - Pagination for large datasets
  - Caching where appropriate

### Optimization Balance
- [ ] **Optimizations necessary?**
  - Premature optimization avoided
  - Readability not sacrificed for micro-optimizations
  - Benchmark before complex optimizations
  - Profile to identify actual bottlenecks

## 5. Security and Best Practices

### Vulnerabilities
- [ ] **Common security issues addressed?**
  - SQL injection (use parameterized queries)
  - XSS (Cross-Site Scripting) - proper escaping
  - CSRF (Cross-Site Request Forgery) - tokens
  - Command injection
  - Path traversal
  - Authentication/authorization checks

### Data Handling
- [ ] **Sensitive data protected?**
  - Encrypted in transit (HTTPS/TLS)
  - Encrypted at rest
  - Input validation and sanitization
  - Output encoding
  - PII handling compliance (GDPR, etc.)

- [ ] **Secrets management?**
  - No hardcoded passwords/API keys
  - Use environment variables
  - Use secret management systems
  - No secrets in logs

### Dependencies
- [ ] **New packages justified?**
  - Actually necessary
  - From trusted sources
  - Up-to-date and maintained
  - No known vulnerabilities
  - License compatible

- [ ] **Dependency management?**
  - Lock files committed
  - Minimal dependency footprint
  - Consider alternatives if bloated

## 6. Testing and Quality Assurance

### Test Coverage
- [ ] **Tests exist for new code?**
  - Unit tests for individual functions/methods
  - Integration tests for workflows
  - End-to-end tests for critical paths

- [ ] **Tests cover scenarios?**
  - Happy paths
  - Error conditions
  - Edge cases
  - Boundary conditions

### Test Quality
- [ ] **Tests are meaningful?**
  - Not just for coverage metrics
  - Assert actual behavior
  - Test intent, not implementation
  - Avoid brittle tests

- [ ] **Test maintainability?**
  - Clear test names
  - Arrange-Act-Assert pattern
  - Minimal test duplication
  - Fast execution

### CI/CD Integration
- [ ] **Automated checks pass?**
  - Linting
  - Tests (unit, integration, e2e)
  - Build process
  - Security scans
  - Code coverage thresholds

## 7. Overall PR Quality

### Scope
- [ ] **PR is focused?**
  - Single feature/fix per PR
  - Not too large (< 400 lines ideal)
  - Suggest splitting if combines unrelated changes

### Commit History
- [ ] **Clean, atomic commits?**
  - Each commit is logical unit
  - Descriptive commit messages
  - Follow conventional commits if applicable
  - Avoid "fix", "update", "wip" vagueness

### PR Description
- [ ] **Clear description?**
  - Explains **why** changes were made
  - Links to tickets/issues
  - Steps to reproduce/test
  - Screenshots for UI changes
  - Breaking changes called out
  - Migration steps if needed

### Impact Assessment
- [ ] **Considered downstream effects?**
  - API changes (breaking vs. backward-compatible)
  - Database schema changes
  - Impact on other teams/services
  - Performance implications
  - Monitoring and alerting needs

## Review Feedback Guidelines

### Communication Style
- **Be constructive and kind**
  - Frame as suggestions: "Consider X because Y"
  - Not criticism: "This is wrong"
  - Acknowledge good work
  - Explain the "why" behind feedback

### Prioritization
- **Focus on critical issues first:**
  1. Bugs and correctness
  2. Security vulnerabilities
  3. Performance problems
  4. Design/architecture issues
  5. Style and conventions

### Feedback Markers
Use clear markers to indicate severity:
- **🔴 Blocker**: Must be fixed before merge
- **🟡 Important**: Should be addressed
- **🟢 Nit**: Nice to have, optional
- **💡 Suggestion**: Consider for future
- **❓ Question**: Clarification needed
- **✅ Praise**: Good work!

### Time Efficiency
- Review promptly (within 24 hours)
- For large PRs, review in chunks
- Request smaller PRs if too large
- Use automated tools to catch style issues

### Decision Making
- **Approve**: Solid overall, minor nits acceptable
- **Request Changes**: Blockers must be addressed
- **Comment**: Provide feedback without blocking

## Language/Framework-Specific Considerations

### JavaScript/TypeScript
- Type safety (TypeScript)
- Promise handling (avoid callback hell)
- Memory leaks (event listeners)
- Bundle size impact

### Python
- PEP 8 compliance
- Type hints (Python 3.5+)
- Virtual environment dependencies
- Generator usage for memory efficiency

### Java
- Memory management
- Exception handling (checked vs. unchecked)
- Thread safety
- Immutability where appropriate

### Go
- Error handling (no exceptions)
- Goroutine management
- Channel usage
- Interface design

### SQL/Database
- Index usage
- Query performance
- Transaction boundaries
- Migration reversibility

### Frontend (React, Vue, Angular)
- Component reusability
- State management
- Accessibility (a11y)
- Performance (re-renders, bundle size)

## Tools and Automation

Leverage tools to automate checks:
- **Linters**: ESLint, Pylint, RuboCop
- **Formatters**: Prettier, Black, gofmt
- **Security**: Snyk, CodeQL, Dependabot
- **Coverage**: Codecov, Coveralls
- **Performance**: Lighthouse, WebPageTest
- **Accessibility**: axe, WAVE

## Resources

- Google Engineering Practices: https://google.github.io/eng-practices/review/
- GitHub Code Review Guide: https://github.com/features/code-review
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- Clean Code (Robert C. Martin)
- Code Complete (Steve McConnell)

---

## AET-Authored: Confidence Scoring (every LLM finding must carry one)

> The above review criteria are sourced from SpillwaveSolutions. The confidence-scoring rubric below is AET-authored, adapted from the official `anthropics/claude-code` code-review plugin (0–100 confidence, threshold 80).

Every finding the LLM emits must carry `confidence: 0-100`. Findings below the threshold (default 80) are **hidden from the posted PR comment** but kept in `internal.md` for audit.

Suggested scoring guide:

| Confidence | When to use |
|---|---|
| **95–100** | Almost certainly a real issue. You can point to a concrete bug, hit a confirmed pattern (e.g. SQL injection in a SELECT clause), or it's a verified contract break |
| **85–94** | Strong case. Pattern matches a known anti-pattern but you can't 100% rule out a deliberate design choice |
| **80–84** | Borderline — visible at the threshold. Issue is plausible but you'd want a human to confirm |
| **60–79** | Speculation. Looks suspicious but could easily be fine; needs context you don't have. **Will be hidden from the comment** |
| **< 60** | Don't even emit — it's noise |

When in doubt, **score lower, not higher**. A confident PR review beats a long one full of "maybe" findings.

## AET-Authored: Severity Mapping (SpillwaveSolutions markers → AET 6 tiers)

The SpillwaveSolutions feedback-markers section above uses 6 markers; map them to AET's 6 severity tiers:

| SpillwaveSolutions marker | AET severity |
|---|---|
| 🔴 Blocker | `blocking` |
| 🟡 Important | `important` |
| 🟢 Nit | `nit` |
| 💡 Suggestion | `suggestion` |
| ❓ Question | typically `learning` (educate the author) or `important` if the question reveals a real concern |
| ✅ Praise | `praise` |

See [`severity-rubric.md`](severity-rubric.md) for the AET tier definitions and decision tree.
