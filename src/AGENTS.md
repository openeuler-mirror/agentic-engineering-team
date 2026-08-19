# AET Core / Plugin 契约

本文件锁定 Core (Layer 4) 与 Plugin (Layer 2) 之间的契约。任何修改 `src/core/` / `src/definitions/events.ts` / `src/plugins/` 的 agent 必须先读本文件。

## Core 契约（Stateful Core）

- **Stateful**: Core 在 `<projectRoot>/.aet/core-checkpoint/` 自管 active workflow + currentStep 状态。CLI 调用方不再传 `--workflow` / `--current-step` / `--context`。
- **One active workflow per project root**: `CheckpointManager.findLatestActiveAny()` 返回最新 updatedAt 的 active 条目。
- **Workflow = step sequence**（无 scenario/stage 层）。Baseline workflows（`src/core/config_manager.ts:30-60` BASELINE_CONFIG，可在 `src/config/workflow.json`/`~/.aet/config/workflow.json` 覆盖）:
  - `design` → `requirements_analysis` / `requirements_design`
  - `implement` → `development_plan` / `implement` / `verify`
  - `bugfix` → `diagnose` / `fix`

## CLI 表面

六条 public 命令 + 一条 internal 命令（`src/cli/index.ts`）：

- `aet workflow init --name <id> [--output json|prompt]` — 创建 checkpoint，**不**进入任何 step；返回 `workflow_started` prompt 提示需执行一次 handover 进 step 1。遇已有 active workflow 返回 `intervention_required` prompt（让 agent 向用户确认：`aet workflow continue` 恢复 / `aet workflow abort` + `init` + `handover` 新建）。
- `aet workflow handover [--step <id>] [--output json|prompt]` — 进入下一 step（或 `--step` 跳转）。`currentStepId === null` 时第一次 handover 进入 step 1；当前在末步时再 handover 完成 workflow。
- `aet workflow continue [--output json|prompt]` — 状态恢复：重发**当前** step 任务 prompt（不推进）。Core 读 checkpoint 的 `currentStepId`；若为 `null`（init 后未 handover）报 `NO_ACTIVE_STEP`。重新触发当前 step 的 before hooks + 记录 `step_resumed` 审计。
- `aet workflow status [--output json|prompt]` — 只读查询当前 project root 下的 active workflow（无 active 时返回 `data.status='no_active'`）。无副作用，不写 checkpoint。
- `aet workflow abort [--reason <text>] [--output json|prompt]` — 终止 active workflow（用户主动放弃，**非**自然完成）。归档 checkpoint 标 `status='aborted'`，与 `completed` 区分；可选 `--reason` 记入 history 供审计。
- `aet context [plugin-name...] [--root <path>]` — **元数据查询，不走 Core**（不经 EventBus / WorkflowEngine / checkpoint）。dispatcher-style spec：`resource=context`，第二个 positional 是动态 plugin name（非固定 action 词）。stdout 永远是 XML（不识别 `--output`，**不**返回 CommandResult 信封）；stderr 走警告 / unknown plugin / plugin 列表。Plugin 机制：`src/cli/commands/context/<name>.ts` 导出 `plugin: Plugin`，barrel `index.ts` 静态注册。

默认 `--output prompt`；插件场景永远用 `--output json`。**例外**：`aet context` 不识别 `--output`（不走 dual-channel，输出永远 XML）。

## Plugin-only 命令（internal）

这些命令 callable 但 hidden from `aet --help`（git plumbing-vs-porcelain 模型：CommandSpec 加 `visibility?: 'public' | 'internal'` 字段，`formatCommandsSection()` 过滤掉 internal）。仅供 plugin 开发者使用；agent 应走 public 命令路径。

