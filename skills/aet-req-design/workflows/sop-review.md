## SOP: Review

<instruct>

- Attempt to load the `aet-req-review` Skill to orchestrate the review pipeline. IF the Skill is unavailable, gracefully bypass this entire stage.
- Assemble and validate the precise inputs required for the review pipeline:
  1. **Target Deliverable**: The absolute path of the document generated in [A3].
  2. **Review Materials**: Resolve the absolute path to `references/deliverable-review.md` and pass it to the review Skill.
  3. **Checklist**: Resolve the absolute path to the checklist-set and hand it to the review Skill's SubAgent:
     - `<aet-req-design path>` → root directory of this `aet-req-design` skill.
     - Instruct the review Skill's SubAgent to read (NOT the main agent):
       - `<aet-req-design path>/references/_templates/req-design/checklist.md` as the checklist skeleton.
       - Each `*.aet.md` component under `components/` whose frontmatter declares a `checklist` field contributes the corresponding review items; inline them at their `{{component}}` placeholder positions.
     - The SubAgent reads the assembled checklist directly. **CRITICAL**: DO NOT execute this in the main agent.

</instruct>

<constraint>

- The checklist is assembled by reading `checklist.md` and inlining each component's frontmatter `checklist` field at its `{{component}}` placeholder — apply this uniformly rather than reading components ad hoc.

</constraint>

<patch>

- DO NOT assemble the checklist in the main agent — this is subagent-only work; delegate it to the review Skill's SubAgent to avoid corrupting the main agent's context.
- The checklist-set path MUST point at the `_templates/<folder>` directory (the same set consumed by template assembly), not at a single file.
- The checklist-set path MUST be absolute.
- `references/deliverable-review.md` is part of `aet-req-design`, not the `aet-req-review` Skill. Please ensure that the `aet-req-design` Skill is still loaded and accessible when performing the review.

</patch>
