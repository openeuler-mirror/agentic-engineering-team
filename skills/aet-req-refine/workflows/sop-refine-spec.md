## SOP: Refine Requirements Specification

<guideline>

- Preserve the original document structure and wording as much as possible — modify only what needs changing.
- The `.refine` copy is your working file; the original must remain untouched.

</guideline>

<instruct>

### [A1.1] Requirements Clarification

Before making changes, clarify understanding with the user:

> **Q1**: My current understanding is: [1, 2, ...]. Please confirm if this is correct.
> **Q2**: The following aspects are not yet clear: [1, 2, ...]. I see two possibilities A/B. Please confirm which is closer.

**Completion**: all ambiguities resolved with user confirmation.

### [A1.2] Change Analysis

Classify each change:

- **Incremental** (add): new requirement, new scenario.
- **Modification** (change): adjust existing requirement.
- **Deletion** (remove): remove existing requirement.

Proactively identify cascading impacts beyond what the user explicitly mentioned:

> **Q3**: I identified the following changes you requested: [1, 2, ...]. Do you need to add or modify any?
> **Q4**: I identified the following cascading-impact changes: [1, 2, ...]. Do you want to include these as well?

**Completion**: change list classified and confirmed with user.

### [A1.3] Document Change

1. Run `skills/aet-req-analysis/scripts/assemble-template.mjs req-analysis` via bash (do NOT read template files directly) to assemble and output the requirements analysis template, which describes the generation structure and conventions (the original document follows this template).
2. Copy the original requirements analysis specification to a `.refine` suffixed file (e.g., `FR001-xxx.md.refine`).
3. Modify the `.refine` copy — DO NOT modify the original file.
4. DO NOT modify metadata (frontmatter) unless required by the change.
5. Make only necessary changes — do not bulk-refresh content. Appendices should be filled only as needed.

**Completion**: `.refine` copy created and modified.

### [A1.4] Document Review

- Check for conflicts: ensure modified content does not contradict unchanged portions of the document.
- Iterate fixes until no conflicts remain.

**Completion**: all conflicts resolved.

### [A1.5] Document Update

Manually update metadata and append a change record to the `.refine` copy (the old `bootstrap.mjs update-doc` script has been removed — there is no equivalent in the new skills):

- Bump the `version` field in frontmatter (e.g., `v1.0.0` → `v1.1.0`) and refresh `update_time`.
- Append a `## 变更记录` section at the end of the document recording: new version, date, author, and a bullet list of every change made (incremental / modification / deletion) with the corresponding section anchor.

### [A1.6] Cascade Notice

Continue to downstream refinement (design, plan) to keep them aligned with the spec changes.

</instruct>

<constraint>

- NEVER modify the original file.
- ALWAYS record every change in the `## 变更记录` section of the `.refine` copy — never silently modify content without a change record entry.
- Keep changes minimal; do not bulk-refresh content.
- DO NOT change metadata (frontmatter) unless explicitly required by the spec change.

</constraint>
