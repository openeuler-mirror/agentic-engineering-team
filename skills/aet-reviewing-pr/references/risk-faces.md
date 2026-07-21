# 5 Risk Faces — Policy Document

> This is a **policy document for the LLM to consult during review**, not a
> set of automated rules. After the 2026-05 refactor we removed the regex
> rule engine — the LLM (in `aet-reviewing-pr` SKILL.md Step 4) looks at
> actual file content and judges risk-face membership semantically, which is
> more accurate than path-pattern matching.

**Risk-face = which sensitive area the change touches**. Orthogonal to "severity" (how serious a finding is). Severity says how urgent; risk-face says which territory the change wandered into.

Concept origin: Martin Fowler's "deadly triple" (loosely: a change you don't understand + you don't know is correct + is running in production) and a progressive-trust model for AI-assisted review — different risk levels should match different validation strengths and human-review thresholds.

## The 5 Faces

### `auth`
**What**: Authentication / authorization / credentials / sessions.
**Look for**: hash / sign / verify / token / session / credential / login / logout / RBAC / permission checks. Includes both implementation files and middleware that gates access.
**Human attention area**: Are auth / authorization / token / session semantics broken? Is there a way to bypass the check? Are credentials accidentally leaked into logs?
**Common false flags**: doc files about auth (not implementation), DI wiring that just passes auth services around, type definitions for auth payloads (no actual logic).

### `schema`
**What**: Database schema / migration changes.
**Look for**: SQL DDL (`CREATE/ALTER/DROP TABLE`, `ADD/DROP COLUMN`), ORM model files (declarative classes), migration framework files (Alembic, Prisma, Flyway, Liquibase).
**Human attention area**: Is the migration backward-compatible? What happens to in-flight queries during deployment? Is there a rollback plan? Are existing rows backfilled correctly?
**Common false flags**: schema-shaped TypeScript types / validators that are merely client-side mirrors (no DB impact), seed data updates that don't change structure.

### `mass-delete`
**What**: A file is removed entirely, or a large amount of code is removed in-place.
**Look for**: `patch.deleted_file === true` (binary; emitted automatically by the skeleton). For in-place "large removal" (e.g. 300+ lines deleted but the file remains), judge against project context — what counts as "large" depends on the project (a small library vs a large monorepo vs vendored code).
**Human attention area**: Are all references migrated? Is a deprecation window needed? Does the PR description acknowledge what was removed and why?
**Common false flags**: replacing vendored code with a dependency, extracting code to another file in the same PR, removing generated artifacts.

### `external-api`
**What**: External API surface / interface compatibility / public contracts.
**Look for**: REST/GRPC endpoint definitions, OpenAPI/Swagger specs, `.proto` files, SDK exports, client libraries' public surfaces. Watch for `breaking change` / `deprecated` annotations.
**Human attention area**: Is an existing API contract broken? Do clients need a synchronized upgrade? Is there an api-version bump or deprecation note?
**Common false flags**: internal helper renames that don't cross the API boundary, OpenAPI doc regeneration with no actual signature changes.

### `ci-cd`
**What**: CI / CD pipeline, build configuration, release infrastructure.
**Look for**: `.github/workflows/*`, `.gitlab-ci.yml`, `Dockerfile`, `Makefile`, build/release scripts, project templates that ship to other projects (e.g. `scripts/templates/`), `package.json` `engines` / `scripts`, `pyproject.toml` build hooks, container manifests.
**Human attention area**: Are existing project templates / pipelines compatible? Do default-value changes affect already-deployed environments? Is there a way for an existing user's project to break silently after pulling the new template?
**Common false flags**: doc updates inside `.github/` (workflow docs), changing a CI matrix entry that doesn't actually run, lint config updates that don't affect runtime.

## Project-Specific Risk Faces

If a project has domain-specific high-sensitivity areas (e.g. `ml-model` for weight/hyperparameter changes, `payment` for billing logic, `gdpr` for personal-data handling), add them to the project's `CLAUDE.md` or domain notes file:

```markdown
## PR Review Risk Faces (project-specific)

In addition to the 5 default faces, this project treats the following as high-risk:

- `ml-model` — model weights or hyperparameters in `models/` or `*.pt`/`*.onnx`. Check whether the change is tracked in the experiment registry.
- `payment` — anything under `billing/` or that calls the Stripe SDK. Check idempotency keys and webhook signature verification.
```

The LLM will pick this up during review and merge it with the default 5 faces.

## Anti-Patterns

❌ **Treating risk-face as a pre-requisite for review**: a file not hitting any face still needs to be reviewed — it's just not flagged for *extra* human attention.

❌ **Confusing risk-face with severity**: severity (how serious) and risk-face (which sensitive area) are orthogonal. A typo-only PR that touches `/auth/utils.ts` is `nit` severity, `auth` face — both fields set independently.

❌ **Over-segmenting risk faces**: 5 faces is a curated baseline. Resist adding 20 specialized faces — most should be project-specific (in `CLAUDE.md`), not global. Faces should represent "areas where mistakes are hard to roll back" not "areas of the codebase".
