# SOP: Requirements Parsing

<guideline>

- Read the full requirements document now — the metadata-only restriction from Stage 1 is lifted.
- Requirements may be structured as user stories, functional specs, bullet lists, or free-form prose. Parse regardless of format.
- Extract every requirement fragment that can be verified against code. A "fragment" is any claim about what the system does, should do, or must not do.
- Acceptance criteria are critical — extract each one as an individual, independently verifiable item.
- Non-functional requirements (performance, security, reliability, operability) must be extracted separately.

</guideline>

<instruct>

[S2.1] Read the full requirements document. Identify the document structure: sections, sub-sections, user stories, acceptance criteria, constraints, NFRs.

[S2.2] Extract every requirement into a structured entry. Each entry must include:
- **ID**: auto-assigned, e.g., `REQ-001`
- **Type**: `functional` / `nfr` / `constraint` / `acceptance_criteria` / `interface`
- **Description**: the requirement text
- **Section**: the document section containing this requirement
- **Verifiable**: `yes` / `no` — can this be objectively checked against code?
- **Category**: map to one of: `behavior` / `data_model` / `interface` / `configuration` / `security` / `dfx` / `architecture`
- **Keywords**: list of domain terms, action verbs, and numbers that can be grep'd in code

[S2.3] Extract acceptance criteria separately. For each AC:
- **AC-ID**: e.g., `AC-001`
- **Parent requirement**: links to `REQ-NNN`
- **Criterion**: verbatim text
- **Testability**: how this criterion could be verified (code search, test presence, config check)

[S2.4] Extract constraints separately:
- **CT-ID**: e.g., `CT-001`
- **Constraint**: verbatim text (must/must-not)
- **Enforcement**: how the constraint is expected to be enforced in code

[S2.5] Produce the structured output as a JSON block. Store in memory as `req_manifest.json`.

### Output Format

```json
{
  "doc_title": "string",
  "doc_path": "string",
  "requirements": [
    {
      "id": "REQ-001",
      "type": "functional|nfr|constraint|interface",
      "description": "string",
      "section": "string",
      "verifiable": true|false,
      "category": "behavior|data_model|interface|configuration|security|dfx|architecture",
      "keywords": ["term1", "term2"]
    }
  ],
  "acceptance_criteria": [
    {
      "id": "AC-001",
      "parent_req": "REQ-001",
      "criterion": "string",
      "testability": "string"
    }
  ],
  "constraints": [
    {
      "id": "CT-001",
      "constraint": "string",
      "enforcement": "string"
    }
  ]
}
```

</instruct>

<constraint>

- DO NOT modify, summarize, or paraphrase the requirement text. Preserve the original wording for evidence quotes.
- DO NOT skip unverifiable requirements — mark them as `verifiable: false` but include them. They may still surface drift in the review stage.
- DO NOT load the drift taxonomy or any Stage 4 materials during this stage.

</constraint>

<condition>

- IF the requirements document is empty or has no extractable requirements, THEN stop and report to user.
- IF the document uses an unfamiliar format (non-markdown), THEN attempt text extraction and warn the user about potential parsing inaccuracies.

</condition>
