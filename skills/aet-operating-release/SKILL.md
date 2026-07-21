---
name: aet-operating-release
description: Release管理入口 - 处理所有release相关操作（原子操作和完整发布流程）
---

# Release Management

Release统一入口，通过意图识别处理所有release相关操作。

## Language Detection and Response

- Automatically detect the language of user input
- Respond in the same language as the user input

## Intent Detection

Analyze user input to determine operation type:

| Intent | Keywords | Processing |
|--------|----------|------------|
| **Create Release** | "创建release v1.x", "create release", "发布 v1.x" | Direct create |
| **Delete Release** | "删除release v1.x", "delete release", "删除 v1.x" | Direct delete |
| **List Releases** | "列出release", "list releases", "查看发布" | Direct list |
| **Get Release** | "查询release", "get release", "release详情" | Direct query |
| **Latest Release** | "最新release", "latest release" | Get latest |
| **Update Release** | "更新release", "update release" | Direct update |
| **Upload Asset** | "上传附件", "upload", "upload url" | Get upload URL |
| **Download Asset** | "下载附件", "download", "download asset" | Download file |
| **Full Release Workflow** | "发布新版本", "我要发布" (no specific version) | Guided 4-step workflow |

## Important: Use release-api.js

**DO NOT use curl** for API operations. Always use release-api.js:

```bash
node skills/aet-operating-release/scripts/platform/bin/release-api.js <command> [options]
```

### Available Commands

| Command | Description |
|---------|-------------|
| `create-release` | Create a new Release |
| `list-releases` | List all Releases |
| `get-release` | Get Release details |
| `latest-release` | Get the latest Release |
| `update-release` | Update an existing Release |
| `delete-release` | Delete a Release |
| `upload-url` | Get upload URL for assets |
| `download-asset` | Download a Release asset |

---

## Atomic Operations (Direct Execution)

### Case 1: Create Release (with version specified)

User says: "创建release v1.2.0" or "create release v1.2.0"

**Step 1**: Parse version from input (e.g., v1.2.0)

**Step 2**: Create Git Tag (if not exists)
```bash
git tag -a v1.2.0 -m "Release v1.2.0"
git push origin v1.2.0
```

**Step 3**: Create Platform Release
```bash
node skills/aet-operating-release/scripts/platform/bin/release-api.js create-release \
  --tag v1.2.0 \
  --name "Release v1.2.0" \
  --body "Release notes (can be empty or user-provided)"
```

**Step 4**: Confirm success and display release link

### Case 2: Delete Release

User says: "删除release v1.1.0" or "delete release v1.1.0"

**Important**: AtomGit Release is bound to Tag. Deleting Tag will also delete Release.

**Step 1**: Delete remote Tag (also deletes Release)
```bash
node skills/aet-operating-release/scripts/platform/bin/release-api.js delete-release --tag v1.1.0
# Or positional argument
node skills/aet-operating-release/scripts/platform/bin/release-api.js delete-release v1.1.0
```

**Step 2**: Delete local Tag (optional)
```bash
git tag -d v1.1.0
```

**Note**: AtomGit does not have a separate delete-release API. Deleting the Tag automatically removes the associated Release.

### Case 3: List Releases

User says: "列出所有release" or "list releases"

```bash
node skills/aet-operating-release/scripts/platform/bin/release-api.js list-releases
```

Display results with tag, name, URL.

### Case 4: Get Release

User says: "查询release v1.0.0" or "get release 123"

```bash
node skills/aet-operating-release/scripts/platform/bin/release-api.js get-release --tag v1.0.0
```

### Case 5: Latest Release

User says: "最新release" or "latest release"

```bash
node skills/aet-operating-release/scripts/platform/bin/release-api.js latest-release
```

### Case 6: Update Release

User says: "更新release 123 标题改成xxx"

```bash
node skills/aet-operating-release/scripts/platform/bin/release-api.js update-release --id 123 --name "New Name"
```

### Case 7: Upload Asset

User says: "获取上传地址 v1.0.0"

