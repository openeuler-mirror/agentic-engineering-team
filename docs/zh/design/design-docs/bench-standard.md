---
Version: 0.1.0  
Last Updated: 2026-09-17
---
# Bench Standard

本规范定义面向评估程序设计质量的数据集。目的是提升LLM-as-Judge评估的准确性和稳定性。

> 阅读指引：第 1 章给出评测标准总览（评测层级、评估维度与指标、计分方式）；第 2 章定义数据集总体架构；第 3~5 章分别给出 bench-root、case-input、case-eval 物料目录的详细规范。

---

## 1. 评测标准总览

### 1.1 评测层级

本 bench 采用四层评测体系。各 case 可在 `eval-spec.yaml` 中配置每层的启用状态（enabled）与权重（weight）；disabled 的层不参与评分，剩余层权重自动归一化。

| 层级 | 评测对象 | 评测内容 |
|------|----------|----------|
| L1_format | 产出格式 | 布尔检查：产出是否符合 `output-schema.yaml`、patch 是否为合法 unified diff |
| L2_coverage | 需求覆盖度 | 比率计分：覆盖的需求点数 / 需求点总数（锚点为 PRD User Stories 与派生需求） |
| L3_design_quality | 设计质量 | LLM-as-Judge 相对比较：agent 产出 vs 基准设计，逐维度评 A/B/C/D 后加权汇总 |
| L4_implementation | 代码实现 | 与基准 `implementation.patch` 对比；baseline 缺失时整层 `SKIPPED` |
| L4_test | 测试实现 | 与基准 `test.patch` 对比；baseline 缺失时整层 `SKIPPED` |

### 1.2 L3 评估维度与指标

L3 按以下 8 个维度评估，每个维度包含若干检查项（check），各检查项的判定要点（focus）见 `eval/metrics.yaml`：

| 维度 | 说明 | 检查项 |
|------|------|--------|
| maintainability | 可维护性 | orthogonality（正交性与高内聚低耦合）、solid（SOLID 原则）、evolutionary_design（演进式设计与反过度抽象） |
| testability | 可测试性 | state_decoupling（状态与依赖解耦）、determinism（确定性与可观测性） |
| reliability | 可靠性与容错性 | spof_cascading（单点故障与雪崩防范）、error_handling（异常处理与自愈能力）、concurrency_safety（并发与状态安全） |
| performance | 性能效率 | resource_efficiency（资源利用效率） |
| architectural_consistency | 架构一致性 | paradigm_uniformity（范式与模式统一）、naming_layering（命名与分层约定） |
| ai_hallucination | AI 幻觉与诱导缺陷 | false_assumptions（虚构假设）、hallucinated_apis（幻觉接口/幻觉依赖） |
| fidelity_alignment | 忠实度与对齐 | requirement_coverage（需求覆盖度）、intent_alignment（意图对齐） |
| readability | 文档与可读性 | reviewability（审查亲和度）、self_explanatory（自解释性）、information_density（信息密度） |

各检查项的归属分类与评测来源说明（**传统经典** = 软件工程长期沉淀的经典理论、度量与规范；**论文提出** = 近年论文针对 LLM/AI 时代提出或升维的评测指标；**自定义** = 本 bench 根据评测实践自行定义）：

