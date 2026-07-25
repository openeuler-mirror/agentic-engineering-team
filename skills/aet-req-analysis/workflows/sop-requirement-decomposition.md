## SOP: Requirement Decomposition

<guideline>

### Requirements & Specifications

A single requirement maps to multiple specifications; do not split closely linked specifications into separate requirements. Aggregate requirements based on the following principles:

* **Unified Business Goal**: Belonging to the same core business closed-loop or component interaction channel (e.g., various payment methods all serve the unified goal of "Order Financial Settlement").
* **Identical Data Flow**: Sharing the same data source and destination, varying only in the processing of intermediate media types (e.g., sending images, videos, or files falls under the same data flow).
* **Inclusion of Branch & Exception Flows**: Performance constraints, retry mechanisms, degradation strategies, error handlings, and size limits specific to a function must be treated as specifications under that primary requirement.

### Specification Design

Based on identified user or system behaviors, analyze affected requirement specifications, paying special attention to blind spots.

- Traverse all behavior paths (main success, alternative/exception/failure).
- For each path, identify whether the following three types of specifications are affected:
  - **Functional requirements** (capabilities the system must provide to support the business goal)
  - **Non-functional requirements** (DFx: availability & reliability, performance, maintainability, etc.)
  - **Breaking changes** (if incompatible changes exist, they must be explicitly marked)

**Core Principle**: DO NOT just list the obvious requirement points. Success criterion = uncover as many **blind spots** as possible — situations the user did not explicitly mention but the system must handle, or details easily missed in a scenario.

### Complexity Assessment

|Dimension|Low|Medium|High|
|-|-|-|-|
|Code volume|<100 lines|100-500 lines|>500 lines|
|Non-functional constraints|Loose targets|Moderate targets|Stringent targets|
|Architectural change|Single module|Cross-module|Core/foundation modules|
|Codebase familiarity|Familiar stack|Moderate familiarity|Unfamiliar/niche stack|

</guideline>

<instruct>

### [A1] Traverse All Paths

Traverse all behavioral paths (happy, alternative, exception, failure) to derive their corresponding specifications. Aggregate related specifications into comprehensive Functional Requirements (FRs), ensuring each FR encapsulates multiple specifications rather than fragmenting them.

> **Q1**: "预估实现需求难度为：[Low (simplified execution, review, deliverables) / Medium (balanced execution, deliverables, and review) / High (more effort to ensure thorough design)]，是否需要修改？"
>
> **Q2**: "挖掘到的功能性需求："
> "[FR-001 名称 - 规格1: [EARS]; 规格2: [EARS]; ...(按排序仅列出≤3个关键规格)]"
> "[FR-002 ...]"
> "是否有遗漏？"
>
> **Q3** (Effort=Low & NO DFx impact, Skip): "挖掘到的非功能性需求为：[Availability & Reliability: 1, 2, ...; Performance: 3, 4, ...; ...]"
> "是否合理或有遗漏？"

**Completion criterion: Functional requirements, non-functional requirements, and breaking changes are identified; complexity is assessed; and user confirmation is secured.**

</instruct>

<constraint>

- DO NOT split multiple specifications into separate requirements—aggregate them under a unified requirement according to abstraction principles.

</constraint>

