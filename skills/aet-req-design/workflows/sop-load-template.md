## SOP: Load Template

<instruct>

**Assemble the template**: Run via `bash` (NOT via `read`) the `aet-design-env` template command, pointing it at the req-design template-set directory of this skill:

```
node skills/aet-design-env/scripts/aet-design-env.mjs template skills/aet-req-design/scripts/_templates/req-design
```

The script outputs the fully assembled template (artifact + metadata + inlined components with adjusted heading levels and section numbers) on stdout. Use that stdout as the template to interpret for the generation stage.

</instruct>

<constraint>

- DO NOT read template files (e.g. `xxx-template.md`) directly — always go through the `aet-design-env` template command so component inlining, heading-level adjustment, and section numbering are applied uniformly.
- DO NOT generate any document without first loading and interpreting the assembled template.

</constraint>

<patch>

- The `aet-design-env` binary owns template assembly centrally; this skill no longer ships its own `assemble-template.mjs` for that purpose. The legacy `scripts/assemble-checklist.mjs` (review checklist) is **still** this skill's own script — see `sop-review.md`. Do not confuse the two.
- `template-set-path` MUST point at the `_templates/<folder>` directory (the folder containing `artifact.md`), not at a single file. For this skill that is `skills/aet-req-design/scripts/_templates/req-design`.
- The `template-set-path` may be workspace-relative (run from workspace root) or absolute. The script requires the path to **exist**; a non-existent path is a hard error (exit 1), not a silent fallback.

</patch>

<condition>

- IF there are unresolved items or conflicts in the template interpretation, THEN ask the user first, and only generate after confirmation.
- IF `aet-design-env/scripts/aet-design-env.mjs` is missing or `template-set-path` does not exist, THEN abort and respond: "Cannot assemble template: aet-design-env template script or req-design template-set is unavailable. Please provide or grant access before proceeding."

</condition>
