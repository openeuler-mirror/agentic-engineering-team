# AET 安装指南

AET（Agentic Engineering Team）采用 **stateful Core + agent-agnostic CLI** 架构：一个自包含、零运行时依赖的 CLI（`dist/bin/aet.js`，命令名 `aet`）负责 workflow 状态机，再由各 coding-agent 的插件把 CLI 接入宿主（目前支持 Claude Code；OpenCode 插件文档稍后补充）。

安装分两段：

1. **安装 AET CLI**（必选）—— 通过 npm 把 `aet` 命令装到 PATH。**这是唯一方式**，不再有手动 `ln`/`cp` 落 PATH 的脚本。
2. **安装 coding-agent 插件**（可选）—— 让 Claude Code 启动时自动加载 AET，并注册斜杠命令与钩子。

> 本文针对新版 `src/` TypeScript 架构。旧的 `docs/zh/installation*.md` 描述的是 v1 单文件插件 / v0.1 流程，已过时，请以本文为准。

---

## 前置条件

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | `>= 18` | CLI 为 ESM 可执行脚本，零运行时 npm 依赖 |
| npm | 随 Node | 既是安装渠道，也是构建期工具（esbuild + tsc） |
| `claude` CLI | 任意近版本 | **仅当安装 Claude Code 插件时需要** |

CLI 产物 `dist/bin/aet.js` 是单一可执行文件（ESM，带 `#!/usr/bin/env node` shebang，权限 0755），所有运行时依赖均为 Node 内建模块。`package.json` 的 `bin` 字段声明了命令名 `aet`，所以 `npm install -g` 后 `aet` 自动出现在 npm 全局 bin 目录（已在 PATH 上）。

> **nvm 提示**：`npm install -g` 把 bin 装进当前 node 版本的全局目录，切到别的 node 版本会「丢」。多版本切换的用户需在每个常用版本下各装一次，或用 `nvm alias default` 固定。

---

## 第一部分：安装 AET CLI

### 方式 A：从 npm registry 安装（推荐，发布后）

```bash
npm install -g aet-cli
```

> 包名是 `aet-cli`（`aet` 在 npm 已被占位），安装后命令名仍是 `aet`。`npm uninstall -g aet-cli` 即可干净卸载。

### 方式 B：从源码安装（开发 / 未发布时）

```bash
git clone <repo-url> aet-cli
cd aet-cli
npm install          # 装构建依赖 + 自动跑 prepare（= npm run build）
```

`package.json` 有 `"prepare": "node scripts/build.mjs"`，npm 在本地 `npm install` 末尾自动执行它（见 npm 生命周期：`prepare` 在 bare `npm install` 时运行），所以一条 `npm install` 同时把依赖和 `dist/` 都准备好。

随后二选一：

**开发热更（软链到源码，rebuild 即生效）**：

```bash
npm link             # 全局软链 → ~/.npm-global/.../node_modules/aet-cli → 当前目录
                     # bin: aet → <repo>/dist/bin/aet.js
```

`npm run build` 后 `aet` 立即指向新产物，无需重装。卸载：`npm unlink -g aet-cli`。

**固定安装（复制，不随 rebuild 变化）**：

```bash
npm install -g .     # 把当前目录打包后复制进全局 node_modules，bin 软链过去
```

> 注：`npm install -g <本地目录>` 不会自动跑 `prepare`（npm 源码 `install.js` 里 root 生命周期对全局装是关闭的），所以务必先在上一步用 `npm install` 把 `dist/` 构建出来，再 `npm install -g .`。

验证：

```bash
aet --version          # 期望: aet 0.5.2 ...
aet workflow status    # 期望: No active workflow（CommandResult JSON 或 prompt 文本）
```

如果 `aet` 找不到，查 npm 全局 bin 目录是否在 PATH：

```bash
npm config get prefix          # bin 在 <prefix>/bin（Unix）或 <prefix>（Windows）
# 应把 <prefix>/bin 加入 PATH
```

### 初始化全局配置（可选）

全局配置 `~/.aet/config.json` 存放跨项目共享的敏感信息（代码托管平台 token、trace 开关等）。**该文件永不被覆盖**，只能手动编辑。

```bash
mkdir -p ~/.aet
cp src/config/global-config.json ~/.aet/config.json
# 然后手动填写 gitcode / github / gitlab 的 token（支持 ${ENV_VAR} 引用）
```

---

## 第二部分：安装 Claude Code 插件（可选）

> OpenCode 插件安装文档稍后补充。

AET 的 Claude Code 插件是一个**自包含的 CC 原生插件目录**（`dist/plugins/claude-code/`）。安装后，**`claude` 正常启动即自动加载**，无需 `--plugin-dir` 标志。

### 前置条件

- `aet` 已在 PATH 上（第一部分）。CC 插件的钩子通过 `process.env.AET_BIN ?? 'aet'` 定位 CLI（`src/plugins/claude_code/hooks/handlers/aet_handler.ts`），默认走 PATH。
- 已安装 `claude` CLI。

### 通过 CC 原生 marketplace 安装（推荐）

仓库 build 产物里 `dist/plugins/claude-code/.claude-plugin/marketplace.json` 声明了插件 `aet`，source 指向 `dist/plugins/claude-code` 自身。两条命令完成安装：

```bash
# 1. 把 CC 插件目录注册为本地 marketplace（claude 读取其中的 .claude-plugin/marketplace.json）
claude plugin marketplace add "$(pwd)/dist/plugins/claude-code"

# 2. 以 user scope 安装插件 → ~/.claude/plugins/aet/
claude plugin install aet@aet
```

