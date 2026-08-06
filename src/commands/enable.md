---
description: Enable AET for the current coding agent.
disable-model-invocation: true
effort: low
allowed-tools: Bash(aet:*) Skill(aet-install) Skill(aet:aet-install)
---

1. Check whether the AET CLI is already installed:

   ```bash
   aet -v
   ```

2. If it is **not** installed, install the AET CLI first:

   Load the `aet-install` skill and follow its steps.
   If it is already installed, skip this step.

3. On success, run:

   ```bash
   aet plugin init
   ```

   which prints `AET plugin enabled for <path>`.

Report the bootstrap output back. DO NOT perform any extra actions beyond the
aet-install skill's steps — just return immediately.