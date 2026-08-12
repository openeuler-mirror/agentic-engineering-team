---
name: aet-design-env
description: 探测当前项目下 AET 库的存在状态（场景库/功能库/SDR 库/FMEA 库），输出 XML 元数据供 coding agent 在进入项目时快速感知"有哪些库可用、路径在哪、如何浏览"。仅暴露 context 子命令。
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

- `--root <path>`（可选）：显式指定项目根目录（默认当前工作目录）。也支持 `--root=<path>` 等号形式。`--root` 必须指向**已存在的目录**——不存在或非目录路径会硬错误退出（fail fast，不静默回退到 cwd）。
- `name...`（可选）：探测上下文名称。

输出：stdout 输出 XML 元数据（供 agent 消费）；stderr 输出告警（无数据/未知插件/插件列表）

### 上下文名称

| 名称 | 备注 |
|---|---|
| `scenario-lib` | 用于描述用户具体业务操作场景的库 |
| `function-lib` | 用于描述系统可复用的能力组合的库 | 
| `sdr-lib` | 用于描述系统安全功能规范的库 |
| `fmea-lib` | 用于描述系统各功能故障模式与影响的库 |

### 示例

```
node scripts/aet-design-env.mjs context scenario-lib function-lib sdr-lib fmea-lib
```

## 能力2：模板组装

动态模板组装提供了生成模板组装和对应检查清单组装。因为不同的模板应该有不同的检查项，故他们同属于模板组装能力。

```
## 组装模板（生成）
node scripts/aet-design-env.mjs template <template-set-path>

## 组装对于检查清单（审查）
node scripts/aet-design-env.mjs checklist <checklist-set-path>
```

参数：

- `template-set-path`（必填）：指向"基础模板集"目录的完整路径（如 `<path>/aet-req-analysis/scripts/_templates/req-analysis`）。

输出：stdout 输出组装好的 Markdown 文档；stderr 输出告警（缺失组件、无效 `heading_level` 等）与错误（循环依赖、断链等）。Exit 0 = 成功；Exit 1 = 硬错误。