`user scope`（默认）会把插件复制到 `~/.claude/plugins/aet/`，**每次 `claude` 启动自动加载**，在任意项目可用。`project` / `local` scope 可按需用 `--scope` 指定（团队共享 / git 忽略）。

### 验证

```bash
claude                # 正常启动（不带任何 flag）
# 在会话内：
/plugin               # 应能看到 aet 插件已启用
/design               # 插件 init 生成斜杠命令文件；输入 / 触发命令补全
```

CC 插件的 `SessionStart` 钩子会在每次进入项目时自动运行 `aet plugin init --agent claude-code`，把每个 workflow / command 对应的斜杠命令文件（`/design`、`/implement`、`/bugfix` 等）生成到该项目的 `.claude/commands/` 下，无需手动维护命令文件。

斜杠命令对应各 baseline workflow / command（见根目录 `AGENTS.md` 契约）：

| 斜杠命令 | workflow | 步骤 |
| --- | --- | --- |
| `/design` | `design` | requirements_analysis → requirements_design → development_plan |
| `/implement` | `implement` | implement → verify |
| `/bugfix` | `bugfix` | diagnose → fix |

---

## 开发与调试

### CLI 热更新（npm link 模式）

第一部分方式 B 用 `npm link` 后，源码 `npm run build` 产出新的 `dist/bin/aet.js`，全局 `aet`（软链到源码）立即生效，无需重装。

### CC 插件迭代

`claude plugin install` 是**复制**到 `~/.claude/plugins/aet/`，所以 rebuild 后需重新安装一次以刷新副本：

```bash
npm run build
claude plugin install aet@aet          # 重新复制
# 已开的 claude 会话内执行 /reload-plugins 即时刷新，无需重启
```

### 进阶：AET_BIN 覆盖（免 PATH 调试）

开发期若不想把 `aet` 装到 PATH，可让 CC 插件直接指向仓库内的构建产物：

```bash
export AET_BIN="$PWD/dist/bin/aet.js"
claude
```

钩子 `resolveAetBin()` 优先读 `AET_BIN`，缺省才回退到 PATH 上的 `aet`。

### CC 一次性开发工具：`--plugin-dir`

> 仅用于临时调试单次会话，**不是正常安装方式**。

```bash
claude --plugin-dir "$(pwd)/dist/plugins/claude-code"
```

CC 会话内 `/reload-plugins` 可不重启刷新。本地同名插件会覆盖已安装的 marketplace 版本。正常使用请走第二部分的 marketplace 安装。

### 端到端 sanity 检查

```bash
AET_PROJECT_ROOT=/tmp/sandbox node dist/bin/aet.js workflow init --name design --output json
# 期望: {"ok":true,"data":{"status":"workflow_started",...}, ...}
```

---

## 卸载

```bash
# CLI
npm uninstall -g aet-cli

# Claude Code 插件
claude plugin uninstall aet@aet
rm -rf ~/.claude/plugins/aet      # 兜底手动删除

# 可选：全局配置（含 token，谨慎）
rm -f ~/.aet/config.json
```

---

## 排错

| 现象 | 原因 / 处理 |
| --- | --- |
| `aet: command not found` | npm 全局 bin 不在 PATH。`npm config get prefix` 确认，把 `<prefix>/bin` 加入 shell 配置后新开终端。 |
| 切了 nvm node 版本后 `aet` 没了 | `npm install -g` 的 bin 绑定到具体 node 版本。在新版本下重装，或固定 `nvm alias default`。 |
| `aet` 找到了但行为旧 | shell 哈希缓存。执行 `hash -r`（bash）或新开终端。 |
| `npm install -g aet-cli` 报 404 | 包尚未发布到 npm。改用第一部分方式 B（从源码 `npm install` + `npm link` / `npm install -g .`）。 |
| `claude: command not found` | 未装 `claude` CLI。第二部分依赖它。 |
| 插件没加载 / 斜杠命令缺失 | 启动 `claude` 后在会话内执行 `/reload-plugins`，或重启 `claude`。首次进入项目时 `SessionStart` 钩子才生成命令文件。 |
| 钩子报 `failed to spawn 'aet'` | `aet` 不在 `claude` 进程的 PATH（macOS GUI 启动 vs 终端 PATH 差异）。设 `export AET_BIN=/abs/path/dist/bin/aet.js` 后重启 `claude`。 |
| `marketplace add` 报找不到 manifest | 必须在 `dist/plugins/claude-code/` 目录（`.claude-plugin/marketplace.json` 所在目录）执行。 |

---

## 相关文件

| 文件 | 作用 |
| --- | --- |
| `package.json` | npm 包声明（name=`aet-cli`，bin=`aet`，含 `prepare` 自动构建） |
| `scripts/build.mjs` | esbuild 构建逻辑（`prepare` / `build` 脚本调用它） |
| `dist/bin/aet.js` | CLI 二进制（bin 指向） |
| `dist/plugins/claude-code/` | CC 原生插件目录 |
| `dist/plugins/claude-code/.claude-plugin/marketplace.json` | CC marketplace 声明（每个插件 build 时自主生成，位于各自 dist 插件树内） |
| `~/.aet/config.json` | 全局配置（token、trace） |
| `~/.claude/plugins/aet/` | user-scope CC 插件安装位置 |
| `AGENTS.md`（仓库根） | Core / Plugin 契约（CLI 表面、CommandResult 信封、双形态钩子） |

> 旧文档 `docs/zh/installation.md`、`installation-cc-plugin.md`、`installation-workflow-core.md` 描述的是 v1 单文件插件 / v0.1 工作流内核状态，与新版 `src/` 架构不符，将逐步弃用。
