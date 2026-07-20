## SOP: Generation

<guideline>

- Keep it concise without sacrificing quality, and never exceed actual needs (see Effort).
- More content is not necessarily better — never exceed actual requirements.

## Unsourced Quantitative Values — Universal Placeholder Convention

- **Hard rule**: ALL quantitative values across the document, NEVER state a specific quantitative value as a fact unless it has a source (user input, named benchmark/report, codebase evidence, or authoritative spec).
- **When no source exists**: the value's only legitimate form is a placeholder token. Do NOT emit a bare number.
- **Token syntax** (wrap in backticks so it renders distinctly in markdown):

```markdown
`[[PH:<id> | rec:<recommended value, optional> | why:<one-line reason, optional>]]`
```

- **Aggregation hook**: downstream review may regex-scan `\[\[PH:([^\]|]+)` to enumerate unfilled placeholders.

</guideline>

<instruct>

- **Clarify what to include**
  - `<!-- condition: -->` → gate on whether to generate the section at all:
  - e.g. `<!-- condition: Low=Skip, Medium=AsNeeded, High=Generate -->` → gate on Effort level; Low always skips, Medium generates only when necessary for clarity, High generates always.
  - When the template has no annotation on a section, generate by default.
- **Secondary exploration**: When the template still has information gaps, perform additional exploration and plan revisions until the content is complete and reasonable.
- **Generate the document to the designated location**: `./ai_assistance/features/{feature-name}/implementation/dev-plan.md` (or `.aet/{task-id}/implementation/dev-plan.md` for non-feature tasks).
- **Output a document summary** for the user to review quickly.

</instruct>

<constraint>

- DO NOT generate any document without reading the template first.
- ALWAYS ensure consistency across template sections; no conflicts or omissions in the plan content.
- NEVER copy comments (e.g. `<!-- xxx: xxx -->`) into the generated document as body content. Strip all comments from the final output.
- NEVER include design decisions in the plan — the plan references the design, it does not re-make design decisions.
- NEVER write a task that violates the design's fences (Protected / Not-Involved modules).

</constraint>
