---
description: Enable AET for the current coding agent.
disable-model-invocation: true
effort: low
allowed-tools: Bash(aet:*) Bash(echo:*) Bash(git:*) Bash(grep:*) Skill(aet-install) Skill(aet:aet-install) Skill(aet-setup-config) Skill(aet:aet-setup-config)
---

1. Check whether the AET CLI is already installed:

   ```bash
   aet -v
   ```

2. If it is **not** installed, install the AET CLI first:

   Load the `aet-install` skill and follow its steps.
   If it is already installed, skip this step.

   当前 plugin 版本为 `__AET_PLUGIN_VERSION__`；若 `aet -v` 的版本低于当前 plugin 版本，也需要执行第二步的安装。

3. On success, run:

   ```bash
   aet plugin init
   ```

   which prints `AET plugin enabled for <path>`.

4. **Project setup (optional)** — only if the current directory is a git
   repository with an upstream remote. Check with a single command:

   ```bash
   git remote 2>/dev/null | grep -q . && echo "存在 Remote" || echo "不存在 Remote"
   ```

   - If the command **fails** (not a git repo, or no upstream/origin remote),
     skip this step entirely — do NOT load `aet-setup-config`.
   - If it **succeeds** (git repo with an upstream), ask the user:
     "是否需要进行upstream初始化？"
     - If the user **declines** (or wants to skip), skip `aet-setup-config` and continue.
     - If the user **agrees**, load and follow the `aet-setup-config` skill.

Report the bootstrap output back. DO NOT perform any extra actions beyond the
aet-install skill's steps and the optional project setup above — just return
immediately.