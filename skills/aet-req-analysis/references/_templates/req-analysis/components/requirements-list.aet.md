---
heading_level: 2
checklist: |

  **功能性需求**

  1. 优先级是否合理 (WARNING)
     - P0/P1/P2 标注清晰
     - 核心主流程为 P0，效率辅助为 P1，体验优化为 P2

  2. 需求规格描述是否清晰 (WARNING)
     - 规格清晰无歧义

  3. 是否避免设计决策 (ERROR)
     - 仅描述需求，不涉及实现方案
     - 不由技术栈变化而失效
     - 判别尺度由是否容易引入过度约束限制后续设计判断
     - 不得矫枉过正影响需求描述清晰度，或做无必要抽象

  4. 是否覆盖隐含能力 (WARNING)
     - 分析场景中隐含的系统能力，判断是否有关键遗漏
     - 逐一审视场景步骤，问"在此步骤中，如果 XX 发生了，系统怎么处理？"
     - 
  **非性能需求（如有）**

  1. 是否有量化验收标准 (WARNING)
     - 描述包含可量化的验收标准：响应时间、可用率、错误率、恢复时间等

  2. Effort=High时，是否覆盖关键质量属性 (WARNING)
     - 可用&可靠性、性能

  3. 是否合理全面 (WARNING)
     - 分析需求涉及的DFx属性，判断是否有遗漏或不合理之处

---

## 需求列表

<!-- policy: NEVER make design decisions. Breaking down functional requirements to the implementation level restricts subsequent design flexibility and makes it difficult to adapt to user-driven changes. -->

<!-- policy: Business rules express "what business behavior the system must exhibit", prohibiting implementation methods. Each rule must be decidable and must not rely on technical implementation details. -->

<!-- guideline: Describe the internal logic driving scenario flows, including but not limited to: state definitions and transition conditions, trigger conditions and prerequisites, mutually exclusive rules and priority rules, validation logic, permission constraints, etc. -->

<!-- guideline: Apply the Easy Approach to Requirements Syntax (EARS) to strictly constrain requirement specifications using deterministic logical syntax. Deconstruct every requirement into four core primitives: Entity, Action, Relationship, and Scope. By mandating structured templates (e.g., "When [trigger] occurs, the [system] shall [action]"), shifting the output from merely descriptive to rigorously normative. -->

<!-- Constraint: Do not split multiple specifications into separate requirements; instead, keep multiple specs under one requirement. -->

### 功能性需求

<!-- guideline: Can describe core functions by P0 / P1 / P2 levels; core main flow can be P0, efficiency-enhancing auxiliary capabilities can be P1, experience optimization items can be P2. -->

<!-- constraint: After FR completion, review each use cases to confirm that every capability requirements are covered by FRs. -->

<!-- Patch: Too many requirements indicate over‑splitting of specifications. Functional requirements should normally be no more than 5. -->

|编号|名称|规格|优先级|关联用例|
|-|-|-|-|-|
|FR-001|[Name]|[1 [spec 1，EARS description]<br>, 2 [spec 2]<br>, ...]|[P0/P1/P2]|UC-xxx|

### 非功能性需求 <!-- condition: Low=AsNeeded, Medium=AsNeeded, High=Generate -->

<!-- guideline: Supplement from availability, reliability, performance, serviceability, security, scalability, compatibility perspectives. Description should include quantifiable acceptance criteria, e.g. response time, availability rate, error rate, recovery time, etc. -->

<!-- constraint: UNSOURCED quantitative values must use the `[[PH:...]]` placeholder token. -->

<!-- Example: `[[PH:perf_p95 | rec:≤500ms | why:行业通用 Web P95 SLA 基线]]` -->

|编号|类别|名称|规格|优先级|
|-|-|-|-|-|
|NFR-001|[]|[]|[1 [spec 1，EARS description]<br>, 2 [spec 2]<br>, ...]|[]|
