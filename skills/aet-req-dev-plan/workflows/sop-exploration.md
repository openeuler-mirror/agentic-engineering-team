### SOP: Plan Exploration

<guideline>

- **Trace every AR to its real file**. DO NOT stop at "module A handles this"; follow the implementation down to the file/function/line where the change actually lands.
- **Code is the sole source of truth**. If a design decision contradicts the code, the code wins — flag the contradiction back to the user.
- **Tailor exploration depth to Effort**. Low effort allows direct reading of design docs + targeted code. Medium/High effort delegates subagent exploration across all AR-relevant modules.
- **Honor fences**. Modules marked Protected / Not-Involved in the design must not appear as plan task targets — but their interfaces must be explored for compatibility.
- **Sub-Agent Output Specs**: To ensure efficiency and maximize information entropy (density), sub-agents must strictly adhere to the following:
  - **Extreme Conciseness**: Prefer `Key: Value` pairs or brief statements over long, complex sentences. List one fact per line. Never use two sentences when one suffices.
  - **Minimal Code Citation**: Avoid outputting >10 lines of code. Provide only essential snippets with exact location indices (`[filename:line_range]`), allowing the caller to review the full code as needed.
  - **Simplified Diagrams**: Strictly prohibit verbose ASCII art. Exclusively use compact syntax like Mermaid.

</guideline>

<instruct>

Start by reviewing the design's SR/AR decomposition and the module-change fences. For each AR (or equivalent design unit), enumerate:

- **Upstream callers & downstream dependents** of every module being touched — does the AR introduce new dependency edges, cycles, or layering violations?
- **Exact landing site**: file path(s), function/class/method names, line ranges where the change must be made. If multiple files, list each.
- **Existing pattern to mimic**: a sibling file/function that already implements the same shape of change — give its `[filename:line_range]` so the implementer can copy the pattern.
- **Fence compliance**: confirm the AR's target is not in a Protected / Not-Involved module. If the design accidentally placed a task in a fenced module, flag it back to the user.
- **Upstream gap**: any design ambiguity, missing interface contract, or undecided data model that blocks writing the task — record it for the §4.1 Upstream Gap Analysis section of the plan.

</instruct>

<constraint>

- DO NOT begin drafting tasks before exploring the codebase — vague "modify related code" tasks are forbidden.
- ALWAYS cap exploration sub-agents at a maximum of 4. Use the fewest required: 1–4 as needed, and prefer 1 over 2 whenever possible.
- NEVER delegate exploration of the design spec itself — read it directly in the main agent.

</constraint>

<condition>

- IF no codebase (greenfield project), THEN skip existing-system analysis and proceed directly to plan drafting. Framework-first scaffolding tasks must come first.
- IF Effort is Low, THEN direct reading of design docs and code is sufficient.
- IF Effort is Medium, THEN delegate subagent exploration on demand.
- IF Effort is High, THEN subagent exploration is mandatory across all AR-relevant modules.

</condition>