```bash
node skills/aet-operating-release/scripts/platform/bin/release-api.js upload-url v1.0.0
```

Return upload URL for user to upload files.

### Case 8: Download Asset

User says: "下载附件 asset.zip 从 release 123"

```bash
node skills/aet-operating-release/scripts/platform/bin/release-api.js download-asset 123 asset.zip
```

---

## Full Release Workflow (Guided Process)

User says: "发布新版本" or "我要发布" (no specific version)

### Workflow Steps

```
Change Detection → Version Generation → Release Notes → Create Release
```

### Step 1: Change Detection

**Purpose**: Analyze commits since last release.

**1.1 Get last tag**
```bash
git describe --tags --abbrev=0
```
If no tags exist, assume initial release (v1.0.0).

**1.2 Get commit history**
```bash
git log <last-tag>..HEAD --pretty=format:"%s"
```

**1.3 Parse Conventional Commits**

| Commit Type | Count | Impact |
|-------------|-------|--------|
| `feat!` / `BREAKING CHANGE` | N | Major bump |
| `feat` | N | Minor bump |
| `fix` / `docs` / `refactor` | N | Patch bump |

**1.4 Output analysis**
- Total commits: X
- Features: [list]
- Fixes: [list]
- Breaking changes: [list]
- Recommended version bump: [major/minor/patch]

### Step 2: Version Generation

**Purpose**: Calculate new version number.

**2.1 Read current version**
```bash
# Node.js project
grep '"version"' package.json | head -1

# Other projects
cat VERSION
```

**2.2 Apply semver bump**

| Bump Type | Current | New |
|-----------|---------|-----|
| major | 1.2.3 | 2.0.0 |
| minor | 1.2.3 | 1.3.0 |
| patch | 1.2.3 | 1.2.4 |

**2.3 Ask user confirmation**
"检测到 {N} 个变更，建议版本号为 v{new-version}。是否确认？"
- 确认 → proceed
- 指定其他版本 → use user's version

### Step 3: Release Notes

**Purpose**: Generate release documentation.

**3.1 Use template**
Select from `templates/` directory. Only two templates are supported:
- `standard.md` - Standard format (default)
- `minimal.md` - Minimal format

Template selection rules:
- If the user explicitly specifies a template, follow the user's choice:
  - use `standard.md` for standard / 标准版
  - use `minimal.md` for concise, short, simple, minimal, or 简洁版 release notes
- If the user does not specify a template, select the template based on the scale of changes between the two versions:
  - use `minimal.md` when the version differences are small, such as a few minor fixes, small patches, or limited updates
  - use `standard.md` when the version differences are large, such as multiple features, multiple fixes, or refactors across modules
- If the change scale cannot be clearly determined, use `standard.md` by default.

**3.2 Fill selected template**
Use the selected template file as the single source of truth.
- Follow the exact structure, sections, and placeholders defined in the template.
- Fill only the placeholders present in the selected template.
- Do not add extra sections unless the user explicitly requests them.
- If a section has no data, omit empty items and do not fabricate content.
- If a required placeholder cannot be filled, ask the user for clarification or mark it for review.

**3.3 Ask user confirmation**
Show generated notes, ask for approval or modification.

### Step 4: Create Release

**Purpose**: Publish to platform.

**4.1 Create Git Tag**
```bash
git tag -a v{version} -m "Release v{version}"
git push origin v{version}
```

**4.2 Create Platform Release**
```bash
node skills/aet-operating-release/scripts/platform/bin/release-api.js create-release \
  --tag v{version} \
  --name "Release v{version}" \
  --body "$(cat release-notes.md)"
```

**4.3 Output files** (optional)
- `.aet/releases/{version}/release-notes.md`
- `.aet/releases/{version}/change-analysis.json`

**4.4 Completion**
- Confirm release success
- Display release link

---

## Release Templates

Templates in `templates/` directory for generating release notes:

| Template | Format |
|----------|--------|
| `standard.md` | Summary + categorized changes |
| `minimal.md` | Essential info only |

---

## Dependencies

- Git environment
- AtomGit Token (in .aet/config.json)
- Release creation permission