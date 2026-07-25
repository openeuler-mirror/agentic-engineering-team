# aet-req-analysis scripts — 源码与构建

本目录是 `aet-req-analysis` 脚本的**开发层**：TypeScript 源码、单元测试、构建工具链。
编译产物（零安装、自包含的 `.mjs`）输出到上级 `scripts/` 目录，供 Skill 工作流直接调用。

> 终端用户**只使用** `scripts/*.mjs`（已提交、无需 `npm install`）。
> 本目录（`src/`）仅供**开发者**修改源码、跑测试、重新构建。

## 目录结构

```
scripts/
├── assemble-template.mjs        # ← 编译产物（提交，零安装）
├── assemble-checklist.mjs       # ← 编译产物（提交，零安装）
├── library-browser.mjs          # ← 编译产物（提交，零安装，js-yaml 已内联）
├── _templates/                  # 运行时模板资源（编译产物通过 import.meta.url 读取）
├── library-browser.config.yml  # library-browser 运行时配置（类型标签/字段可见性）
├── DO-NOT-READ-_templates
└── src/                          # ← 你在这里（开发层，以下全部 git 跟踪除 node_modules）
    ├── package.json              # 依赖 + npm scripts
    ├── tsconfig.json             # TypeScript 配置（noEmit，仅类型检查）
    ├── build.mjs                 # esbuild 打包脚本
    ├── .gitignore               # 忽略 node_modules/、*.tmp、*.bak、.DS_Store
    ├── assemble-template.ts      # 源码：装配需求分析文档模板
    ├── assemble-checklist.ts     # 源码：装配需求分析评审检查表
    ├── library-browser.ts        # 源码：场景库/功能库浏览器（依赖 js-yaml）
    ├── assemble-template.test.ts     # 单元测试（34）
    ├── assemble-checklist.test.ts    # 单元测试（5）
    ├── library-browser.test.ts       # 单元测试（27）
    ├── _templates/__test__/      # 测试 fixtures（供 assemble* 集成测试）
    │   ├── artifact.md
    │   ├── checklist.md
    │   └── components/           # metadata.md / intro.md / section.md
    └── node_modules/            # （gitignored，仅开发时存在）
```

## 环境要求

- Node.js `>= 18`（推荐 20+）
- npm

## 快速开始

```bash
cd skills/aet-req-analysis/scripts/src
npm install          # 安装依赖（esbuild、typescript、vitest、js-yaml、@types/*）
npm run typecheck    # tsc --noEmit 类型检查
npm test             # vitest run 运行全部单元测试（3 个文件共 66 个）
npm run build        # 编译输出到 ../（3 个 .mjs）
```

构建后验证编译产物可用（零安装）：

```bash
cd ..                # 回到 scripts/
node assemble-template.mjs req-analysis           # 装配模板
node assemble-checklist.mjs req-analysis          # 装配检查表
node library-browser.mjs <scenario_library.yml>   # 浏览场景库（根级折叠视图）
node library-browser.mjs <scenario_library.yml> <node-id>   # 展开指定节点
```

## 命令一览

| 命令 | 作用 |
| --- | --- |
| `npm install` | 安装依赖到 `node_modules/`（不入库） |
| `npm run build` | esbuild 打包每个 `.ts` → `../<name>.mjs`（自包含、含 shebang） |
| `npm test` | vitest 单次运行全部测试 |
| `npm run test:watch` | vitest 监听模式（改代码自动重跑） |
| `npm run typecheck` | `tsc --noEmit` 纯类型检查（不产出文件） |

## 脚本说明

| 源码 | 编译产物 | 外部依赖 | 用途 |
| --- | --- | --- | --- |
| `assemble-template.ts` | `assemble-template.mjs` | 无 | 读取 `_templates/req-analysis/artifact.md`，按占位符内联组件、调整标题、加章节号，输出需求分析文档模板 |
| `assemble-checklist.ts` | `assemble-checklist.mjs` | 无 | 读取 `_templates/req-analysis/checklist.md`，按占位符内联各组件 `checklist` 元数据，输出评审检查表 |
| `library-browser.ts` | `library-browser.mjs` | js-yaml（构建时内联） | 解析场景库/功能库 YAML，按目录树展示、可按节点 ID 逐级展开，支持类型标签与字段可见性配置 |

