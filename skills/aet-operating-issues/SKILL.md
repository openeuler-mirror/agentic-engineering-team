---
name: aet-operating-issues
description: Issue management for creating, updating, claiming and tracking platform issues.
---

# Issue Management

Manage platform issues for feature requirements tracking, including create, update, claim, and query operations.

## Language Detection and Response

- Automatically detect the language of user input
- Respond in the same language as the user input

## When to Use

Use this skill when:

- Creating a new issue for feature tracking
- Updating an existing issue
- Claiming an issue to start working on it
- Querying issue details

## Important: API Operations Must Use issue-api.js

### Prohibition

**DO NOT use curl** for any platform API operations. Direct curl commands are not reliable.

### Correct Approach

**Always use the provided issue-api.js script** for all API operations.

```bash
# Use the script from this skill directory
node skills/aet-operating-issues/scripts/platform/bin/issue-api.js <command> [options]
```

### Available Issue Commands

| Command        | Description                               |
| -------------- | ----------------------------------------- |
| `create-issue` | Create a new Issue                        |
| `get-issue`    | Get Issue details                         |
| `claim-issue`  | Claim an Issue by assigning to fork.owner |
| `update-issue` | Update an existing Issue                  |
| `list-issues`  | List all Issues                           |

### Command Examples

```bash
# Create a new issue
issue-api create-issue --title "New Issue" --description "Issue description"

# Get issue details
issue-api get-issue --id 123

# Claim an issue
issue-api claim-issue --id 123

# Update an issue
issue-api update-issue --id 123 --title "Updated Title"

# List all issues
issue-api list-issues --state open
```

### Getting Help

```bash
issue-api --help
issue-api create-issue --help
issue-api get-issue --help
issue-api claim-issue --help
issue-api update-issue --help
issue-api list-issues --help
```

## Workflows

### 1. Check Project Configuration

**Step 1: Check Project Configuration**

- Check if `.aet/config.json` file exists
- If missing, respond: "Project configuration not found. Please initialize project configuration first."

### 2. Determine Task Scenario

**Step 1: Intent Detection**

- **Issue Create**: Keywords like "create issue", "新建issue", "创建需求"
- **Issue Update**: Keywords like "update issue", "修改issue", "修改需求"
- **Issue Claim**: Keywords like "claim", "认领", "开发"
- **Issue Query**: Keywords like "get issue", "查询issue", "issue详情"

### Case 1: Create Issue

**Purpose**: Create a new platform issue for feature requirements tracking.

**Step 1: Requirement Analysis & Clarification**

- Analyze user request and project context
- Ask clarifying questions for ambiguous areas

**Step 2: Generate Requirement Document**

- Create structured document using [issue-template.md](references/issue-template.md)
- Template sections: Background & Value, Requirements Details, Solution Approach, Acceptance Criteria

**Step 3: User Review & Confirmation**

- Show generated document to user
- Ask for confirmation or modifications

**Step 4: Execute Platform Operation**

- Use issue-api to create issue:
  ```bash
  node skills/aet-operating-issues/scripts/platform/bin/issue-api.js create-issue --title "[feature] Feature Name" --description "Description content"
  ```
- Extract returned Issue ID and URL

**Step 5: Completion**

- Confirm operation success
- Display issue link

### Case 2: Update Issue

**Purpose**: Update an existing platform issue.

**Step 1: Get Existing Issue**

- Parse issue ID from input
- Use issue-api to fetch current content:
  ```bash
  node skills/aet-operating-issues/scripts/platform/bin/issue-api.js get-issue --id 123
  ```

**Step 2: Analyze Changes**

- Compare current content with requested changes

**Step 3: Execute Update**

- Use issue-api to update:
  ```bash
  node skills/aet-operating-issues/scripts/platform/bin/issue-api.js update-issue --id 123 --title "Updated Title" --description "Updated description"
  ```

### Case 3: Claim Issue

**Purpose**: Claim an issue to start working on it.

**Step 1: Identify Issue**

- Extract issue ID from URL or name
- Use issue-api to query issue details:
  ```bash
  node skills/aet-operating-issues/scripts/platform/bin/issue-api.js get-issue --id 123
  ```

**Step 2: Execute Claim**

- Use issue-api to claim:
  ```bash
  node skills/aet-operating-issues/scripts/platform/bin/issue-api.js claim-issue --id 123
  ```

**Step 3: Create Feature Branch**

- Create branch: `git checkout -b feature/{normalized-name}`
- Create feature directory structure in `./ai_assistance/features/`

**Step 4: Completion**

- Confirm Issue claim success
- Display Issue link and branch name
