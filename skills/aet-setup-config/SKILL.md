---
name: aet-setup-config
description: Initialize project configuration for AET. Creates .aet/config.json with repository information (upstream/fork). Token is configured in global config (~/.aet/config.json). Use when setting up a new project or when project configuration is missing.
user-invocable: false
---

# Configuration Setup

Initialize project configuration for AET system. Creates project-level configuration (.aet/config.json) with repository information (upstream/fork). Token and platform credentials are configured in global config (~/.aet/config.json) during AET installation.

## Language Detection and Response

### Language Detection
- Automatically detect the language of user input

### Response Language Matching
- Respond in the same language as the user input

## When to Use

Use this skill when:
- Setting up a new project for aet development
- Project configuration (.aet/config.json) is missing or needs to be recreated
- Have already forked the repository and cloned it locally
- Global config (~/.aet/config.json) already exists with Token configured

## Workflow Execution Steps

When executing this skill, follow these steps precisely:

### 1. Check Global Configuration
- Check if global config exists at `~/.aet/config.json`:
  ```bash
  ls -la ~/.aet/config.json
  ```
- If global config does NOT exist:
  - Exit with message: "Global configuration not found. Please run AET installation first to initialize global config (~/.aet/config.json)."
  - Suggest: "Run: bash scripts/install.sh or scripts/init-global-config.sh"

### 2. Check Existing Project Configuration
- Check if `.aet/config.json` exists in current project:
  - **Important**: Use `ls -la .aet/config.json` or `test -f .aet/config.json` command. DO NOT use Glob tool.
- If project configuration exists, ask if user wants to overwrite:
  - Question: "Project configuration file already exists. Overwrite?"
  - Options: "Overwrite existing configuration", "Keep existing configuration and exit"
- If user chooses to keep existing configuration, exit the skill with a message.

### 3. Check Git Repository and Get Fork Information
- Check if current directory is a git repository:
  - If not a git repository, exit with error message: "Current directory is not a git repository. Please clone your fork first."
- Get origin remote URL:
  ```bash
  git remote get-url origin
  ```
  - If origin remote doesn't exist, exit with error message: "No 'origin' remote found. Please ensure you have cloned your fork repository."
- Parse origin URL to extract fork owner and repository name using JavaScript regex patterns:
  - SSH pattern: `git@[^:]+:([^/]+)/([^/.]+)(?:\.git)?`
  - HTTPS pattern: `https?://[^/]+/([^/]+)/([^/.]+)(?:\.git)?`
- If parsing fails, ask user to enter fork owner and repository name manually.
- Auto-detect platform type from origin URL:
  - Extract hostname from URL (e.g., gitcode.com, github.com, gitlab.com)
  - Map to platform type: gitcode.com -> gitcode, github.com -> github, gitlab.com -> gitlab
  - Default to gitlab if hostname not recognized (self-hosted / enterprise GitLab typically uses custom hostnames).

### 4. Upstream Repository Configuration

**Do NOT pre-check the token manually (no `jq` / `cat` probe).** Run the upstream resolver
directly — it reads the token for `<platform>` from global config itself (via Node, and also
resolves `${ENV_VAR}` references), so its result is the single source of truth for whether a
usable token exists. A manual `jq` check is fragile (fails outright on machines without `jq`,
and does not resolve env-var references), which can wrongly report a configured token as
missing.

```bash
node skills/aet-setup-config/scripts/upstream-resolver.js \
  --platform "<platform>" \
  --owner "<fork-owner>" \
  --repo "<fork-repo>"
```

Branch on the script's **exit code + output**:

- **Exit code 0 AND the JSON has no `"error"` field** → token works and upstream resolved.
  - Parse the JSON; display detected upstream info (`is_fork`, `upstream_owner`, `upstream_repo`).
  - If `is_fork` is true, add the upstream remote:
    ```bash
    git remote get-url upstream 2>/dev/null || git remote add upstream <upstream-url>
    ```
  - Keep the `branches` array for Step 5.
- **Non-zero exit code, OR stdout contains `"error": true`, OR stderr says `Token not found`** →
  no usable token / upstream cannot be resolved. Fall back to local development mode:
  - Tell the user exactly what the script reported (quote its error message, e.g.
    `Token not found for platform 'gitlab'`, or `Token 无效（401）`).
  - Ask the user to manually input upstream owner and repo name:
    - Question: "Enter upstream repository owner:"
    - Question: "Enter upstream repository name:"
  - Default to using origin as both upstream and fork.

> A `Token not found` error means the token for `<platform>` is missing/empty at
> `~/.aet/config.json` → `codePlatform.platforms.<platform>.token` (or it is a `${ENV_VAR}`
> reference whose variable is unset in this shell). Diagnose it by re-reading that exact
> config key — **not** with `jq` (which may be absent on the machine).

### 5. Branch Selection
- **If upstream was resolved in Step 4** (resolver exited 0, upstream workflow):
  - From the upstream resolver output, extract the `branches` array.
  - For upstream branch, present branches to user as selection list.
  - Question: "Select the upstream repository's default branch:"
  - Default: Use `upstream_default_branch` from resolver output.

- **For local main branch** (always required):
  - Detect local branches using git:
    ```bash
    git branch -a
    ```
  - Ask for local main branch name:
    - Question: "Enter your local repository's default branch name:"
    - Default: Use detected branch name (e.g., "main", "master")

### 6. Prepare Script Arguments
Construct command-line arguments for the Node.js script:

**Note**: Token is NOT passed - it's read from global config based on platform type.

Arguments for project config:
- `--upstream-owner`: Upstream owner (from upstream resolver or manual input)
- `--upstream-repo`: Upstream repository name (from upstream resolver or manual input)
- `--fork-owner`: Extracted fork owner (from origin URL in step 3)
- `--platform`: Platform type (gitcode/github/gitlab) - determines which Token to use from global config
- `--local-main-branch`: User-selected local main branch name
- `--upstream-branch`: User-selected upstream branch name

### 7. Execute Node.js Script
- Run the script with the constructed arguments:
  ```bash
  node skills/aet-setup-config/scripts/init-config.js \
    --upstream-owner "owner" \
    --upstream-repo "repo" \
    --fork-owner "owner" \
    --platform "gitcode" \
    --local-main-branch "main" \
    --upstream-branch "main"
  ```
- Note: Token is NOT passed - read from global config based on platform type.
- Capture output and check for errors.
- If script fails, display error message and ask user to verify parameters.

### 8. Verify Configuration
- Verify file creation:
  ```bash
  ls -la .aet/config.json
  ```
- If successful, display success message.

### 9. Post-Initialization Guidance
- The script has automatically added `.aet/` to `.gitignore`.
- Remind user: "Token is in global config (~/.aet/config.json platforms[<platform>].token)."
- Remind user: "Project config specifies platform.type, system uses corresponding Token."

### 10. Project Analysis Recommendation
- After configuration is complete, recommend the user to analyze the project context:
  - Question: "Would you like to analyze this project's architecture and generate documentation?"
  - Options: "Yes, analyze project (Recommended)", "Skip for now"
- If user chooses to analyze:
  - Use the Skill tool to invoke `aet-analyzing-project` skill
  - Guide the user through the project analysis process
  - Output will be saved to `<projectDir>/.aet/project-analysis/`