- `aet workflow command-init --name <id> [--output json|prompt]` — 一步完成 init + 进入 step 1。dispatch 为 `workflow.commandInit` InputEvent；Core 内部走 `initWorkflow` + `handoverWorkflow`（`src/core/workflow_engine.ts:148` `handleCommandInit`）。返回分支：init `ok=false` → init error result；`data.status==='intervention_required'` → intervention prompt（引导 agent 询问用户：continue 恢复 / abort+init+handover 新建）+ **不**走 handover；init success → `data.status='step_advanced'` + step-1 task text in `prompt`。spec id 用 kebab-case `workflow.command-init`（CLI routing），dispatch event 用 camelCase `workflow.commandInit`（Core routing，per `src/definitions/events.ts`）。CC plugin handler（`src/plugins/claude_code/hooks/handlers/aet_handler.ts:292-353`）当前两步 `init + handover` 可简化为一步调此命令。

## 输出信封（Dual-Channel Design — `src/definitions/events.ts`）

```
CommandResult {
  ok: boolean,
  prompt: string,              // ← agent 看到的文本（plugin 透传 / suppress）
  events: OutputEvent[],       // ← PLUGIN-ONLY，agent 永不可见
  data?: CommandData,          // ← 生命周期元数据
  error?: { code, message },   // ← 仅 ok=false
}
```

### `data.status` 八态

| status                  | 触发                                  | `currentStep` | `nextStep`              |
| ----------------------- | --------------------------------- | ------------- | ----------------------- |
| `workflow_started`      | init 成功                              | `null`        | 首步 id（提示下一步 handover 进 step 1） |
| `step_advanced`         | handover 进入新 step                    | 新 step id     | 下一 step id；末步时为 `null`（提示再 handover 即完成） |
| `step_resumed`          | `workflow.continue` 重发当前 step 任务 prompt（状态恢复） | 当前 step id | 下一 step id；末步时为 `null` |
| `workflow_complete`     | 末步再 handover                         | `null`        | `null`                  |
| `intervention_required` | init 时已有 active；返回 intervention prompt | 原 currentStep | —                       |
| `no_active`             | status 查询，无 active workflow           | `null`        | `null`                  |
| `active`                | status 查询，有 active workflow          | 当前 step id   | `null`                  |
| `workflow_aborted`      | abort 成功（用户主动放弃）                     | `null`        | `null`                  |

### `events[]` 六类（plugin 处理）

| event                 | 何时 emit                                            | plugin 动作                                   |
| --------------------- | ------------------------------------------------- | ----------------------------------------- |
| `context.clear`       | b3 后**几乎不再 emit**（workflow_complete 改走 `data.status`） | 若出现：释放 session（CC 无 `session.create`，degrade） |
| `prompt.inject`       | b3 后**几乎不再 emit**（任务文本搬到 top-level `prompt`）     | 若出现：将 payload.text 注入 additionalContext     |
| `prompt.inject_system`| 同上，系统通道                                            | degrade 为 `[system note] ...` additionalContext |
| `omit_prompt`         | active-injection 场景：suppress CLI return            | **不**把 `result.prompt` 注入 additionalContext |
| `interrupt_execution` | active-injection 场景：halt agent 当前 turn            | CC 无原生 halt 能力 → degrade 为 additionalContext 警示 / 忽略 |
| `error`               | `ok === false`                                     | 永远 visible，按 R9 注入 additionalContext      |

## Plugin 双形态

### 被动形态（Passive）— agent 主动调 CLI

触发场景：agent 在 step 内部觉得工作完成，自己调用 `aet workflow handover` 推进。

```
1. agent 调 Bash: aet workflow handover                  # 不带 --output
2. CC PreToolUse 钩子（matcher: Bash 前缀 `aet workflow`）拦截
   → 重写命令 append `--output json`
3. Bash 执行，stdout = CommandResult JSON
4. CC PostToolUse 钩子捕获 stdout
   → 解析 JSON
   → 处理 events[]（按上表）
   → **把 `result.prompt` 字段注入下一轮 additionalContext**
     （agent 不会直接看到 raw stdout）
   → 若 events 含 `omit_prompt`：跳过 prompt 注入
5. agent 下一轮看到 additionalContext = 新 step 任务文本
```