| 评估维度 (Dimensions) | 具体检查项 (Checks ID & Name) | 归属分类 | 来源/论文出处与演进说明 |
| --- | --- | --- | --- |
| **可维护性** *(maintainability)* | `orthogonality` 正交性与高内聚低耦合 | **传统经典** | 源自 Parnas (1972) 模块化理论与 Chidamber & Kemerer (1994) CK 度量套件中的 CBO/LCOM 指标。 |
| | `solid` SOLID 原则 | **传统经典** | 由 Robert C. Martin (Uncle Bob) 在 2000 年左右提出并系统化的面向对象设计基石。 |
| | `evolutionary_design` 演进式设计与反过度抽象 | **论文提出** | **《Evaluating Source Code Quality with Large Language Models》 (ACM, 2024)** 针对 AI 时代重新审视了过度抽象带来的 Context 负荷问题。 |
| **可测试性** *(testability)* | `state_decoupling` 状态与依赖解耦 | **传统经典** | 传统单元测试与 Mocking 框架（如 Dependency Injection 模式）的核心要求。 |
| | `determinism` 确定性与可观测性 | **论文提出** | 纯函数与确定性测试是传统函数式编程理念，但在 **《From Correctness to Code Quality》 (2026)** 等 AI 评测论文中被升维为"便于 LLM 自动生成与验证 Test Case"的基准指标。 |
| **可靠性与容错性** *(reliability)* | `spof_cascading` 单点故障与雪崩防范 | **传统经典** | 源自分布式系统与高可用架构（如 Nygard 的《Release It!》）。 |
| | `error_handling` 异常处理与自愈能力 | **传统经典** | 传统可靠性范畴。 |
| | `concurrency_safety` 并发与状态安全 | **传统经典** | 传统多线程与高并发工程的核心检查项。 |
| **性能效率** *(performance)* | `resource_efficiency` 资源利用效率 | **传统经典** | 对应 **ISO/IEC 25010** 中的 Performance Efficiency (性能效率) 质量属性。 |
| **架构一致性** *(architectural_consistency)* | `paradigm_uniformity` 范式与模式统一 | **传统经典** | 源自架构模式（Architectural Patterns）与 Martin 度量体系中的软件一致性要求。 |
| | `naming_layering` 命名与分层约定 | **传统经典** | 软件工程规范（Clean Code / DDD 规范）的标准组成部分。 |
| **AI 幻觉与诱导缺陷** *(ai_hallucination)* | `false_assumptions` 虚构假设 | **自定义** | 实践发现该类问题比较严重。 |
| | `hallucinated_apis` 幻觉接口/幻觉依赖 | **论文提出** | 论文 **《From Correctness to Code Quality: Formalizing Software Engineering Metrics for Evaluating General LLMs》 (2026)** 提出的 **IVS (Input Validation Score)** 和符号一致性，以及业内普遍针对 LLM 代码生成定义的 **Hallucinated Package/API Density**。 |
| **忠实度与对齐** *(fidelity_alignment)* | `requirement_coverage` 需求覆盖度 | **自定义** | 评估 LLM 方案设计完整性的 Prompt-to-Design 覆盖率。 |
| | `intent_alignment` 意图对齐 | **论文提出** | 源自大模型对齐（Alignment）理论；在 **Anthropic Engineering 《Demystifying Evals for AI Agents》 (2026)** 中被提炼为评估 Agent 设计方案是否符合用户偏好与业务真实 intent 的关键指标。 |
| **文档与可读性** *(readability)* | `reviewability` 审查亲和度 | **自定义** | 结合了传统 Code Review 成本与 AI 编码时代人类/AI Reviewer 的**认知负荷（Cognitive Load）**。 |
| | `self_explanatory` 自解释性 | **传统经典** | 源自《Clean Code》倡导的自解释代码与结构表达能力。 |
| | `information_density` 信息密度 | **论文提出** | 论文 **《From Correctness to Code Quality: Formalizing Software Engineering Metrics for Evaluating General LLMs》 (2026)** 提到了 **DS (Documentation Faithfulness)** 指标。 |

### 1.3 计分方式

- **L1_format**：布尔检查，每项 check 独立判定通过/失败。
- **L2_coverage**：
  - `user_story_coverage = 覆盖的 User Story 数 / User Story 总数`
  - `derived_requirement_coverage = 覆盖的 derived requirement 数 / derived requirement 总数`
  - 取值范围均为 [0.0, 1.0]。
- **L3_design_quality**：评审按维度逐项比较，每维度独立给出 A/B/C/D 评分：
  - A（agent 产出优于 baseline）= 1.0；B（baseline 优于 agent 产出）= -1.0；C（同样好）= 0.5；D（同样差）= -0.5
  - 层内得分 = Σ(维度得分 × 维度权重)，默认维度权重见 `metrics.yaml`，可在 case 的 `eval-spec.yaml` 中覆盖。
- **L4_implementation / L4_test**：baseline patch 存在时进行对比评测（对比方法由 `eval/methodology.md` 定义）；baseline 缺失时对应层标记 `SKIPPED`，不参与评分。

