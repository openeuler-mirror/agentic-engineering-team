# AET 插件扩展（src/extensions/）

此目录是 **build 时扩展点**，默认不含任何内容。用户有自定义需求时，把扩展
放到 `src/extensions/<名称>/` 下（`<名称>` 任意），再运行 `npm run build`，
扩展会自动合并进所有 coding-agent 插件（claude-code / codeagent3 / codex /
opencode / omp）的 dist。

## 目录约定

```
src/extensions/<名称>/
├── skills/        # 额外 skill（拷进所有 host 的 skills/）
├── commands/      # 额外 slash 命令（拷进所有 host 的 commands/，codex 除外）
└── runtime/       # 额外 runtime 文件（拷进 aet-install skill 的 runtime/）
```

## 合并规则

- **skills / commands**：与全局（顶层 `skills/`、`src/commands/`）同名冲突时，
  **扩展优先覆盖**。
- **runtime**：与基础 runtime（`src/config/workflow.json`）合并进 `aet-install`
  skill 的 `runtime/`。默认无 `runtime-meta.json`（workflow.json 不保护、每次覆盖）；
  扩展可自带 `runtime-meta.json` 声明 `whitelist`，`whitelist` 取**并集**（所有
  扩展），白名单内已有则保留、缺失才补、名单外覆盖。
- 本目录不存在时 build 照常运行（无扩展）。

## 示例

```bash
# 自定义一个「my-team」扩展
mkdir -p src/extensions/my-team/skills/my-skill
echo '...' > src/extensions/my-team/skills/my-skill/SKILL.md
npm run build
```
