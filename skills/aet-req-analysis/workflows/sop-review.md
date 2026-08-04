## SOP: Review

<instruct>

- Attempt to load the `aet-req-review` Skill to orchestrate the review pipeline. IF the Skill is unavailable, gracefully bypass this entire stage.
- Assemble and validate the precise inputs required for the review pipeline:
  1. **Target Deliverable**: The absolute path of the document generated.
  2. **Review Materials**: Resolve the absolute path to `references/deliverable-review.md` and pass it to the review Skill.
  3. **Dynamic Checklist**: Resolve the absolute path to `scripts/assemble-checklist.mjs` and instruct the review Skill's SubAgent to execute it via `node <abs-path>/assemble-checklist.mjs req-analysis`. It dynamically evaluates and derives the checklist results. **CRITICAL**: DO NOT execute this yourself. Pass the absolute script path to the review Skill, explicitly instructing its SubAgent to run it via `node`.

</instruct>

<patch>

- DO NOT execute `assemble-checklist.mjs` or read any template files in the main agent — this is subagent-only work; delegate it to avoid corrupting the main agent's context.

</patch>
