---
name: aet-design-env
description: AET 设计环境感知与组装能力中心。探测当前项目下 AET 库的存在状态（场景库/功能库/SDR 库/FMEA 库）并输出 XML 元数据；提供库浏览、模板组装与审查清单组装能力。暴露 context / library / template / checklist 子命令。
allowed-tools: Read
metadata:
  pattern: tool-wrapper
---

# aet-design-env

本 SKILL 提供了AET设计相关能力。

## 脚本位置

编译产物（唯一执行入口）：

```
skills/aet-design-env/scripts/aet-design-env.mjs
```

## 能力1：设计上下文感知

```
node scripts/aet-design-env.mjs context [--root <path>] [name...]
```

参数：

- `--root <path>`（必须）：显式指定项目根目录（因为执行流程中会进入子目录导致结果不准）。也支持 `--root=<path>` 等号形式。`--root` 必须指向**已存在的目录**——不存在或非目录路径会硬错误退出（fail fast，不静默回退到 cwd）。
- `name...`（可选）：探测上下文名称。

输出：stdout 输出 XML 元数据（供 agent 消费）；stderr 输出告警（无数据/未知插件/插件列表）

### 上下文名称

| 名称 | 备注 |
|---|---|
| `scenario-lib` | 用于描述用户具体业务操作场景的库 |
| `function-lib` | 用于描述系统可复用的能力组合的库 | 
| `sdr-lib` | 用于描述系统安全/可靠性 SDR 的库（安全含可选安全功能规范） |
| `fmea-lib` | 用于描述系统各功能故障模式与影响的库 |

### 示例

```
node scripts/aet-design-env.mjs context scenario-lib function-lib sdr-lib fmea-lib
```

**注意此处仅告知存在性，不意味需要进行库浏览。请在后续执行阶段有明确浏览指令后执行，并非在感知上下文后直接进行**

## 能力2：模板组装

动态模板组装提供了生成模板组装和对应检查清单组装。因为不同的模板应该有不同的检查项，故他们同属于模板组装能力。

```
## 组装模板（生成）
node scripts/aet-design-env.mjs template <template-set-path>

## 组装对于检查清单（审查）
node scripts/aet-design-env.mjs checklist <checklist-set-path>
```

参数：

- `template-set-path`（必填）：指向"基础模板集"目录的完整路径（如 `<path>/aet-req-analysis/references/_templates/req-analysis`）。

输出：stdout 输出组装好的 Markdown 文档；stderr 输出告警（缺失组件、无效 `heading_level` 等）与错误（循环依赖、断链等）。Exit 0 = 成功；Exit 1 = 硬错误。

## 能力3：库浏览

逐级浏览场景库 / 功能库 / SDR 库 / FMEA 库等 YAML 知识库，按目录树折叠展示、可按节点 ID 逐级展开、可按关键词搜索。**严禁直接读取（read）库 YAML 原始文件**，必须通过本子命令查看。

```
node scripts/aet-design-env.mjs library <library.yml> [node-id1 node-id2 ...] [-s <keyword>]
```

参数：

- `library.yml`（必填）：库 YAML 文件的完整路径（`.yml` / `.yaml`）。
- `node-id1 node-id2 ...`（可选）：增量展开的目录节点 ID 列表；不传则仅展示根级（目录节点折叠、显示子内容预览）。
- `-s <keyword>`（可选）：在库内（或展开的子树范围内）按关键词搜索节点。

输出：stdout 输出浏览/展开/搜索结果（类型标签、节点树、字段、可继续展开的目录节点提示）；stderr 输出告警（无效节点 ID 等）与错误（文件不存在、YAML 解析失败等）。Exit 0 = 成功；Exit 1 = 硬错误。

### 库浏览规范

- **逐级优先**：以**逐级展开目录树**为主要浏览方式；`-s` 关键词搜索仅为辅助定位手段，**不可替代逐级搜索**——仅依赖搜索容易遗漏节点。
- **搜索上限**：针对同一浏览任务，使用 `-s` 尝试的关键词组合累计**不得超过 3 个**。
- **搜索后回退**：无论搜索成功与否，至多 3 次 `-s` 搜索后，**必须回到根目录继续逐级展开查找**，确保无遗漏。

### 用法

```bash
# 浏览目录树根级（目录节点折叠，仅显示子内容预览）
node scripts/aet-design-env.mjs library <library.yml>

# 按分类展开一个或多个目录节点
node scripts/aet-design-env.mjs library <library.yml> <目录id>
node scripts/aet-design-env.mjs library <library.yml> <id1> <id2> <id3>

# 精确/全局搜索（辅助定位手段，不可替代逐级搜索，仅靠搜索容易遗漏节点）
# 同一任务至多尝试 3 个关键词组合；之后无论结果如何，均回到根目录逐级展开查找
node scripts/aet-design-env.mjs library <library.yml> -s <关键词>

# 在展开的子树范围内搜索
node scripts/aet-design-env.mjs library <library.yml> <目录id> -s <关键词>

# 查看详情（展开到叶子节点）
node scripts/aet-design-env.mjs library <library.yml> <叶子id>
```

### 配置（可选）

字段可见性（隐藏某些元数据字段）与类型显示标签由 `library-browser.config.yml` 控制，按 5 级就近查找：项目 `.aet/design/custom/` → `.aet/design/aet/` → home `~/.aet/design/custom/` → `~/.aet/design/aet/` → 本 skill 自带的 `config/library-browser.config.yml`。未命中时所有字段默认全部展示。
