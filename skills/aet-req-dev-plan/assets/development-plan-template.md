## §1 Project Overview

<!-- guideline: Project overview summarizes the plan metadata and the critical path. Source documents must reference exact paths/versions so reviewers can trace. -->

| Information | Content |
|------|------|
| **Project Name** | [To be filled] |
| **Input Sources** | Requirements Analysis Specification [Path/Version] + Requirements Design Specification [Path/Version] |
| **Plan Type** | [Feature Enhancement / New Feature Development / Refactoring] |
| **Estimated Effort** | [Low / Medium / High / XHigh] |
| **Parallel Execution** | [YES - N Waves / NO - Sequential Execution] |
| **Critical Path** | [Task X → Task Y → Task Z] |

## §2 Change Scope

<!-- guideline: Change scope must align with the requirements documentation. The module-change details MUST be a 1:1 mirror of the design spec's module-change table — do not re-decide fences here. -->

### 2.1 Initial Requirements

<!-- policy: Faithfully record the user's original requirements input as documented in the IR. Do NOT rephrase. -->

[To be filled]

### 2.2 Key Clarifications

<!-- policy: Record key decisions, questions, and answers from the requirements clarification and design process. These are the context the implementer needs to understand the plan's trade-offs. -->

[To be filled]

### 2.3 Module Change Details

<!-- rule: Status limited to: 🟢 New / 🟡 Modified / 🔴 Protected / ⚪ Not Involved -->
<!-- rule: Modules marked as "Protected" or "Not Involved" are forbidden to modify in tasks -->
<!-- rule: This table MUST match the design spec's module-change table exactly. If a discrepancy is found, the design wins — fix the plan. -->

| Status | Module | Change Description | Constraints |
|------|------|----------|------|
| [To be filled] | [To be filled] | [To be filled] | [To be filled] |

### 2.4 Functional Impact Details

<!-- rule: Change Type limited to: Add / Modify / Delete -->
<!-- rule: Each functional node must trace to a requirement ID (FR-xxx / NFR-xxx / SR-xxx / AR-xxx) -->

| Change Type | Functional Node | Change Point | Corresponding Requirement |
|----------|----------|--------|----------|
| [To be filled] | [To be filled] | [To be filled] | [To be filled] |

## §3 Technical Design

<!-- guideline: This section integrates relevant decisions from preceding deliverables. Mark as "N/A" if no related documentation exists. The plan MUST NOT re-make design decisions — it only references them so the implementer knows where to look. -->

### 3.1 Tech Stack

<!-- rule: Must include version numbers -->
<!-- example:
**Backend**: FastAPI 0.104.0, PostgreSQL 15
**Frontend**: React 18.2.0, Zustand 4.4.0
-->

[To be filled]

### 3.2 Core Decisions

<!-- rule: Each decision must include three elements: 「Decision」「Rationale」「Alternative Solutions」 -->
<!-- rule: Decisions here are implementation-path decisions (e.g., "use Redis for session cart" not architecture-level decisions which belong to design spec). -->

[To be filled]

### 3.3 Data Model

<!-- instruction: list only parts directly related to this feature. -->
<!-- rule: Must annotate relationships between entities (1:1, 1:N, N:N) -->
<!-- example:
**CartItem**
- `id`: UUID (PK)
- `user_id`: UUID (FK → User, 1:N)
- `product_id`: UUID (FK → Product, 1:N)
-->

[To be filled]

### 3.4 Interface Contracts

<!-- instruction: Reference API/CLI/UI contracts from contracts/ folder or design spec. Mark as "N/A" if no contract system exists. -->
<!-- example:
**POST /api/cart/items**
- Request: `{ product_id: string, quantity: number }`
- Response: `{ item_id: string, total_items: number }`
- Reference: `contracts/cart-api.yaml`
-->

[To be filled]

## §4 Task Breakdown

<!-- instruction: This section must be filled only after analyzing upstream document gaps. -->

### 4.1 Upstream Gap Analysis