要点：被动模式下 agent 完全不感知 JSON，只看到 additionalContext 推送的下一 step 指令。

### 主动形态（Active）— 用户触发斜杠命令

触发场景：用户在 CC 中输入 `/design`（或 `/implement` / `/bugfix`）启动 workflow。

```
1. 用户输 `/design`
2. CC UserPromptSubmit 钩子触发（matcher: ""，匹配所有 prompt）
3. handler 解析斜杠命令 → workflow id = `design`
4. handler 调 CLI: aet workflow init --name design --output json
5. 看 init 结果：
   - ok=false → 注入 `result.prompt`（ERROR: <code> — <msg>）作为 additionalContext，结束
   - ok=true && data.status==='workflow_started' → 继续 step 5
   - ok=true && data.status==='intervention_required' → 注入 intervention prompt（含 continue/abort+init+handover 选项），结束
6. handler 再调 CLI: aet workflow handover --output json
7. 注入 `result.prompt`（step-1 任务文本）作为 additionalContext
8. agent 下一轮看到 step-1 指令，开始执行
```

要点：主动形态**分两次 CLI 调用**（init + handover），不使用 `workflow.commandInit` event。这样 init 失败时不必走 handover，分支更清晰。后续 step 推进走被动形态（agent 自调 `aet workflow handover`）。

## 斜杠命令注册

`aet plugin init` 为每个配置的 workflow / command 在宿主命令目录（CC 为 `.claude/commands/`）生成一个 `<id>.md` 斜杠命令文件。三个 baseline workflow 对应：

- `design.md` — `/design`
- `implement.md` — `/implement`
- `bugfix.md` — `/bugfix`

（另有 `auto` / `continue` / `doc` / `release` / `config-setup` 等 command 入口。）斜杠解析前缀无关：`/design` 与 `/aet:design` 都解析为 workflow id `design`。不再保留通用 `/aet <scenario>` 形式（避免正则解析场景名）。

## Plugin 三钩子

CC 的 settings.json 需注册三个 hook：

| Hook            | Matcher                       | 用途                                  |
| --------------- | ----------------------------- | ----------------------------------- |
| `UserPromptSubmit` | `""` (匹配所有)                | 主动形态：捕获 `/aet-*` 斜杠命令，触发 init+handover |
| `PreToolUse`    | `Bash`，命令前缀 `aet workflow`  | 被动形态：拦截 agent CLI 调用，append `--output json` |
| `PostToolUse`   | `Bash`，命令前缀 `aet workflow`  | 被动形态：捕获 JSON stdout，解析 + 注入 additionalContext |

## 已知 stale 代码（需按本契约重写）

下列文件实现早于 b2/b3 重构，行为与本契约不符。任何动它们的 agent 必须先把它们对齐到本契约：

- `src/plugins/claude_code/hooks/handlers/aet_handler.ts` — 仍传 `--context`、仍只看 `events[]` 忽略 top-level `prompt`、正则 `^\/aet\s+(\w+)` 不匹配 `/design`
- `src/plugins/claude_code/json_to_cc.ts` — 仍处理 `context.clear` 为 degrade hint，未处理 `omit_prompt` / `interrupt_execution`，未读 `data.status`
- `src/plugins/claude_code/commands/aet.md` — 唯一斜杠命令；本契约要求拆成三个 `aet-*.md`
- `src/plugins/claude_code/hooks/settings.json` — 只注册 UserPromptSubmit；本契约要求补 PreToolUse + PostToolUse
- `src/plugins/claude_code/README.md` — 文档 stale（仍写 `--context`、仍写 `/aet feature "..."`）

## 开发工作流

```
npm run build         # esbuild 打包 dist/bin/aet.js + 插件 bundles
npx tsc --noEmit      # 类型检查
# e2e: AET_PROJECT_ROOT=/tmp/sandbox dist/bin/aet.js workflow init --name design --output json
```
