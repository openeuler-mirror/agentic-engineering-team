## SOP: Review

<instruct>

- Attempt to load the `aet-req-review` Skill to orchestrate the review pipeline. IF the Skill is unavailable, gracefully bypass this entire stage.
- Assemble and validate the precise inputs required for the review pipeline:
  1. **Target Deliverable**: The absolute path of the document generated in [A3].
  2. **Review Materials**: Resolve the absolute path to `references/deliverable-review.md` and pass it to the review Skill.
  3. **Static Checklist**: Resolve the absolute path to `references/development-plan-review-checklist.md` and pass it to the review Skill. The checklist is a single static file — the review SubAgent reads it directly, no script execution required.

</instruct>

<patch>

- DO NOT read the checklist file in the main agent — delegate it to the review SubAgent to avoid corrupting the main agent's context.

</patch>
