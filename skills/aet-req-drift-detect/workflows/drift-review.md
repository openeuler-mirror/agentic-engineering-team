# SOP: Drift Review

<guideline>

- **Three-way matching**: for each requirement, check (1) does a matching change entry exist? (2) does the change fulfill or contradict the requirement? (3) is the requirement absent from all change entries?
- **Total coverage scanning**: after one-to-one matching, scan remaining change entries for scope creep (changes that satisfy no requirement).
- **Confidence weighting**: mark each drift finding with a confidence level. Low-confidence items should use INFO severity.
- **Evidence quoting**: CRITICAL and HIGH items must have both code evidence (file:lines, snippet) and requirement evidence (section, verbatim text).

</guideline>

<instruct>

[S4.1] Load `references/drift-taxonomy.md` to have drift type and severity definitions available. (Already loaded by the parent stage — confirm it is in context.)

[S4.2] Load `req_manifest.json` (from Stage 2) and `change_manifest.json` (from Stage 3) into working memory.

[S4.3] For each requirement in the manifest, determine its implementation status:

### Status Classification

| Status | Meaning | Proceed To |
|--------|---------|-----------|
| `implemented` | A matching change entry exists AND it fulfills the requirement | No drift — note as verified |
| `contradicted` | A matching change entry exists but contradicts the requirement | Create drift item |
| `absent` | No change entry references this requirement | Needs investigation — is it implemented at baseline or missing? |
| `unverifiable` | Requirement is marked `verifiable: false` | Skip — note as unverifiable |

[S4.4] For `absent` requirements, verify whether the implementation existed at the baseline commit:
- Run `git show <base_commit>:<suspected_file>` or grep the baseline tree for keywords extracted in Stage 2.
- If the feature existed at baseline AND in the current commit, mark as `implemented` (feature was pre-existing, no drift).
- If the feature existed at baseline BUT was removed by the current commit, create a drift item (Feature Gap or Behavior Mismatch).
- If the feature did NOT exist at baseline AND does not exist now, create a drift item (Feature Gap — never implemented).

[S4.5] For each drift item found, create an entry:

### Drift Item Format

```json
{
  "id": "DRF-001",
  "drift_type": "DT01|DT02|...|DT10",
  "severity": "CRITICAL|HIGH|MEDIUM|LOW|INFO",
  "requirement_ref": {
    "req_id": "REQ-001",
    "ac_id": "AC-001 (optional)",
    "section": "3.2.1",
    "quote": "verbatim requirement text"
  },
  "location": {
    "file": "path/to/file",
    "lines": "42-58"
  },
  "evidence": {
    "requirement": "verbatim excerpt from requirements doc",
    "code": "code snippet showing the drift"
  },
  "suggestion": "concrete fix suggestion"
}
```

[S4.6] Classify each drift item using the drift taxonomy from `references/drift-taxonomy.md`. Apply the strictest matching type.

[S4.7] After all requirements are processed, scan remaining change entries (those not matched to any requirement) for scope creep:
- If a change entry has no corresponding requirement AND adds significant functionality, tag as `DT06 — Scope Creep` with MEDIUM severity.
- If a change entry is clearly a refactor, bugfix, or dependency update (no new functionality), do NOT classify as drift.

[S4.8] Sort all drift items by severity descending (CRITICAL first). Return as `drift_manifest.json` in memory.

</instruct>

<constraint>

- DO NOT use `absent` as drift by itself — a requirement may be pre-implemented at baseline. Always verify existence at baseline first.
- DO NOT classify test additions, refactoring, or comments as drift unless they contradict an explicit requirement.
- DO NOT assign CRITICAL severity without at least HIGH confidence in the evidence.
- DO NOT proceed to Stage 5 until all drift items are classified and sorted.

</constraint>

<condition>

- IF no drift items found AND no scope creep detected, THEN set `drift_manifest.json` to an empty array and proceed to Stage 5. The report will show zero drift.
- IF a `req_manifest.json` has no verifiable requirements (all `verifiable: false`), THEN stop and report to user — nothing to compare.
- IF `change_manifest.json` is empty (no changes between baseline and current), THEN check all requirements against the baseline. Create drift items for requirements not met at baseline.

</condition>
