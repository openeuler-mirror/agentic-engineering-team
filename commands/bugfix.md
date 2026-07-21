---
description: Bugfix workflow for AET - accepts bug descriptions, issue URLs, or CVE identifiers (CVE-YYYY-NNNNN); for CVEs branches into a dedicated vulnerability research → local-repo location → backport planning → build & verify flow, otherwise performs problem diagnosis, generates fix plans, implements fixes, verifies the solution, and submits a PR
agent: aet-bugfix
---

Start a bugfix workflow by invoking the aet-bugfix agent.

The bugfix agent will:
1. **Bug Diagnosis**: Systematically analyze bug causes, locate root causes, identify affected files
2. **Fix Planning**: Generate fix plans based on diagnosis reports
3. **Implementation**: Execute fixes following the plan
4. **Verification**: Verify the fix effectiveness

Provide a bug description or issue URL, and the bugfix agent will guide you through the complete fix workflow.

For CVE inputs (e.g. `CVE-2026-31431`), the agent automatically branches into the CVE
research + local-repo location flow and produces artifacts under `.aet/bugfix/{CVE-ID}/`.
