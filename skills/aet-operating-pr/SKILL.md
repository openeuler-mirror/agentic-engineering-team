---
name: aet-operating-pr
description: PR management for creating, updating and tracking platform pull requests.
---

# PR Management

Manage platform pull requests for feature delivery, including create, update, and query operations.

## Language Detection and Response

- Automatically detect the language of user input
- Respond in the same language as the user input

## When to Use

Use this skill when:

- Creating a pull request for completed work
- Updating an existing pull request
- Querying PR details
- Listing pull requests

## Important: API Operations Must Use pr-api.js

### Prohibition

**DO NOT use curl** for any platform API operations. Direct curl commands are not reliable.

### Correct Approach

**Always use the provided pr-api.js script** for all API operations.

```bash
# Use the script from this skill directory
node skills/aet-operating-pr/scripts/platform/bin/pr-api.js <command> [options]
```

### Available PR Commands

| Command     | Description            |
| ----------- | ---------------------- |
| `create-pr` | Create a Pull Request  |
| `update-pr` | Update a Pull Request  |
| `list-prs`  | List all Pull Requests |

### Command Examples

```bash
# Create a pull request
pr-api create-pr --title "Feature PR" --description "PR description" --source-branch "feature-branch" --target-branch "main"

# Update a pull request
pr-api update-pr --id 123 --title "Updated Title"

# List pull requests
pr-api list-prs --state open
```

### Getting Help

```bash
pr-api --help
pr-api create-pr --help
pr-api update-pr --help
pr-api list-prs --help
```

## PR Templates

Use appropriate template from [references/](references/) directory for PR description structure:

- `feature-pr-template.md` - For new feature PRs
- `bugfix-pr-template.md` - For bug fix PRs
- `refactor-pr-template.md` - For refactoring PRs
- `documentation-pr-template.md` - For documentation PRs
- `generic-pr-template.md` - For generic PRs

## Workflows

### 1. Check Project Configuration

**Step 1: Check Project Configuration**

- Check if `.aet/config.json` file exists
- If missing, respond: "Project configuration not found. Please initialize project configuration first."

### 2. Determine Task Scenario

**Step 1: Intent Detection**

- **PR Create**: Keywords like "create PR", "创建PR", "提交PR"
- **PR Update**: Keywords like "update PR", "修改PR", "更新PR"
- **PR Query**: Keywords like "get PR", "查询PR", "PR详情"
- **PR List**: Keywords like "list PR", "PR列表"

### Case 1: Create PR

**Purpose**: Create a Pull Request for completed work.

**Step 1: Check Current Branch and Changes**

- Identify current git branch: `git branch --show-current`
- Check for uncommitted changes: `git status`
- Ensure all changes are committed and pushed

**Step 2: Determine PR Context**

- If feature directory exists (`./ai_assistance/features/feature-*/`), use feature context
- If no feature directory, use branch name or user input for PR title

**Step 3: Run Verification (Optional)**

- Invoke `aet-checking-implementation` skill for quality verification
- Wait for verification to complete

**Step 4: Generate PR Description**

- Use appropriate template from references directory
- Fill with feature/change details
- Optional: Include Issue information from Issue API response

**Step 5: Create Pull Request**

```bash
node skills/aet-operating-pr/scripts/platform/bin/pr-api.js create-pr \
  --title "Feature: Description" \
  --description "PR description content" \
  --source-branch "feature-branch" \
  --target-branch "main"
```

**Step 6: Completion**

- Confirm PR creation success
- Display PR link

**Step 8: Offer PR review (always ask)**

After PR creation success (Step 7), **always ask the user** whether to continue with a code review:

> "PR 已创建(#{N})。要继续跑一次 PR review 吗?(yes 继续 / no 跳过)"

- **User confirms** → invoke `aet-reviewing-pr` skill on this PR id
- **User declines** → end the flow

Don't auto-run silently (the review posts a public comment; user should opt in). Don't skip the prompt either — even on trivial PRs, ask. This is _complementary_ to AtomGit's native `/ai review` Bot — both can coexist on the same PR.

### Case 2: Update PR

**Purpose**: Update an existing pull request.

**Step 1: Get Existing PR**

- Parse PR ID from input
- Use pr-api to fetch current content:
  ```bash
  node skills/aet-operating-pr/scripts/platform/bin/pr-api.js list-prs --state open
  ```

**Step 2: Analyze Changes**

- Compare current content with requested changes

**Step 3: Execute Update**

```bash
node skills/aet-operating-pr/scripts/platform/bin/pr-api.js update-pr --id 123 --title "Updated Title"
```

### Case 3: List PRs

**Purpose**: List all pull requests.

**Step 1: Execute List Command**

```bash
node skills/aet-operating-pr/scripts/platform/bin/pr-api.js list-prs --state open
```

**Step 2: Display Results**

- Show PR list with ID, title, state, and URL
