---
heading_level: 2
checklist: |

  **场景分析**

  1. 场景划分粒度 (WARNING)
     - 以业务目标划分，不按代码模块/API端点划分
     - 场景数量适中（通常1个场景关联用例不超过3个，注意分解粒度）

  2. 场景命名规范 (INFO)
     - 动宾结构表达业务意图（"创建订单"、"用户登录"、"库存盘点"）
     - 名称不泄露实现（不出现 Controller、Service、Table、Queue、框架名）

  **用例分析**

  1. 用例图规范性 (WARNING)
     - 参与者与用例命名与场景分析表保持一致

  2. 场景关联性 (ERROR)
     - 每一个场景必须有关联用例（场景-用例映射完整，无孤立场景）

  3. 主成功路径完整性 (ERROR)
     - 基本事件覆盖核心操作流程：触发 → 操作 → 系统响应 → 结果生成 → 目标完成
     - 用户与系统的交互清晰
     - 步骤有序、可追踪

  4. 扩展/备选/异常路径 (WARNING)
     - Effort=Medium/High 时必查；Effort=Low 可豁免
     - 备选路径：不同条件下的分支行为（如 VIP 折扣）已识别
     - 异常路径：外部依赖失败、非法输入、并发冲突、资源受限、动态资源变更、操作中途失败、越权实体等已覆盖
     - 用户易忽略的潜在场景已挖掘

  5. 用例描述规范性 (INFO)
     - 触发条件必须系统可检测
     - 扩展/备选/异常事件格式清晰（编号 + 类型 + 描述）

---

## 场景分析

<!-- policy: Extract scenarios from the business perspective — describe what an actor does to achieve a business goal. One scenario equals one business goal, NOT one API endpoint or code module: group endpoints serving the same user goal into a single scenario; conversely one module may yield several distinct scenarios. -->

<!-- guideline: Name scenarios in verb-object form expressing business intent ("创建订单", "库存盘点", "月度账单生成"). Keep all scenario names in one consistent language matching the business domain. State the business goal and trigger in the description. -->

<!-- guideline: Drop purely technical/internal operations (migrations, log rotation, health checks) unless they are a real business operation. Classify each scenario by business category — 业务 (core business operations), 操作 (daily operational tasks), 维护 (maintenance/admin). -->

<!-- guideline: Align granularity when creating new scenarios. Keep sibling scenarios at roughly the same abstraction level: if one sibling is "管理用户" and another is "重置某用户的密码", flatten or regroup them. -->

<!-- patch: Usually no more than 3 per scenario; mind the decomposition granularity. -->

|编号|类别|名称|是否新增|
|-|-|-|
|SC-001|[业务/操作/维护]|[Verb + Object, describes the scenario goal]|[Leave blank if no scenario library exists]|

## 用例分析

<!-- guideline: Draw ONE use case diagram (no more than the number of scenarios) covering the principal actors and the architecturally significant use cases — those carrying core business goals, sensitive/privileged operations, or key include/extend relationships. Do NOT diagram every use case; the table below is the exhaustive list. Use standard UML use case notation via mermaid. Keep actor names and use-case names consistent with the 场景分析 list above. -->

```mermaid
graph LR
    classDef actor fill:#e1f5fe,stroke:#03a9f4;
    classDef uc fill:#fff3e0,stroke:#ff9800;

    %% Actors
    User((普通用户)):::actor
    Admin((管理员)):::actor

    %% System Boundary and Use Cases
    subgraph 系统边界
        UC1(核心功能A):::uc
        UC2(核心功能B):::uc
        UC3(敏感操作):::uc
        UC4(附加操作):::uc
        UC5(身份验证):::uc

        %% Include and Extend Relationships
        UC3 -.->|include| UC5
        UC4 -.->|extend| UC2
    end

    %% Associations
    User --> UC1
    User --> UC2
    User --> UC3
    Admin --> UC3
```

<!-- instruction: When designing error and exception paths, examine these commonly overlooked scenarios: external dependency failures (network timeout, service unavailable), invalid inputs (out-of-range, malformed), concurrency conflicts (simultaneous data modification), resource exhaustion (file size exceeded, connection pool depletion), dynamic resource changes (hot-plug, online/offline), task/data migration to new locations, mid-operation failures (network/server errors), extreme-scale inputs beyond NFR-defined norms, and privilege-exempt entities that bypass regular constraints (e.g., RT tasks, kernel threads). -->

<!-- patch: Every scenario must have associated use cases. -->

|编号|名称|Actor|触发|基本事件|扩展/备选/异常事件|关联场景|
|-|-|-|-|-|-|-|
|UC-001|[Verb + Noun, describes the actor's goal]|[All executors]|[Must be system-detectable]| [Main success path: a series of actions to achieve the actor's goal, indicating the services provided by the system. e.g. 1 [Step 1]<br>2 [Step 2]<br>...]|[1【扩展/备选/异常】[Description], 2 [...], ...]|SC-xxx|