> `assemble-template.ts` / `assemble-checklist.ts` 与 `aet-req-design` 的同名文件**字节相同**，
> 两个 skill 共享这部分逻辑，仅运行时参数不同（`req-analysis` vs `req-design`）。

## 构建原理

`build.mjs` 用 esbuild 把每个 `.ts`（排除 `*.test.ts` / `*.d.ts`）打包成单一 `.mjs`：

- **bundle + tree-shake**：所有 import 内联进单文件，运行时不需 `node_modules`
  （`library-browser` 的 `js-yaml` 也会被打进产物 → 真正零安装）
- **format: esm**：输出 ESM，保留 `import.meta.url`
- **banner**: `#!/usr/bin/env node`，产出可直接 `node xxx.mjs` 调用
- **platform: node**：`node:` 内置模块保持外部引用（不打包进文件）
- **import.meta.url 保留**：编译产物在 `scripts/` 运行时，`__dirname = scripts/`，
  从而正确找到 `scripts/_templates/` 与 `scripts/library-browser.config.yml`

> 关键点：编译产物的资源定位依赖 `import.meta.url` → 运行时 `__dirname`。
> 因此 `_templates/` 与 `library-browser.config.yml` 必须留在 `scripts/`（与编译产物同级），
> **不能**移到 `src/`。

## 测试说明

测试用 **vitest**（共 66 个），分两类：

1. **纯函数单测**（无文件系统）：
   - `assemble-*`：`stripHtmlComments`、`parseFrontmatter`、`adjustHeadingLevel`、
     `addSectionNumbers`、`validateHeadingLevel`、`validateTargetLevel`、`getCurrentTime`
   - `library-browser`：`isDirectoryNode`、`previewChildren`、`detectTypeFromLeaves`、
     `buildIndex`、`collectExpandableIds`、`resolveTypeMeta`、`renderNode`
2. **集成测试（fixture / 临时文件驱动）**：
   - `assembleTemplate('__test__')` / `assembleChecklist('__test__')` 读取 `_templates/__test__/`
     fixtures 验证端到端装配（组件内联、元数据预置、update_time 自动填充、章节号）
   - `loadLibrary()` 用 `mkdtempSync` 建临时 YAML 验证标准格式 / 旧版裸列表自动识别 / 异常抛出

> 注意：`parseFrontmatter` 对 `|` 块标量的处理是「整串 `.trim()`」，
> 即首行去缩进、后续行保留缩进——这是**忠实于原始实现**的行为，测试已对齐，勿擅自「修正」解析器。

## 开发约定

1. **改源码后必须重新构建**：`npm run build`，否则 `scripts/*.mjs` 仍是旧版。
2. **不要手改编译产物**：`scripts/*.mjs` 是构建生成物，任何修改都会被下次 build 覆盖；改逻辑请改 `.ts`。
3. **CLI 与测试隔离**：每个脚本末尾用 `isMain()` 守卫调用 `main()`，避免被测试 import 时误执行：
   ```ts
   function isMain(): boolean {
     try { return process.argv[1] === fileURLToPath(import.meta.url); }
     catch { return false; }
   }
   if (isMain()) { main(); }
   ```
4. **导出纯函数**：纯逻辑函数加 `export`，便于测试引用；`parseArgs` / `main` 不导出。
   （需在测试中 `import type` 的接口也要 `export`，如 `LibraryNode` / `LibraryConfig`。）
5. **Node 内置模块用 `node:` 前缀**（`node:fs` 等），便于类型解析与一致性。
6. **类型检查先行**：提交前跑 `npm run typecheck` + `npm test`。

## 新增脚本

1. 在 `src/` 新建 `my-script.ts`，遵循上述约定（导出纯函数 + `isMain()` 守卫）。
2. 若需测试，新建 `my-script.test.ts`。
3. `npm run build` 会自动发现并打包所有 `*.ts`（排除测试），输出 `../my-script.mjs`。
4. 在对应工作流（`skills/aet-req-analysis/workflows/*.md`）里写明调用方式：
   `node skills/aet-req-analysis/scripts/my-script.mjs <args>`，并标注「自包含、零安装」。
