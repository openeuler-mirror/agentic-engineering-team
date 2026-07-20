# Drift Taxonomy

## Drift Types

| # | Drift Type | Definition | Typical Severity | Example |
|---|-----------|------------|-----------------|---------|
| DT01 | **Feature Gap** | A required feature, user story, or capability is entirely missing from the implementation. | CRITICAL / HIGH | Requirements say "user can reset password via email link" — no reset-password endpoint exists. |
| DT02 | **Behavior Mismatch** | A feature exists but behaves differently than specified. Logic, state transitions, output format, or side-effect order differs. | CRITICAL / HIGH / MEDIUM | Requirements say "discount applied before tax" — code applies tax first. |
| DT03 | **Acceptance Failure** | A specific acceptance criterion is not satisfied. Each criterion is independently verifiable. | CRITICAL / HIGH | AC: "error message shown within 500ms" — no timing guarantee in implementation. |
| DT04 | **NFR Violation** | Non-functional requirement (latency, throughput, availability, observability, testability) is not met or its mechanism is absent. | HIGH / MEDIUM | Requirements require "P99 < 200ms" — no performance instrumentation exists. |
| DT05 | **Constraint Breach** | An explicit constraint in the requirements is violated (must-not or must-only). | CRITICAL / HIGH | Requirements say "must NOT store PII in logs" — log statements include email addresses. |
| DT06 | **Scope Creep** | Implementation adds significant functionality not described in requirements, without justification. | MEDIUM / LOW | Code includes an admin dashboard not mentioned in any requirement. |
| DT07 | **Interface Drift** | Public API, CLI, event schema, or data contract differs from what requirements specify. | CRITICAL / HIGH / MEDIUM | Requirements say endpoint returns `{userId}` — implementation returns `{id}`. |
| DT08 | **Validation Gap** | Input validation, authorization check, or sanitization specified in requirements is missing or weakened. | CRITICAL / HIGH | Requirements mandate "rate limit: 10 req/s per user" — no rate limiter implemented. |
| DT09 | **Config Drift** | A configurable parameter (timeout, retry, threshold, flag default) is set to a value that contradicts requirements. | MEDIUM / HIGH | Requirements say "retry count = 3" — code uses retry count = 5. |
| DT10 | **Requirement Stale** | The requirement no longer matches reality — the code change is reasonable but the document was not updated. | INFO | Requirement mentions a feature now intentionally removed, with commit history showing the rationale. |

## Severity Matrix

| Severity | Definition | Disposition |
|----------|-----------|-------------|
| CRITICAL | Safety/security requirement broken, core functional gap that blocks the user story, contract broken that external callers depend on. | Must fix before release. |
| HIGH | Important functional gap, NFR violation affecting user experience, explicit constraint broken. | Must fix or explicitly acknowledge with a documented decision. |
| MEDIUM | Partial implementation, minor behavior deviation, soft NFR dropped. | Should fix; can ship with a tracking item. |
| LOW | Cosmetic gap, documentation-documented behavior slight mismatch, minimal user impact. | Suggest improvement. |
| INFO | Only the requirements document is outdated — the code is correct and the change is reasonable. | Update document. |

## Classification Rules

- **Strictest type wins**: When a drift item fits multiple types, pick the one with the highest typical severity. E.g., a missing validation is both `Feature Gap` and `Validation Gap` — use `Validation Gap` (which defaults to CRITICAL/HIGH).
- **One item per root cause**: A component that is missing entirely produces one `Feature Gap` item, not one per sub-feature.
- **Code quality is not drift**: If the requirements do not mandate a specific structure or pattern, a messy but functionally correct implementation is not drift. Do not classify code smells as drift items.
- **Evidence must be specific**: Every CRITICAL and HIGH drift item requires a code quote (with line number) and a requirement quote (with section reference).
