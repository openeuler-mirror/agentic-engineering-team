---
name: aet-install
description: |
  当用户调用 `/aet:init`（或 `/aet-init`）命令且 `aet` CLI 未安装时触发，
  负责安装/升级 AET 全局 CLI 与运行时（~/.aet/）。本 skill 自包含安装所需
  全部资源（脚本 + runtime + cli 安装包），agent 严格按本 skill 说明执行即可，
  无需额外定位插件路径。
user-invocable: false
allowed-tools: Execute(scripts/*) Bash(node:scripts/install.cjs)
---

# AET 安装/升级

本 skill 自带安装所需的全部资源，位于当前 skill 目录下：

```
<本 skill 目录>/
├── scripts/
│   └── install.cjs        # 安装脚本（node 检查 → npm 装 cli → 同步 runtime）
├── runtime/               # AET 运行时文件（config/workflow.json 等，含合并后的 runtime-meta.json）
└── cli/                   # 可 npm 安装的 aet CLI 包（package.json + aet.js）
```

## 执行步骤

1. **确认 Node.js ≥ 18 可用**：运行 `node --version`。若 Node 缺失或 < 18，
   停止并告知用户「请先安装 Node.js >= 18，然后重新运行 /aet:init」。

2. **运行安装脚本**：执行以下命令（使用本 skill 内脚本的完整路径）：
   ```bash
   node "<本 skill 目录>/scripts/install.cjs"
   ```
   该脚本会：
   - 检查 npm 是否可用（缺失则报错停止）
   - 检查全局 `aet` CLI：缺失或版本过旧 → 通过 `npm i -g <本 skill 目录>/cli` 安装/升级
   - 每次运行都会把 `<本 skill 目录>/runtime/` 同步到 `~/.aet/`
     （runtime-meta.json 中的 whitelist 决定覆盖策略：白名单内已存在 → 保留，
     缺失 → 补充；名单外 → 覆盖）

3. **报告脚本输出**：脚本成功打印 `AET runtime synced ...`。若脚本报错
   （Node/npm 缺失、安装失败），把错误原样反馈给用户并停止。

4. **初始化插件**：脚本成功后，运行：
   ```bash
   aet plugin init
   ```
   成功后打印 `AET plugin enabled for <path>`。

5. **配置平台 Token（全局配置 `~/.aet/config.json`）**：

   - 若 `~/.aet/config.json` 不存在，先以模板为基础拷贝：
     ```bash
     cp ~/.aet/config/repository.json ~/.aet/config.json
     chmod 600 ~/.aet/config.json
     ```
   - 查看当前 token：
     ```bash
     cat ~/.aet/config.json
     ```
   - 对用户使用的每个平台（gitcode / github / gitlab），若 `token` 字段为空，
     询问用户提供该平台 token。token 可以是字面值或 `${ENV_VAR}` 引用
     （如 `${ATOMGIT_TOKEN}`）。
   - 用 Edit/Write 写入 `~/.aet/config.json` 的 `codePlatform.platforms.<platform>.token`，
     不要改动 `apiBaseUrl`。

   若用户此刻拒绝配置 token，记录下来继续即可 —— 之后可随时手动编辑
   `~/.aet/config.json`。

6. **完成**：打印 `AET enabled.` 并结束，不要做额外动作。

> 注意：脚本路径中的 `<本 skill 目录>` 即本 skill 所在目录，运行时以脚本实际
> 所在位置为准（`scripts/install.cjs` 通过相对路径自动定位 `../runtime` 与
> `../cli`），agent 无需猜测绝对路径。
