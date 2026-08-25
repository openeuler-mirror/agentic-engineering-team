<!-- policy: Include only items actually affected or newly added for each table. Omit unaffected items completely; do not generate empty rows. -->
<!-- policy: All justification must be strictly derived from the functional design specification and the failure mode library. Unsubstantiated speculation is strictly prohibited. -->
<!-- guideline: Justifications must reference specific change points in the functional design specification and exact fields in the failure mode library. Avoid vague or generic statements. -->
<!-- guideline: Under the same failure mode, if only a subset of cause/effect/improvement is relevant, fill in only the affected items. -->

## 可靠性分析

### 功能1：[功能名称]

<!-- instruct: Generate a level-3 header (###) for each affected feature, numbered sequentially. Use the exact feature name from the functional impact analysis. -->
<!-- instruct: If a new failure mode is introduced, append "(New)" to its title. e.g., `#### 故障模式1：内存不足（新增）` -->

#### 故障模式1：[故障模式名称]

<!-- instruct: Generate a level-4 header (####) for each relevant failure mode. List only failure modes that are directly relevant to this feature. -->
**故障模式名称**：[故障模式 name，分类目录完整路径，如"硬件/CPU/XXX故障"]
**故障模式描述**：[逐字复制 description 字段；无则填"（无）"]
**判断理由**：[准确、详细的判断依据。必须指向功能设计说明的具体变化点与故障模式库的具体字段]

**现有故障原因**：

<!-- instruct: Include only affected or newly added items. -->
<!-- example: If this failure mode originally contains causes A, B, and C, but this feature only affects A and introduces a new cause D, include ONLY A and D. -->

|故障对象|故障行为|新增|
|-|-|-|
|[]|[Behavior: Must be generic; do not describe details specific only to this feature or specific architecture elements]|[是/否]|

**现有故障影响**：

|影响对象|影响描述|新增|
|-|-|-|
|[]|[Effect: Must be generic; do not describe details specific only to this feature or specific architecture elements]|[是/否]|

**现有改进措施**：

|措施类型|措施内容|新增 |
|-|-|-|
|[检测措施/隔离措施/恢复措施]|[Measure: Must be generic; do not describe details specific only to this feature or specific architecture elements]|[是/否]|

#### 故障模式2：[故障模式名称]

<!-- instruct: Proceed with the next relevant failure mode using the same structure as Failure Mode 1. -->
### 功能2：[功能名称]

<!-- instruct: Proceed with the next affected feature using the same structure as Feature 1. -->