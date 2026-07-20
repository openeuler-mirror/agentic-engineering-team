---
name: aet-generating-html-slides
description: Create interactive HTML slides from documents. Lightweight main skill with strict guardrails + on-demand loading of detailed references/templates.
---

# HTML-PPTX（轻量主文件）

## 目的

把文档内容生成可浏览器直接演示的 HTML 幻灯片（非 `.pptx`）。

本文件是**轻量入口**：只包含硬约束与最小流程。详细设计规范、案例与模板请**按需读取**，不要默认全量加载。

## 使用触发

用户提到以下意图时使用：
- 生成/重写 `innovation-report-slides.html`
- 把 `*.md` / `*.txt` / 文档内容转成 HTML 幻灯片
- 优化已有 HTML 幻灯片的排版、信息密度、可视化与演示体验

## 核心硬约束（必须）

1. **单页高度约束**：每页必须在 `100vh` 内完整可读。
   - 禁止把"整页纵向滚动"作为常规交付。
   - 内容超高时，必须**拆页**或**改布局**（双列/栅格/表格拆页/图文拆页）。

2. **规整画布**（内容页）：
   - 标题左对齐；表格与单行强调条全宽平铺（`width: 100%`）。
   - 禁止额外包一层窄 `max-width` 容器导致两侧大留白。

3. **封面例外**：封面页/品牌条可居中，但需作用域样式避免被全局 `h3` 左对齐规则覆盖。

4. **响应式要求**：
   - 使用 `clamp()` 控制字号与间距。
   - **clamp() 最小值 ≥ 1rem (16px)**，否则小屏幕下模糊难读。
   - 保持 16:9 演示体验；在常见分辨率下可读。

5. **页数控制**：14-22页为合理范围（过多则碎片化，过少则信息不足）。

6. **布局优化**：4+ 个卡片并列时用纵向布局，减少留白。

7. **交付能力**：
   - 必须支持左右翻页、页码/进度、全屏。
   - UTF-8 编码，含 `<meta charset="UTF-8">`。

## 最小工作流

1. 读取源文档（优先报告正文 + 必要结构化数据）。
2. 先出"页纲"（章节到页号映射），再落 HTML。
3. 生成后执行逐章对照自检：覆盖完整性 + 版式硬约束 + 高度约束。
4. 若不达标：先拆页/改布局，再复检，不通过不交付。

## 按需加载策略（重点）

### 默认仅读（第一轮）
- 本文件：`skills/aet-generating-html-slides/SKILL.md`
- 模板：`skills/aet-generating-html-slides/assets/template.html`

### 仅在需要时再读
- 需要完整示例：`skills/aet-generating-html-slides/EXAMPLE.md`
- 需要布局套路：`skills/aet-generating-html-slides/references/design-patterns.md`
- 需要视觉方向：`skills/aet-generating-html-slides/references/design-philosophy.md`
- 需要排版细节：`skills/aet-generating-html-slides/references/typography.md`
- 需要配色建议：`skills/aet-generating-html-slides/references/color-palettes.md`
- 需要质量建议：`skills/aet-generating-html-slides/references/best-practices.md`
- **需要架构图/流程图**：`skills/aet-generating-html-slides/references/mermaid-rendering.md`

### 触发矩阵（何时读取）
- **"页面超高 / 内容塞不下"** → 先读 `design-patterns.md`（拆页与布局模式）
- **"视觉普通 / 风格不统一"** → 读 `design-philosophy.md` + `color-palettes.md`
- **"字太密/层级不清"** → 读 `typography.md`
- **"想要完整参考实现"** → 读 `EXAMPLE.md`
- **"需要架构图/流程图"** → 读 `mermaid-rendering.md`（Mermaid 11.x 渲染知识）
- **"图表渲染异常/尺寸错误"** → 读 `mermaid-rendering.md`（排查 SVG 尺寸、居中问题）

## 生成时的强制检查清单

- [ ] 每页是否 100vh 内可读（无常规整页滚动依赖）
- [ ] 内容页标题是否左对齐
- [ ] 表格、强调条是否全宽对齐
- [ ] 每页是否有明确"结论 + 依据/示例/影响"
- [ ] 图表是否有解释文字（非装饰性）
- [ ] 导航与全屏是否可用
- [ ] Mermaid 图表是否正确渲染（尺寸正确、居中显示）
- [ ] Mermaid 代码是否无缩进（从行首开始）

## 对创新报告幻灯片的额外要求（与编排对齐）

当目标是 `innovation-report-slides.html` 时：
- 页序需与报告第 1–7 章一一映射（可加封面/目录/过渡/总结）。
- 第 2–7 章每章至少 2 页（复杂内容可更多）。
- 第 3 章需包含竞品分析页 + 纵横分析结果页（纵向演进、横纵交汇分析）+ **差异化机会雷达图页**：
  - 纵向演进分析：展示竞品技术演进历程、关键决策逻辑
  - 横纵交汇分析：展示历史根源追溯、决策逻辑差异
  - **差异化机会雷达图**：数据来源 `02-competitor-research.json.opportunityRadarAnalysis`，展示机会点多维度评估和优先级排序
- 第 5 章按**创新点**组织分页（不是"每个步骤一页"）：
  - 每个创新点最多 2 页
  - 可用「创新点总览页 + 步骤细节页」或同等结构
  - 每个创新点对应页/页组必须覆盖：痛点、技术挑战、与业界差异、技术点与产出
- 第 7 章需包含壁垒分析页 + SWOT策略矩阵页（数据来源 `03-innovation-analysis.json.swotAnalysis`）

## 失败回退策略

若第一轮产出不达标：
1. 优先拆页，不先压缩成小字。
2. 大表格拆成"结论页 + 分表页"。
3. 复杂图拆成"总览图 + 分层图"。
4. 仍超高则重排为双列并减少同页要点。

---

这是轻量主文件。**不要把所有 references 全部读入再开始生成**；按触发矩阵按需读取即可。