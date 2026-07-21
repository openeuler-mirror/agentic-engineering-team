## SOP: Refine Development Plan

<guideline>

- The `.refine` copy is your working file; the original must remain untouched.
- Adjust the development plan to match the final design after refinement.

</guideline>

<instruct>

### [A3.1] Document Change

1. Copy the original development plan document to a `.refine` suffixed file (e.g., `development-plan.md.refine`).
2. Adjust the development plan in the `.refine` copy based on the final refined design — update task breakdown, dependencies, and effort estimates as needed.
3. DO NOT modify the original file.

**Completion**: `.refine` copy created and modified to reflect final design.

### [A3.2] Document Update

Manually update metadata and append a change record to the `.refine` copy (the old `bootstrap.mjs update-doc` script has been removed — there is no equivalent in the new skills):

- Bump the `version` field in frontmatter (e.g., `v1.0.0` → `v1.1.0`) and refresh `update_time`.
- Append a `## 变更记录` section at the end of the document recording: new version, date, author, and a bullet list of every plan-level change (task breakdown / dependencies / effort estimates) with the corresponding section anchor.

</instruct>

<constraint>

- NEVER modify the original file.
- ALWAYS record every change in the `## 变更记录` section of the `.refine` copy — never silently modify content without a change record entry.
- Only modify what the design changes actually require; do not restructure the entire plan.

</constraint>
