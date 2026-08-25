## SOP: Refine Design

<guideline>

- Start from what the existing system looks like and what actually needs to change — not from "how do we implement the requirements."
- The `.refine` copy is your working file; the original must remain untouched.

</guideline>

<instruct>

### [A2.1] Analysis

- Read the relevant project code to understand how spec changes (or user input) affect the design.
- Reference project analysis design documents (if available, e.g., `.aet/project-analysis`) alongside a targeted code review — do not read the entire codebase.

**Completion**: impact of changes on existing design understood.

### [A2.2] Redesign

Answer the following three questions before making any document changes:

- **Module level**: which modules need to be added, modified, or deleted? Are responsibility boundaries broken?
- **Interface level**: which interface contracts need to change (new parameters, deprecations, etc.)? Are there compatibility risks?
- **SR-AR level**: which system requirements or assigned requirements need redefinition, modification, or removal?

**Cascade analysis** (must proactively explore, not limited to what the user stated):

- If module A's interface changes, do all its callers (B, C) need adjustment?
- If an AR's responsibilities are reassigned, do the associated SR acceptance criteria still hold?
- Are there implicit dependencies on data models, configuration items, or deployment scripts?

### [A2.3] Document Change

1. Run `node skills/aet-design-env/scripts/aet-design-env.mjs template skills/aet-req-design/references/_templates/req-design` via bash (do NOT read template files directly) to assemble and output the requirements design template, which describes the generation structure and conventions (the original document follows this template).
2. Copy the original requirements design specification to a `.refine` suffixed file (e.g., `FR001-xxx.md.refine`).
3. Modify the `.refine` copy — DO NOT modify the original file.
4. DO NOT modify metadata (frontmatter) unless required by the design change.
5. Make only necessary changes — do not bulk-refresh content. Appendices should be filled only as needed.

**Completion**: `.refine` copy created and modified.

### [A2.4] Document Review

- Check for conflicts, architectural soundness, and feasibility.
- Iterate fixes until no issues remain.

**Completion**: all conflicts and feasibility issues resolved.

### [A2.5] Document Update

Manually update metadata and append a change record to the `.refine` copy (the old `bootstrap.mjs update-doc` script has been removed — there is no equivalent in the new skills):

- Bump the `version` field in frontmatter (e.g., `v1.0.0` → `v1.1.0`) and refresh `update_time`.
- Append a `## 变更记录` section at the end of the document recording: new version, date, author, and a bullet list of every change made (module / interface / SR-AR level) with the corresponding section anchor.

### [A2.6] Cascade Notice

Continue to downstream refinement (plan) to keep it aligned with the design changes.

</instruct>

<constraint>

- NEVER modify the original file.
- ALWAYS record every change in the `## 变更记录` section of the `.refine` copy — never silently modify content without a change record entry.
- Keep changes minimal; do not bulk-refresh content.
- DO NOT change metadata (frontmatter) unless explicitly required by the design change.
- NEVER make design changes without first answering the three redesign questions.

</constraint>