<!-- instruction: Mandatory before task breakdown -->
<!-- rule: Must be filled, otherwise plan is invalid; mark each gap status: Resolved/Default Applied/Pending Decision -->

**Identified Gaps**:
- [Gap 1]: [Solution] (Status: [Resolved / Default Applied / Pending Decision])
- [Gap 2]: [Solution] (Status: [Resolved / Default Applied / Pending Decision])

### 4.2 Task Organization Strategy

<!-- instruction: Explain task grouping method and rationale, clarify MVP scope. -->
<!-- rule: Must explain the reason for choosing this organization method, and how to balance parallelism and dependency complexity -->

**Organization Method**: [Group by Requirement / Group by Architecture Module / Hybrid Strategy]

**Rationale**:
- [To be filled]

**MVP Scope**:
- **Phase 1 (MVP)**: [To be filled]
- **Phase 2-N (Incremental)**: [To be filled]

## §5 Execution Waves

<!-- instruction: Assign tasks to different waves, tasks within the same wave can be executed in parallel. -->
<!-- rule: Each wave should contain 3-8 tasks -->
<!-- rule: Must annotate preconditions and deliverables for each wave -->

```text
Phase 1: [Phase Name] (Wave 1)
Preconditions: [To be filled]
├── T001: [Task Name] [Complexity]
├── T002: [Task Name] [Complexity]
└── T003: [Task Name] [Complexity]
Deliverables: [To be filled]

Phase 2: [Phase Name] (Wave 2)
Preconditions: [To be filled]
├── T004: [Task Name] [Complexity]
├── T005: [Task Name] [Complexity]
└── T006: [Task Name] [Complexity]
Deliverables: [To be filled]

Phase FINAL: Quality Validation & Delivery (Wave N)
Preconditions: All functional Phases completed
├── F1: Plan Compliance Audit
├── F2: Code Quality Review
├── F3: Real Scenario Manual QA
└── F4: Scope Fidelity Check
Deliverables: Pass all acceptance criteria, awaiting user confirmation

Critical Path: [To be filled]
Maximum Concurrency: [To be filled]
```

<!-- example:
Critical Path: T001 → T002 → T006 → T014 → F1-F4
Maximum Concurrency: Phase 2 has 5 tasks
-->

## §6 Task List

<!-- instruction: Organize tasks by Phase, each task must follow a unified format. -->
<!-- rule: Task format `- [ ] TID [Story] Task description - File path` -->
<!-- rule: Every task MUST trace to a design AR — write the AR ID in the task description. -->

### Phase 1: [Phase Name]

**Core Objective**: [1-2 sentences of verifiable goals]

**Independent Validation Criteria**:
<!-- rule: Must be executable commands with assertable outputs -->
- [ ] `bun test src/...` → PASS
- [ ] `curl -X POST /api/xxx` → 200 + {"status":"ok"}

**Git Commit**:
- YES | NO
- Message: `type(scope): desc`

**Task List**:

---

- [ ] T001 [Task Description] - `[File Path]`

   - **AR**: AR.[SR number].<seq>
   - **Delegate Subagent**:
     + YES | NO
     + Subagent Type: [ explorer / researcher / coder / tester / reviewer / documenter ]
     + Effort: [ Low / Medium / High / XHigh ]
     + Parallelism: [ TIDs of other tasks it can parallel run with ]

   - **What to do**:
     <!-- instruction: Include what files to change, what functional modifications, implementation key points -->
     + [Specific steps]

   - **Must NOT do**:
     + [Prohibited operations]

   - **Parallelism Info**:
     + Can Parallel: [YES / NO]
     + Prerequisite Tasks: [Task ID]
     + Blocking Tasks: [Task ID]

   - **Reading List**:
     + Pattern: [File path:line number] - [Understand pattern to mimic]
     + API/Type: [File path] - [Understand reference response structure]
     + External: [URL] - [Understand library usage]
  
   - **Recommended Skills**: 
     + `[skill name]`: [Rationale]

   - **Acceptance Criteria**:
     + [ ] `<Command>` → [Expected Result]

   - **QA Scenario**:
   ```
   Scenario: [Scenario Name]
     Tool: [Tool Name]
     Preconditions: [Preconditions]
     Steps:
       1. [Operation Step]
       2. [Operation Step]
     Expected Result: [Expected Result]
     Evidence: .sisyphus/evidence/task-[ID]-[description].txt
   ```

