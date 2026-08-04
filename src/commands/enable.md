---
description: Enable AET for the current coding agent.
disable-model-invocation: true
effort: low
allowed-tools: Bash(aet plugin *)
---

Run the following command to enable AET:

```bash
aet plugin init
```

On success, it prints `AET plugin enabled for <path>`.
DO NOT perform any extra actions (such as checking whether it succeeded) — just return immediately.