---

## 2. 总体架构

数据集由唯一的入口仓库 bench-root 组织，case 的输入物料与评测物料以目录形式置于 bench-root 内部：

- **bench-root**（入口仓库，公开）：索引所有 case，定义评测方法论和运行时规范
  - **case-{id}-input/**（输入物料目录）：单个 case 的输入物料（PRD、存量代码、约束），位于 `cases/case-{id}/` 下，对被测 agent 可见
  - **case-{id}-eval/**（评测物料目录）：单个 case 的评测物料（基准设计、参考 patch），位于 `cases/case-{id}/` 下，评测运行时仅在 eval 阶段向 judge 暴露，被测 agent 不可见

```
bench-root/                          # 入口仓库
├── README.md                        # bench说明
├── cases/
│   ├── case-{id}/
│   │   ├── meta.yaml                # case 元数据
│   │   ├── input.md                 # 被测 agent 输入提示词 + 输入物料获取指引
│   │   ├── eval.md                  # judge agent 输入提示词 + 评测物料获取指引
│   │   ├── output-schema.yaml       # agent 输出契约
│   │   ├── eval-spec.yaml           # 评测规约
│   │   ├── case-{id}-input/         # 输入物料目录（原独立仓库移入）
│   │   │   ├── prd/
│   │   │   │   └── prd.md           # 产品需求文档
│   │   │   ├── repo/                # 存量代码快照
│   │   │   └── README.md            # agent 使用指引
│   │   └── case-{id}-eval/          # 评测物料目录（原独立仓库移入，仅 eval 阶段可见）
│   │       ├── design/
│   │       │   ├── 需求分析说明书.md # 基准需求分析
│   │       │   └── 功能设计说明书.md # 基准功能设计
│   │       ├── implementation.patch # 基准代码修改 patch（可选）
│   │       ├── test.patch           # 基准测试 patch（可选）
│   │       └── coverage-matrix.yaml # PRD 需求点 → 基准覆盖映射
│   └── ...
└── eval/
    ├── methodology.md               # 评测方法论
    └── metrics.yaml                 # 全局指标定义
```

---

## 3. bench-root 详细规范

### 3.1 `cases/case-{id}/meta.yaml`：Case 元数据（用于分类、筛选与能力画像）

```yaml
id: "ecommerce-flash-sale"              # case 唯一标识，与目录名一致
name: "电商网站限时秒杀功能"              # 可读名称
domain: "ecommerce"                      # 领域标签

difficulty: "hard"                       # 难度：easy | medium | hard | expert
# 难度判定参考：
#   easy   - 单文件修改，逻辑简单，无跨模块影响
#   medium - 少量文件修改，需理解模块间交互
#   hard   - 多模块变更，涉及异步/并发/状态机等复杂逻辑
#   expert - 架构级变更，需深度理解框架内部机制

codebase:
  language: "java"                       # 主语言
  framework: "Spring Boot + Redis"       # 涉及的框架/运行时

feature:
  type: "feature"                        # 需求类型：feature | refactor | fix | enhancement
  modified_files: 15                     # 需修改的代码行数（近似）
  loc: 30000                             # 存量代码行数（近似）

tags:                                    # 自由标签，支持细粒度筛选
  - "flash-sale"
  - "high-concurrency"
  - "kernel-space"

eval_capabilities:                    # 本 case 覆盖的评测能力维度
  design: true                        # 是否存在基线设计
  implementation: true                # 是否存在基线代码
  test: false                         # 是否存在基线测试
```

**字段说明：**

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 全局唯一 |
| `name` | 是 | 可读名称 |
| `domain` | 是 | 领域分类 |
| `difficulty` | 是 | 四级难度 |
| `codebase` | 是 | 代码库基本信息 |
| `feature` | 是 | 需求基本信息（类型与变更规模） |
| `tags` | 否 | 自由标签 |
| `eval_capabilities` | 是 | 声明本 case 支持哪些评测维度 |

### 3.2 `cases/case-{id}/input.md`：Agent 输入提示词（任务描述与物料获取指引）

```markdown
# Input

Please clone the repository `<REPO_URL>`. The input materials of this case are located
at `cases/case-{id}/case-{id}-input/`. Read the PRD, and complete
the requirements analysis and functional design based on the codebase in the repository.

## Task

<具体任务描述，引用 output-schema 中定义的输出要求>

## Constraints

<从 constraints.md 摘要的关键约束，或指向 constraints.md>
```

**设计要点：**
- 此文件是 agent 唯一的输入入口，必须自包含
- 仓库 URL 在发布时替换 `<REPO_URL>` 占位符
- 任务描述需与 `output-schema.yaml` 对齐

### 3.3 `cases/case-{id}/output-schema.yaml`：Agent 产出契约（定义产出文件结构、格式与必填项）

```yaml
version: "1.0"

# 产出目录结构
output_structure:
  # --- 设计阶段（必选） ---
  design:
    files:
      - path: "需求分析说明书.md"
        required: true
        description: "需求分析文档"
        content:
		    - "需求背景与目标"
		    - "功能需求列表"
		    - "非功能需求列表"
      - path: "功能设计说明书.md"
        required: true
        description: "功能设计文档"
        content:
		    - "架构变更说明"
		    - "核心流程设计"
		    - "接口设计"
		    - "数据结构设计"

  # 可选，若eval_capabilities中implementation为false将忽略该字段
  implementation:
    files:
      - path: "implementation.patch"
        required: true
        description: "代码修改 patch，基于 input 物料目录的 repo/ 子目录生成"

  # 可选，若eval_capabilities中test为false将忽略该字段
  test:
    files:
      - path: "test.patch"
        required: true
        description: "测试代码 patch，基于 input 物料目录的 repo/ 子目录生成"

```

**降级容忍机制：**

| `eval_capabilities` | `output_schema` 中对应 section | 行为 |
|---------------------|-------------------------------|------|
| `design: true` | `design.required: true` | agent 必须产出设计文档，否则 L1 评测失败 |
| `implementation: true` | `implementation.required: true` | agent 必须产出代码 patch |
| `implementation: false` | `implementation.required: false` | agent 不产出代码 patch 不会报错，L4(impl) 维度跳过 |
| `test: true` | `test.required: true` | agent 必须产出测试 patch |
| `test: false` | `test.required: false` | agent 不产出测试 patch 不会报错，L4(test) 维度跳过 |

**关键原则：缺失可选产出不触发报错，仅导致对应评测维度标记为 `SKIPPED`，不影响已有维度的评分。**

### 3.4 `cases/case-{id}/eval-spec.yaml`：Case 评测规约（评测层级配置，可覆盖全局默认）

```yaml
case_id: "ecommerce-flash-sale"

# 评测层级配置
layers:
  L1_format:
    enabled: true
    weight: 0.1                       # 该层在本 case 总分中的权重
    checks:
      - "output_schema_compliance"     # 产出是否符合 output-schema
      - "patch_format_valid"           # patch 格式是否为合法 unified diff

  L2_coverage:
    enabled: true
    # 使用 case-eval 中的 coverage-matrix.yaml
    weight: 0.2
    baseline: coverage-matrix.yaml
    judge_config:
      model: "<JUDGE_MODEL>"          # 评测模型

  L3_design_quality:
    enabled: true
    weight: 0.5
    method: "llm_judge"               # 评测方法：llm_judge | human_review | hybrid
    baseline: "design/"               # 对照的基准文档目录（相对于 case-eval 物料目录）
    judge_config:
      model: "<JUDGE_MODEL>"          # 评测模型

  L4_implementation:
    enabled: false                     # 当 eval_capabilities.implementation = false 时为 false
    weight: 0.2
    baseline_patch: "implementation.patch"

  L4_test:
    enabled: false                    # 当 eval_capabilities.test = false 时为 false
    weight: 0.0
    baseline_patch: "test.patch"
```

**降级容忍规则：**

- `L4_implementation.enabled` 由 `eval_capabilities.implementation` 决定
- `L4_test.enabled` 由 `eval_capabilities.test` 决定
- disabled 的层权重为 0，不参与评分；剩余层权重自动归一化
- 若某层 check 所依赖的 baseline 文件不存在（如 `test.patch` 缺失），该 check 标记为 `SKIPPED` 而非 `FAILED`

### 3.5 `eval/metrics.yaml`：全局评测指标定义（L3 维度指标与计分体系，作为各 case eval-spec 的默认基线）

```yaml
version: "1.0"
  L3_design_quality:
    description: "设计质量评估（相对比较）"
    dimensions:
      maintainability:
        description: "可维护性"
        checks:
          - id: "orthogonality"
            name: "正交性与高内聚低耦合"
            focus: "模块边界是否清晰，变更是否会引发涟漪效应；是否存在隐式跨模块依赖"
          - id: "solid"
            name: "SOLID 原则"
            focus: "单一职责（模块变更理由是否唯一）、开闭原则（扩展方式）、接口隔离、依赖倒置"
          - id: "evolutionary_design"
            name: "演进式设计与反过度抽象"
            focus: "是否存在 YAGNI 违规（为假设的未来需求引入冗余抽象层）；设计是否具备易废弃性"

      testability:
        description: "可测试性"
        checks:
          - id: "state_decoupling"
            name: "状态与依赖解耦"
            focus: "是否存在强关联静态单例、全局变量或无控副作用，导致无法独立 Mock"
          - id: "determinism"
            name: "确定性与可观测性"
            focus: "核心逻辑是否为纯函数，输入输出是否明确，便于自动生成测试用例"

      reliability:
        description: "可靠性与容错性"
        checks:
          - id: "spof_cascading"
            name: "单点故障与雪崩防范"
            focus: "关键链路是否存在单点依赖；是否有熔断、降级、超时与限流机制"
          - id: "error_handling"
            name: "异常处理与自愈能力"
            focus: "错误捕获是否规范；关键异步任务是否有重试策略与死信队列"
          - id: "concurrency_safety"
            name: "并发与状态安全"
            focus: "是否存在临界区竞争、死锁、连接池耗尽或内存泄漏风险"

      performance:
        description: "性能效率"
        checks:
          - id: "resource_efficiency"
            name: "资源利用效率"
            focus: "对 CPU/内存/网络/IO 的利用是否合理，是否存在可避免的性能瓶颈"

      architectural_consistency:
        description: "架构一致性"
        checks:
          - id: "paradigm_uniformity"
            name: "范式与模式统一"
            focus: "持久化层、状态管理、错误处理机制是否使用统一规范"
          - id: "naming_layering"
            name: "命名与分层约定"
            focus: "目录结构、分层调用规则、命名风格是否保持一致"

      ai_hallucination:
        description: "AI 幻觉与诱导缺陷"
        checks:
          - id: "false_assumptions"
            name: "虚构假设"
            focus: "设计前提是否脱离实际（如不存在的库、错误的拓扑、过时的协议版本）"
          - id: "hallucinated_apis"
            name: "幻觉接口/幻觉依赖"
            focus: "是否存在虚构的类、方法、参数或根本不存在的第三方依赖"

      fidelity_alignment:
        description: "忠实度与对齐"
        checks:
          - id: "requirement_coverage"
            name: "需求覆盖度"
            focus: "功能性与非功能性需求是否完整包含"
          - id: "intent_alignment"
            name: "意图对齐"
            focus: "设计是否与业务诉求一致，是否存在过度解读或需求偏离"

      readability:
        description: "文档与可读性"
        checks:
          - id: "reviewability"
            name: "审查亲和度"
            focus: "审查者需要多少精力理解与推演此设计"
          - id: "self_explanatory"
            name: "自解释性"
            focus: "架构图表与注释是否清晰简明"
          - id: "information_density"
            name: "信息密度"
            focus: "是否存在大量 AI 废话；是否用精炼结构说明了'为什么这么设计'而非仅'设计了什么'"

# 评分体系
scoring:
  L2_checks:
    user_story_coverage:
      type: "ratio"                   # 覆盖的 User Story / 总 User Story
      range: [0.0, 1.0]
    derived_requirement_coverage:
      type: "ratio"                   # 覆盖的 derived requirement / 总 derived requirement
      range: [0.0, 1.0]

  L3_checks:
    pairwise_comparison:
      type: "ordinal"
      scale:                          # A/B/C/D 四级
        A: 1.0                        # agent 产出优于 baseline
        B: -1.0                       # baseline 优于 agent 产出
        C: 0.5                        # 同样好
        D: -0.5                       # 同样差
      # 评审应按 L3 dimensions 逐维度比较，而非整体印象打分
      # 每维度独立给出 A/B/C/D，最终加权汇总
      dimension_weights:              # 可在 case 的 eval-spec.yaml 中覆盖
        maintainability: 0.20
        testability: 0.10
        reliability: 0.15
        performance: 0.10
        architectural_consistency: 0.10
        ai_hallucination: 0.15        # 幻觉缺陷权重较高，因其直接反映 AI 特有风险
        fidelity_alignment: 0.10
        readability: 0.10
```

### 3.6 `eval/methodology.md`：评测方法论（Judge Prompt 模板与人工复核流程等）

**测评器提示词（Judge Prompt 模板）：** 用于 L3_design_quality 层的 pairwise 比较评审（方案1 为 agent 产出，方案2 为 baseline；评审结论 A/B/C/D 按 `metrics.yaml` 的 `pairwise_comparison` 量表计分）：

```markdown
# 软件设计方案评审提示词

你是独立、严格、证据驱动的软件架构评审专家。只评估设计质量，不评估文档表达；不得因方案顺序、名称、模板、篇幅、文风、结构完整度、术语、抽象层次、图表或伪代码数量产生倾向。目标是判断哪个方案在实际工程上更优，或判定平局。

## 1. 设计质量与描述质量解耦
- 文档详细、篇幅长、类/函数名多、图表多、伪代码多，不直接构成优势。
- 额外细节只有在其能澄清关键决策、消除歧义、证明可实施或揭示重要工程性质时才有正向价值；若引入未验证的接口、依赖、数据结构、基础设施假设或约束，则作为负面证据。
- 文档未说明不等于设计错误；但当某项信息是证明方案正确性、安全性、可实施性或满足关键需求的必要条件时，缺少它可构成不确定性或完整性风险，并须解释为何必要。

## 2. 证据与代码事实
- 证据优先级：实际需求与明确约束 > 可验证的代码/接口/配置/依赖/运行机制 > 由事实直接推出的结论 > 方案明确提出且逻辑成立的设计决策 > 未验证的工程经验推测 > 纯文字声明/自我评价/修辞。
- 重点核验：现有模块与依赖、被修改的类/函数/接口是否真实存在、调用链是否一致、数据结构与生命周期假设、框架/API/SDK 能力、现有抽象是否支持扩展、是否破坏既有行为、声称解决的问题是否真实存在、变更是否覆盖需求执行路径、是否引入隐藏耦合/重复状态/竞争条件/兼容性问题/不必要复杂度。
- 方案文档中的陈述不是自动事实；与代码冲突时以可验证事实为准。无法验证的关键判断应标记“证据不足/无法验证”，不得虚构代码行为、API、依赖或业务约束。
- 对“扩展性好”“异步提升性能”等声明，要求给出具体机制、边界、接口、依赖方向、当前瓶颈及新增复杂度等证据。

## 3. 评审流程
- 先独立评审方案1和方案2，分别建立各自的收益、成本、风险和未验证假设；不得以方案1为基准要求方案2采用相同设计。
- 再对称比较；若指出某方案问题，须检查另一方案是否存在同类问题。
- 比较实际工程影响，不统计优缺点数量。一个核心正确性的严重问题可能超过多个轻微优点。考虑问题真实性、证据强度、发生概率、影响范围、是否位于核心路径、修复成本、是否设计本身问题、演化放大风险。

## 4. 反偏差要求
主动校正：位置偏差、冗长偏差、详细度偏差、熟悉度偏差、作者/风格偏差、锚定效应、数字评分偏差、重测不一致。
- 不因方案采用熟悉架构模式、框架写法或常见答案而偏爱；不常见方案也不因陌生受惩罚。
- 做标签交换检查：若方案1/方案2名称互换但技术内容不变，结论应一致。
- 若文档被改写、缩写、扩写或重新排版但不改变设计语义，结论应一致。
- 内部评分仅可辅助推理，最终选择由具体证据和工程影响决定，不因分数整齐或习惯分值产生判断。

## 5. 最终选择
只能选择：
- A：方案1比方案2好
- B：方案2比方案1好
- C：两者同样好
- D：两者同样差

A/B 仅在存在明确、可解释、有实际工程意义的净优势时选择；不因微小差异、表达差异、篇幅或证据不足选择 A/B。

C：两条设计路径不同但都合理；差异主要为表达/细节；各有局部优劣但无整体优劣；证据不足以建立实际优势。

D：两者都有严重根本性设计问题、偏离关键需求、建立在不可成立的关键假设上、无法形成可信可实施方案。

平局是正式合法结果，不要为显示判断力强行选择赢家。

## 6. 可审计性要求
对影响最终选择的每个主要判断，说明：
- 具体比较什么；
- 方案1实际如何处理，方案2实际如何处理；
- 依据来源；
- 哪些是已验证事实，哪些是推论或证据不足；
- 为什么该差异有/无实际工程影响；
- 如何影响最终选择。

对两个方案同等深度审查，不得为获胜方案详细寻找优点而粗略描述另一方案，也不得详细攻击一方案却默认另一方案无同类风险。不使用空泛理由，如“更完善”“更合理”“更专业”“扩展性更好”，除非紧随具体机制、事实和相对差异。
```

---

## 4. case-input 物料目录详细规范

### 4.1 `prd/prd.md`：产品需求文档（Agent 的核心输入）

**格式要求：**
- Markdown 格式
- 采用业务视角的叙述式结构，不预设已分解的功能/非功能需求编号

**必须包含的章节：**

| 章节 | 必填 | 说明 |
|------|------|------|
| Problem Statement | 是 | 问题描述：存量系统的现状、痛点与业务动机 |
| Solution | 是 | 期望达成的效果与总体解决方向（业务层面，不含技术实现细节） |
| User Stories | 是 | 以用户角色视角描述期望能力（As a... I want... so that...） |
| Implementation Decisions | 否 | 已确定的技术方向约束（如框架选型、架构归属），仅在业务方已明确约束时提供 |
| Out of Scope | 是 | 明确不属于本次需求的内容，帮助界定范围 |

**禁止包含的内容：**

| 禁止项 | 原因 |
|--------|------|
| 已分解的功能性需求列表（如 FR-01, FR-02...） | 需求分解是需求分析阶段的核心产出，PRD 中暴露会跳过对 agent 需求分析能力的评测 |
| 已分解的非功能性需求列表（如 NFR-01, NFR-02...） | 同上，非功能需求的识别与量化属于分析能力评测范围 |
| 备选场景、异常场景、边界场景的详细描述 | 场景分析是需求分析的核心能力，PRD 仅描述主成功路径，异常/边界场景由 agent 自行发现 |
| 具体代码仓库内容（变量名、函数名、结构体字段等） | PRD 应与实现无关；代码探索能力是 agent 的评测维度，不应在输入中泄露实现细节 |
| 实现方案的具体技术路径 | 需保留设计空间供 agent 发挥；如业务方有硬性约束应放在 Implementation Decisions 中以约束形式声明 |

**示例结构：**

```markdown
# PRD: 电商网站限时秒杀功能

## Problem Statement

某电商平台目前仅支持常规购物流程（浏览→加购→下单→支付），在大型促销活动（如双11、618）期间，
高并发抢购场景下频繁出现库存超卖、页面卡顿、订单处理延迟等问题。运营团队需要一套限时秒杀功能，
在指定时间段内以活动价格限量销售商品，既能保证高并发下的库存准确性，又能提供流畅的用户体验。

## Solution

在现有电商系统中新增限时秒杀活动模块。运营人员可创建秒杀活动，设定活动时间、商品和库存数量；
用户在活动期间可参与抢购，系统保证库存不超卖、订单不丢失，活动结束后自动关闭入口。
对于并发超限、重复下单、活动未开始/已结束等异常情况，系统应给出明确提示而非报错。

## User Stories

1. As a 运营人员, I want 创建限时秒杀活动并设定商品、库存和时间, so that 我可以灵活运营促销活动
2. As a 用户, I want 在秒杀活动期间快速下单, so that 我可以用优惠价格抢到限量商品
3. As a 运营人员, I want 实时查看秒杀活动的库存和订单数据, so that 我可以及时调整运营策略

## Implementation Decisions

- 秒杀活动归属现有促销模块，不新建独立微服务
- 库存扣减必须在下单时原子完成，不依赖异步最终一致

## Out of Scope

- 不涉及支付系统改造
- 不涉及商品主数据管理
- 不涉及推荐算法或个性化排序
- 不涉及物流履约流程
- 不涉及跨平台（APP/小程序）的差异化交互
```

> **注意**：User Stories 是 L2 覆盖度检查的锚点，每条 User Story 应有隐含的编号（按列表序号），eval 阶段通过语义匹配而非编号来建立覆盖映射。

### 4.2 `repo/`

存量代码快照。

**要求：**
- 必须是可构建的完整代码快照（非 git 子模块引用）
- 如需脱敏，需保证代码可编译/解析
- 建议附带 base commit hash（记录在 case-eval 物料目录中，case-input 无需包含）

### 4.3 `README.md`

Agent 使用指引，说明如何阅读 case 输入物料、如何构建/运行代码。

---

## 5. case-eval 物料目录详细规范

### 5.1 `design/`

基准设计文档，用于 L3 设计质量相对比较。

**文件结构：**

```
design/
├── 需求分析说明书.md
└── 功能设计说明书.md
```

**要求：**
- 文档中需求点编号应与 `prd/prd.md` 对应，便于 L2 覆盖度矩阵引用
- 基准文档是"参考方案"而非"唯一正确答案"，评测时允许 agent 产出与 baseline 不同的设计路径

### 5.2 `implementation.patch`（可选）

基准代码修改 patch，用于 L4_implementation 评测。

**格式：** unified diff，基于 input 物料目录 `repo/` 的 base commit 生成。

**要求：**
- patch 必须可 clean apply 到 base commit
- 当 `meta.yaml` 中 `eval_capabilities.implementation = false` 时，此文件不存在

**降级规则：**
- 文件缺失 → `L4_implementation` 整层标记 `SKIPPED`
- 文件存在但无法 apply → `L4_implementation.patch_applicable` 标记 `FAILED`，后续 check 标记 `SKIPPED`

### 5.3 `test.patch`（可选）

基准测试 patch，用于 L4_test 评测。

**格式：** unified diff，基于 input 物料目录 `repo/` 的 base commit 生成。

**要求：**
- patch 必须可 clean apply 到 base commit（或 apply 到 base + implementation.patch 之后）
- 当 `meta.yaml` 中 `eval_capabilities.test = false` 时，此文件不存在

**降级规则：**
- 文件缺失 → `L4_test` 整层标记 `SKIPPED`
- 文件存在但无法 apply → `L4_test.patch_applicable` 标记 `FAILED`，后续 check 标记 `SKIPPED`

### 5.4 `coverage-matrix.yaml`

**场景、需求覆盖率：**
- 主成功场景、备选场景、异常场景
- 功能性需求、非功能性需求

```yaml
case_id: "ecommerce-flash-sale"

Scenario:
  SC-01:
    statement: "创建限时秒杀活动并设定商品、库存和时间"

  SC-02:
    statement: "在秒杀活动期间快速下单"

  SC-03:
    statement: "实时查看秒杀活动的库存和订单数据"

requirements:
  FR-01:
    description: "库存扣减必须原子完成，防止超卖"
    source: SC-02

  FR-02:
    description: "活动未开始/已结束时拒绝下单并给出提示"
    source: SC-02

  NFR-01:
    description: "秒杀接口响应时间<200ms"
    source: SC-02

  NFR-02:
    description: "支持万级QPS并发抢购"
    source: SC-02
```

**降级规则：**
- 文件缺失 → L2 中 `prd_requirement_coverage` check 改为从文档内容自动提取 User Story 进行语义匹配，精度可能降低但不报错
- `derived_requirements` 段缺失 → L2 仅检查 User Story 覆盖度，不检查需求分解的完整度