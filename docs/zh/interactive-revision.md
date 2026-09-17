# 用户交互式修订（Interactive Revision）方案说明

> 适用范围：`skills/aet-req-user-review/`（编排流水线中的用户修订环节，由 `aet-req-review` 在 S3 阶段调用）
> 文档版本：v1.0 | 更新日期：2026-09-17 | 软件版本：v1.1.0

本方案让用户**直接在原始需求文档上**完成多轮修订：Agent 负责建快照、引导批注、提取差异并做链式一致性处理。用户不需要通过对话逐条描述修改意见，只需要像平时编辑文档一样改动文件。

完整批注方式与链式修改模式说明见技能内置参考 `skills/aet-req-user-review/references/revision-guide.md`；执行契约（阶段、错误处理、约束）见 `skills/aet-req-user-review/SKILL.md`。

## 设计动机

对应 issue：用户交互式评审原先**不支持 Windows**，且首次运行需要 `npm install` 拉取外部依赖。本方案重构为：

| 旧实现的问题 | 新方案 |
| :--- | :--- |
| `bootstrap.mjs` 首次运行时执行 `npm install`，依赖网络与 npm 源 | 单入口 `scripts/revision.mjs` 为 **零依赖打包产物**（esbuild 打包，仅依赖 Node.js 内置模块），无需安装任何依赖 |
| 会话目录放在临时目录 / 仓库目录，Windows 路径与权限行为不一致 | 会话目录使用 `env-paths` 按平台规范落位（见下文「会话数据」） |
| CRLF/BOM 差异导致 Windows 编辑器重存后产生全文件伪差异 | 差异比较前统一剥离 BOM、归一化换行符为 LF |
| 无并发防护，两个会话同时修订同一文件会互相覆盖快照 | `mkdir` 原子锁 + 心跳，跨平台防并发（见下文「会话锁」） |
| 手写"可打印 ASCII 占比"嗅探，误判中文 UTF-8 文档为二进制 | 扩展名白名单 + BOM 快路径 + `isbinaryfile` 内容嗅探 |

## 四阶段流程（行为契约）

```
A1 prepare ──→ A2 guide ──→ A3 finalize ──→ A4 process
  建快照         引导就地批注    提取差异+销毁快照   链式一致性处理
```

- **A1 prepare**：对每个 `--source` 文件创建快照备份，返回会话哈希。快照是唯一的回滚保险——没有快照绝不允许用户编辑原文。
- **A2 guide**：Agent 用 question 工具展示文件列表和四种批注方式，等待用户在原文件上直接编辑。四种批注方式详见 `references/revision-guide.md`。
- **A3 finalize**：以**同一组** `--source` 文件（顺序无关，路径需归一化为绝对路径）运行 finalize，对比当前文件与 A1 快照，提取差异 hunk，销毁会话。无论用户选"无需修改"还是"完成修改"，A3 必须执行。
- **A4 process**：遍历 hunk 应用修改，并对整个交付物做链式一致性扫描（编号、交叉引用、术语、验收标准等）。

快照会话是**一次性的**：A3 销毁后，下一轮修订必须从 A1 重新开始。

## CLI 用法

```bash
# A1 — 建快照（单文件 / 多文件）
node scripts/revision.mjs prepare --source <FILE_PATH>
node scripts/revision.mjs prepare --source <FILE_1> --source <FILE_2>

# A3 — 提取差异并销毁会话（--source 集合必须与 A1 一致）
node scripts/revision.mjs finalize --source <FILE_1> --source <FILE_2>
```

可选参数：

| 参数 | 说明 | 默认值 |
| :--- | :--- | :--- |
| `--max-size <bytes>` | 单文件大小上限，超限报错跳过 | 10485760（10 MB） |
| `--ttl <hours>` | 会话 TTL，过期自动清理 | 24 |

两个子命令均输出 JSON 到 stdout。关键字段：

- `prepare` → `success`、`sessionHash`、`sessionDir`、`files[]`、`skippedFiles[]`（同一会话内重复 prepare 会保留 A1 基线，不覆盖）
- `finalize` → `success`、`hasAnyChanges`、`canProceedToNextStep`、`summary{totalAdditions,totalDeletions,totalModifications}`、`files[].hunks[]`、`sessionRetained`（有文件失败时会话保留待查）

退出码：`0` 正常（含锁冲突等已处理结果）、`1` 环境错误（Node < 20）、`2` 用法错误。

## 环境要求

- **Node.js >= 20**，无其他运行时依赖。CLI 启动时硬性校验版本，过低则报错退出（无降级回退机制）。
- 脚本源码在 `scripts/src/`（TypeScript，strict 模式），`revision.mjs` 是构建产物——**不要直接改 `revision.mjs`**，改 `src/` 后运行 `npm run build`（esbuild）重新打包。构建产物会被扫描确认不含任何非 Node 内置模块的 import。

## 会话数据

快照、清单（`manifest.json`）、日志都存放在 `env-paths('interactive-revision').data`：

| 平台 | 路径 |
| :--- | :--- |
| Windows | `%APPDATA%\interactive-revision-nodejs\<sessionHash>\` |
| macOS | `~/Library/Application Support/interactive-revision-nodejs/<sessionHash>/` |
| Linux | `$XDG_DATA_HOME/interactive-revision-nodejs/<sessionHash>/`（默认 `~/.local/share/...`） |

- 会话哈希 = 规范化排序后的源路径集合的 SHA-256 前 12 位——**同一组文件映射到同一会话目录**。
- 快照文件名为 UUID + 哈希的 ASCII 文件名，规避 Windows MAX_PATH 与非法字符问题。
- 运行日志在 `<data>/.logs/interactive-revision.log`。

## 会话锁

- 用 `mkdir` 实现原子锁（POSIX 与 Windows 均为原子操作），锁目录内写 `owner.json`（pid/host）。
- 持锁进程每 10 秒刷新锁目录 mtime 作为心跳；心跳超过 30 分钟视为持锁方已崩溃，下一个竞争者接管（不依赖 PID，规避 Windows PID 复用问题）。
- 活锁最多等待 30 秒后返回 `success: false`（"Session locked"），由上层决定重试或上报。

## 错误处理摘要

| 错误 | 行为 |
| :--- | :--- |
| 源文件不存在 | 报错，其余文件继续 |
| 文件超 `--max-size` | 报错，该文件跳过 |
| 符号链接 | 解析到真实路径，记录警告 |
| 非文本文件（二进制） | 报错，该文件跳过 |
| 锁冲突 | 等待后仍冲突则失败返回，锁在会话退出时释放 |
| A2/A3 时无快照（未跑 A1） | 立即失败，提示先运行 A1 |
| TTL 过期 / 用户超时未响应 | 自动 finalize 兜底，记录"无响应" |
| finalize 中个别文件失败 | 会话保留待查（TTL 清理兜底），不静默销毁证据 |

完整语义见 `SKILL.md` 的「Error Handling」表。

## 技能收敛说明

原 `aet-interacting-with-users` 技能与本技能功能重复，已删除——用户交互式修订统一由 `aet-req-user-review` 承担。`aet-req-review` 与 `aet-req-user-review` 均声明 `user-invocable: false`，仅由上层编排 Skill 在流水线内部调用，不作为用户命令入口。

> 注意：`aet-req-user-review` 是用户强交互技能（question 工具 + 等待用户编辑）。在自动化模式（系统提示词含 `<aet-run-mode>automation</aet-run-mode>`）下它会拒绝执行，调用方（`aet-req-review`）会在 S3 整体跳过本环节。
