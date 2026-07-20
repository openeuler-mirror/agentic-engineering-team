---
name: aet-interacting-with-users
description: This skill is designed to simplify user participation in the document revision process, providing an intuitive interactive experience. The system automatically creates a document snapshot, allowing users to edit directly in the original file. Upon completion, the skill automatically extracts all modifications and comments. Use when: (1) Documents requiring manual review and revision; (2) Users need to make multiple changes to a document; (3) Users need to add clarifications or comments at specific locations in a document, or any other user review tasks.
metadata:
  pattern: tool-wrapper
---

# Interactive Revision

A user-in-the-loop document revision workflow with session isolation and security features.

## Prerequisites

- **Node** required for script execution

## Workflow

### [A1] Prepare Revision

**MUST execute at the start of EVERY revision round**

```bash
# Single file
node scripts/bootstrap.mjs prepare-revision --source ./docs/design.md

# Multiple files
node scripts/bootstrap.mjs prepare-revision \
  --source ./docs/design.md \
  --source ./docs/requirements.md
```

**Options**:

- `--max-size <bytes>`: Max file size limit (default: 10MB = 10485760)
- `--ttl <hours>`: Session TTL (default: 24)

**Output**:

```json
{
  "success": true,
  "sessionHash": "a1b2c3d4",
  "sessionDir": "/tmp/interactive-revision/a1b2c3d4",
  "files": [
    {
      "sourcePath": "./docs/design.md",
      "normalizedPath": "/absolute/path/docs/design.md",
      "snapshotId": "uuid-here",
      "fileName": "design.md",
      "fileSize": 4096,
      "isSymlink": false
    }
  ],
  "newFiles": [...],
  "ttlHours": 24,
  "message": "1 file(s) added. Session expires in 24 hours."
}
```

### [A2] Guide User to Edit

**snapshot required**: NEVER execute A2 unless the snapshot for this round has been confirmed as created (A1); otherwise, the only original file will be corrupted.

Use question tool to wait for user edits:

```
快照已创建，请直接在以下文件中进行编辑:
- ./docs/design.md
- ./docs/requirements.md

批注方式:
1) 直接添加文本（Agent 自动润色）
2) 删除文本（Agent 自动定位引用处并同步修订）
3) 修改原有文档（Agent 自动润色）
4) %% 开头的批注或指令（如 %%增加示例%%）

完成编辑后选择下方选项。
```

**Options**: `["无需修改", "完成修改"]`
**NEVER SKIP**: Regardless of whether the user chooses "无需修改" or "完成修改", [A3] MUST be executed to ensure snapshot destruction.

### [A3] Finalize Revision

```bash
node scripts/bootstrap.mjs finalize-revision \
  --source ./docs/design.md \
  --source ./docs/requirements.md
```

The `--source` files MUST match those used in [A1] Prepare Revision (same set of files).

**Output**:

```json
{
  "success": true,
  "sessionHash": "a1b2c3d4",
  "files": [
    {
      "sourcePath": "./docs/design.md",
      "hasChanges": true,
      "hunks": [...],
      "summary": { "additions": 5, "deletions": 2, "modifications": 3 }
    }
  ],
  "summary": { "totalAdditions": 5, "totalDeletions": 2, "totalModifications": 3 },
  "hasAnyChanges": true,
  "canProceedToNextStep": false,
  "cleanupErrors": [...],  // Only if cleanup failed
  "message": "Session finalized. 1 files processed, 3 modifications total."
}
```

**Post-Finalization State**:

- Session snapshots are **destroyed**
- Next revision round **MUST start from A1** to create new snapshots

### [A4] Process Hunks

Traverse the diffs item by item and confirm the change location:

- **Added block**: integrate the content into the deliverable and keep the style/tone consistent;
- **Deleted block**: delete the corresponding content, and scan the entire document to remove isolated references, dangling cross-references, and logical contradictions;
- **Modified block**: adjust the content according to the modification, and check for consistency in style/tone;
- **Instruction block**: starting with `%%` as instructions. identify the intent
  - Direct modification: adjust the deliverable according to the instruction;
  - Additional work: first execute the task using tools, then update the deliverable.

**Modification Scope**: DO NOT limit edits to the user's explicitly changed parts; proactively identify all related sections throughout the document and execute chain modifications.

**Consistency Standard**: ALWAYS update the entire document cohesively; NEVER introduce new non-conformities, logical contradictions, or stylistic clashes as a result of the changes.

## Error Handling

| Error Type               | Behavior                                   |
| ------------------------ | ------------------------------------------ |
| Source not found         | Error reported, other files continue       |
| File too large           | Error reported, file skipped               |
| Symlink detected         | Resolved to real path, warning logged      |
| Non-text file            | Error reported, file skipped               |
| Cleanup failed           | Logged to `.logs/`, reported in output     |
| Lock conflict            | Fail with message, release on exit         |
| Missing snapshot (A2/A3) | Fail immediately, instruct to run A1 first |
