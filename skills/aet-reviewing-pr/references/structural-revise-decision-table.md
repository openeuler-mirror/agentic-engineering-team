# Step 5a 决策表:结构化 finding revise

> `aet-reviewing-pr` 的 orchestrator 在 skeleton 阶段为每个 `deleted_file === true` 的文件预先 emit 一条 `severity: important` 的 finding(默认偏严,留待 SKILL revise)。本表是 Step 5a 调整这条 finding 严重度的判断依据。
>
> **原则**: 默认值偏严保护底线,**SKILL 必须根据文件类型 / 角色 revise**;良性删除降到 `nit` 或 `filtered`,真正高风险删除升到 `blocking`。

## 决策表

| 被删文件类型 | 处理 |
|---|---|
| Lock file (`package-lock.json`, `yarn.lock`, `Cargo.lock`, `poetry.lock`, `Pipfile.lock`, ...) | Downgrade 到 `nit`,或 mark `filtered: true, filterReason: '生成 lock 文件,良性清理或包管理器切换'` |
| Generated artifact (`dist/*`, `build/*`, `__pycache__/`, `.next/*`, `target/*`, compiled `*.min.js`, ...) | Mark `filtered: true, filterReason: '生成产物,不应被 track'` |
| Vendored code (`vendor/*`, `third_party/*`) | Downgrade 到 `nit`(reason: '已替换为依赖?需确认') |
| Test fixture / snapshot (`__snapshots__/*`, `fixtures/*`, `tests/data/*`) | Downgrade 到 `nit` |
| Documentation (`*.md`, `docs/*`) | Downgrade 到 `suggestion`(reason: '文档移除,确认无用户依赖') |
| Refactor extraction: 同 PR 里另一个新增文件里出现了相同内容 | Mark `filtered: true, filterReason: '内容已迁移到 <other-file>'` |
| **Public API / entry point** (`src/index.*`, exported types used externally) | Keep `important`,如 contract 未保留 → 考虑升 `blocking` |
| **Migration script** (`migrations/*`, `alembic/versions/*`) | **升到 `blocking`**(reason: 'migration 不应删除') |
| **Auth / security boundary file** | **升到 `blocking`**,除非保护已在他处验证 |
| **Schema / DDL** (`*.sql`, ORM model `models/*.py`) | **升到 `blocking`**(reason: 'schema 删除 = 数据丢失风险') |

## 怎么用

1. 读 skeleton.json 里的 `structuralFindings`(全部都是 `deleted_file` 类)
2. 逐条对照"被删文件类型"列匹配最贴近的一行
3. 按"处理"列改 finding 字段(severity / filtered / filterReason / body)
4. 表中没覆盖的边缘情况 —— 套用同一精神:**生成 / 衍生类降级,跨模块契约 / 不可逆类升级**

## 边缘情况备忘

- **多类型重叠**(如某 `*.md` 同时是 public API 文档): 取更严的那条处理
- **同 PR 内疑似 extraction**: 先在 worktree 里 grep 看新文件有没有同等代码;有 → filtered;没有 → 当真删除
- **路径模式没出现在表里**: 不要硬套表里的某一行。回到第一性原理 — 这个删除可逆吗?用户面会不会破?决定 nit / important / blocking
