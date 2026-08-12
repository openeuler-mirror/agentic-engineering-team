## SOP: Review

<instruct>

- Attempt to load the `aet-req-review` Skill to orchestrate the review pipeline. IF the Skill is unavailable, gracefully bypass this entire stage.
- Assemble and validate the precise inputs required for the review pipeline:
  1. **Target Deliverable**: The absolute path of the document generated.
  2. **Review Materials**: Resolve the absolute path to `references/deliverable-review.md` and pass it to the review Skill.
  3. **Dynamic Checklist**: Resolve both placeholders to absolute paths, then hand the review Skill's SubAgent a single assembly command to execute via `node` (mirroring the `aet-design-env` pattern used in template assembly):
     - `<aet-design-env path>` → root directory of the `aet-design-env` skill.
     - `<aet-req-analysis path>` → root directory of this `aet-req-analysis` skill.
     - Instruct the review Skill's SubAgent to run (NOT the main agent):
       ```bash
       node <aet-design-env path>/aet-design-env/scripts/aet-design-env.mjs checklist <aet-req-analysis path>/references/_templates/req-analysis
       ```
     - The SubAgent reads the assembled checklist from the command's stdout. **CRITICAL**: DO NOT execute this in the main agent.

</instruct>

<constraint>

- DO NOT read `checklist.md` or component files (e.g. `xxx.aet.md`) directly — always go through the `aet-design-env checklist` command so `{{component}}` inlining and frontmatter `checklist`-field resolution are applied uniformly.

</constraint>

<patch>

- DO NOT execute `aet-design-env.mjs checklist` in the main agent — this is subagent-only work; delegate it to the review Skill's SubAgent to avoid corrupting the main agent's context.
- `checklist-set-path` MUST point at the `_templates/<folder>` directory (the same set consumed by `template` assembly), not at a single file.
- The `checklist-set-path` MUST be absolute.
- `references/deliverable-review.md` is part of `aet-req-analysis`, not the `aet-req-review` Skill. Please ensure that the `aet-req-analysis` Skill is still loaded and accessible when performing the review.

</patch>
