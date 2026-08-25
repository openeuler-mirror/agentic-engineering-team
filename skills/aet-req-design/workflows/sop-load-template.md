## SOP: Load Template

<instruct>

**Assemble the template**: Run the `aet-design-env` template command via the `bash` tool (NOT the `read` tool), pointing it at this skill's req-design template-set directory:

1. Load the `aet-design-env` skill to obtain its assembly script path.
2. Resolve both placeholders to absolute paths before executing:
   - `<aet-design-env path>` → root directory of the `aet-design-env` skill.
   - `<aet-req-design path>` → root directory of this `aet-req-design` skill.
3. Execute the assembly command:
   ```
   node <aet-design-env path>/aet-design-env/scripts/aet-design-env.mjs template <aet-req-design path>/references/_templates/req-design
   ```
4. Interpret the assembled template directly from the command's stdout.

</instruct>

<constraint>

- DO NOT read template files (e.g. `xxx-template.md`) directly — always go through the `aet-design-env` template command so component inlining, heading-level adjustment, and section numbering are applied uniformly.
- DO NOT generate any document without first loading and interpreting the assembled template.

</constraint>

<patch>

- `template-set-path` MUST point at the `_templates/<folder>` directory, not at a single file.
- The `template-set-path` MUST be absolute.

</patch>

<condition>

- IF there are unresolved items or conflicts in the template interpretation, THEN ask the user first, and only generate after confirmation.
- IF `aet-design-env/scripts/aet-design-env.mjs` is missing or `template-set-path` does not exist, THEN abort and respond: "Cannot assemble template: aet-design-env template script or req-design template-set is unavailable. Please provide or grant access before proceeding."

</condition>
