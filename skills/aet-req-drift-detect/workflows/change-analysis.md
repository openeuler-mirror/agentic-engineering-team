# SOP: Change Analysis

<guideline>

- **File filtering**: skip files unlikely to contain drift-relevant changes: `*.md`, `*.svg`, `*.png`, `*.lock`, `*.sum`, `.gitignore`, `.editorconfig`, `LICENSE`, `*.txt` (except requirements/config). When in doubt about a file type, include it.
- **Diff summary mode**: for files with more than 50 changed lines, read a summary rather than line-by-line diff. Use `git diff --stat` for file-level overview, then targeted `git diff -U5 <path>` for specific hunks.
- **Delegation**: when the diff covers 10+ files across 3+ modules, delegate sub-agents per module directory. Each sub-agent receives its file list and returns classified entries.
- **One change entry per meaningful hunk**: unrelated changes in the same file produce separate entries. E.g., renaming a field AND adding a new endpoint in the same file = two entries.

</guideline>

<instruct>

[S3.1] Run `git diff --stat <base_commit> <current_commit>`. Read the stat output to assess scope.

[S3.2] If diff is small (≤5 files, ≤100 lines total), read each diff directly with `git diff -U5 <base_commit> <current_commit> -- <path>` for changed files.

[S3.3] If diff is large (10+ files across 3+ modules), delegate sub-agents. Group files by module directory and hand each group to a sub-agent. Each sub-agent reads its own diffs and returns structured JSON entries.

[S3.4] For each meaningful change, create an entry:

### Change Entry Format

```json
{
  "id": "CHG-001",
  "category": "behavior|architecture|configuration|data_model|interface|dependency|security|dfx",
  "file": "path/to/file",
  "lines": "42-58",
  "summary": "one-line description of what changed",
  "old": "concise description of old state",
  "new": "concise description of new state",
  "involves_test": true|false
}
```

### Change Categories

| Category | What It Captures |
|----------|-----------------|
| `behavior` | Business logic, computation, state transitions, error handling, return values, side-effect ordering |
| `architecture` | Layering, module decomposition, responsibility boundaries, package structure, extension points |
| `configuration` | Constants, default params, feature flags, environment variables, thresholds, retry/timeout values |
| `data_model` | Data structures, schema, field types, constraints, migrations, indexes, serialization format |
| `interface` | REST/RPC endpoints, public API signatures, event schemas, CLI flags, library exports |
| `dependency` | Package add/remove, version pin, vendor switch, sidecar service removal |
| `security` | AuthN/AuthZ, input validation, secret handling, encryption, sandboxing, audit logging |
| `dfx` | Availability, reliability, performance hot paths, observability, testability, maintainability |

[S3.5] Merge all entries from sub-agent results (if any) into a single master list sorted by category. Deduplicate any overlapping entries.

[S3.6] Return the master change list as a JSON array in memory as `change_manifest.json`.

</instruct>

<constraint>

- DO NOT skip any entry as "trivial". Every file change has a category — a dependency version bump is `dependency`, a timeout change is `configuration`.
- DO NOT read design docs requirements or any Stage 2/4 materials during this stage.
- DO NOT assign drift types or severities — that happens in Stage 4. This stage only classifies WHAT changed, not whether it constitutes drift.
- DO NOT merge multiple unrelated changes in one file into a single entry.

</constraint>

<condition>

- IF `git diff --stat` output is empty (no changes between commits), THEN proceed to Stage 4 with an empty change list. The drift review will check only whether the requirements are implemented at the baseline.
- IF sub-agents are used, AND the total diff is extremely large (50+ files), THEN sample ~20% of files per sub-agent and note the coverage gap in the output.

</condition>
