## SOP: Load Template

<instruct>

**Read the template-set directly**: Use the `read` tool to inspect this skill's req-design template-set directory:

1. Resolve the template-set path:
   - `<aet-req-design path>/references/_templates/req-design`
2. Read the skeleton file:
   - `<aet-req-design path>/references/_templates/req-design/artifact.md`
   - This is the document skeleton — it defines section structure, numbering, and placeholder slots.
3. Read the metadata component:
   - `<aet-req-design path>/references/_templates/req-design/components/metadata.md`
4. Read the component files as needed:
   - Each `*.aet.md` under `components/` corresponds to a `{{component}}` placeholder in `artifact.md`.
   - Inline each component's body at its placeholder position to assemble the full template.
5. Skip components whose frontmatter declares `condition: <library>=Generate, missing=Skip` when the corresponding library is absent (e.g., `architecture-element-library` is currently absent, so `arch-element-relation.aet.md` is skipped).

</instruct>

<constraint>

- DO NOT generate any document without first loading and interpreting the template skeleton (`artifact.md`) and its components.
- Treat the assembled template as a structural and content reference; produce the final document conforming to its section structure, numbering, and conventions.

</constraint>

<patch>

- The template-set path MUST point at the `_templates/<folder>` directory, not at a single file.
- The template-set path MUST be absolute.

</patch>

<condition>

- IF there are unresolved items or conflicts in the template interpretation, THEN ask the user first, and only generate after confirmation.
- IF the template-set path does not exist, THEN abort and respond: "Cannot load template: req-design template-set is unavailable. Please provide or grant access before proceeding."

</condition>
