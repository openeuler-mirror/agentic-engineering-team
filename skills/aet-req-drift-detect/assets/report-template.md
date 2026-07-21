<role>
Output template for drift report generation. Loaded in Stage 5. Fill every section following the HTML annotations.
</role>

<!-- instruct: This is the standard drift report format. Every CRITICAL and HIGH severity item MUST include both code evidence and requirement evidence. -->

---
req_doc: {{REQ_DOC_PATH}}
req_doc_title: {{REQ_DOC_TITLE}}
base_commit: {{BASE_COMMIT}}
current_commit: {{CURRENT_COMMIT}}
generated_at: {{GENERATED_AT}}
---

# Requirements Drift Report — {{REQ_DOC_TITLE}}

## Summary

| Metric | Value |
|--------|-------|
| Requirements parsed | {{N_REQS}} features / {{N_ACS}} acceptance criteria |
| Change entries (semantic model) | {{N_CHANGES}} |
| Drift items found | {{N_DRIFT}} |
| Weighted drift rate | {{DRIFT_RATE}}% |

> Weighted drift rate = ((CRITICAL x 5 + HIGH x 3 + MEDIUM x 2 + LOW x 1) / (change entries x 5)) x 100, clamped to [0, 100], one decimal place.

### Severity Breakdown

| CRITICAL | HIGH | MEDIUM | LOW | INFO |
|----------|------|--------|-----|------|
| {{N_CRITICAL}} | {{N_HIGH}} | {{N_MEDIUM}} | {{N_LOW}} | {{N_INFO}} |

<!-- condition: if no drift items found, output the single-row table below and skip the detailed findings section. -->
> | - | - | - | - | - | - |
> | - | - | - | - | - | No drift items found. |

## Detailed Findings

<!-- instruct: one row per drift item, sorted by severity descending (CRITICAL first) -->

| ID | Drift Type | Severity | Requirement Ref | Location | Evidence | Suggestion |
|----|-----------|----------|----------------|----------|----------|------------|
| {{ID}} | {{DRIFT_TYPE}} | {{SEVERITY}} | {{REQ_REF}} — "{{REQ_QUOTE}}" | {{FILE_PATH}}:{{LINE_NUM}} | Requirement: "{{REQ_EXCERPT}}"<br>Code: `{{CODE_EXCERPT}}` | {{SUGGESTION}} |

## Recommendations

<!-- condition: if only INFO items exist, generate a single-line note: "Only documentation updates needed — code is consistent with intent." -->

<!-- instruct: summarize the top actionable items, grouped by severity. Each CRITICAL/HIGH item MUST include a concrete fix suggestion. Keep under 300 words. -->

## Appendix: Unchanged Requirements

<!-- instruct: list requirements that were checked and found to be correctly implemented, with confidence (high/medium/low). This demonstrates thoroughness. Optional — skip if the list would be too long. -->

| Requirement | Confidence | Evidence |
|-------------|-----------|----------|
| {{REQ_DESC}} | {{HIGH / MEDIUM / LOW}} | {{brief note on why confident}} |