---

<!-- instruction: Repeat above template until all tasks are covered -->

### Phase 2: [Phase Name]

[To be filled]

## §7 Phase FINAL: Quality Validation & Delivery

<!-- instruction: Fixed as F1-F4 four tasks to ensure delivery quality. -->

**Objective**: Ensure all features meet requirements, code quality is up to standard, system is deliverable.

**Validation Criteria**:
- [ ] All Requirement acceptance criteria passed
- [ ] Code quality check passed
- [ ] Real scenario manual testing passed
- [ ] User explicit approval for delivery

**Task List**:

---

- [ ] F1 Plan Compliance Audit

   - **Validation Content**:
     + Implementation satisfies all requirements
  
   - **Output Format**:
   ```
   Must Have [N/N Pass]
   Must NOT Have [N/N Pass]
   Requirement Coverage [N/N Requirements Implemented]
   Evidence Files [N/N Exist]
   VERDICT: APPROVE / REJECT
   ```
  
   - **Parallelism Info**:
     + Can Parallel: YES
     + Prerequisite Tasks: All functional Phases

---

- [ ] F2 Code Quality Review

   - **Validation Content**:
     + Code implementation quality
  
   - **Output Format**:
   ```
   Lint: PASS / FAIL
   Type Check: PASS / FAIL
   Tests: N pass / N fail
   Code Smells: N issues
   VERDICT: APPROVE / REJECT
   ```
  
   - **Parallelism Info**:
     + Can Parallel: YES
     + Prerequisite Tasks: All functional Phases

---

- [ ] F3 Real Scenario Manual QA

   - **Validation Content**:
     + Verify main success scenarios
     + Analyze all scenarios in test scenario table
     + Test boundary cases (empty input, oversized input, concurrency)
  
   - **Output Format**:
   ```
   Scenarios [N/N pass]
   Edge Cases [N tested]
   Integration [N/N pass]
   VERDICT: APPROVE / REJECT
   ```
  
   - **Parallelism Info**:
     + Can Parallel: YES
     + Prerequisite Tasks: All functional Phases

---

- [ ] F4 Scope Fidelity Check

   - **Validation Content**:
     + Check git diff for changes beyond requirements
     + Compare against module change details
     + Check for unauthorized module modifications (marked as "Protected" or "Not Involved")
     + Verify each task only modified files described in its description
  
   - **Output Format**:
   ```
   Authorized Changes [N/N files]
   Unauthorized Changes [N files - list paths]
   Scope Creep [CLEAN / N issues]
   VERDICT: APPROVE / REJECT
   ```
  
   - **Parallelism Info**:
     + Can Parallel: YES
     + Prerequisite Tasks: All functional Phases

## §8 Appendix

### 8.1 Development Strategies

<!-- instruction: Add as needed. -->

- **Delegate Tasks**: For task execution, MUST delegate to sub-agents, preventing the main Agent's context from becoming too large and causing performance issues.
- **Multi-Agent**: For maximum efficiency, ALWAYS identify all parallelizable tasks upfront and dispatch them simultaneously.
- **TDD**: Follow Test-Driven Development principles to implement each task, ensuring test cases are defined before writing implementation code.
- [Others]

### 8.2 Risk List

<!-- instruction: List risks specific to this plan's execution. -->

| Risk | Impact | Mitigation Measures |
|------|------|----------|
| [Technical/Dependency risk] | [High/Medium/Low] | [Measure] |

### 8.3 Coding Notes

<!-- instruction: Include code style, boundary conditions, permission control, exception paths, etc. -->

[Notes]

### [Others]

<!-- instruction: Add as needed -->
