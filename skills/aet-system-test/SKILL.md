---
name: aet-system-test
description: ST System Test Verification - 需求/设计开发完成后，通过多层测试策略对实现成果进行系统级功能验证，检查实现是否覆盖需求、通过接口测试、满足设计要求（plan compliance + scope fidelity）
---

## ⛔ Execution Mandate（强制执行声明）

**当用户触发此skill时，你必须按以下顺序执行，不可跳过任何阶段：**

1. 先执行 Phase 1，输出文档清单
2. 执行 Phase 2，生成 test-cases.yaml 和测试代码文件
3. 执行 Phase 3，**真实执行 curl 命令**（至少3条）和测试框架命令
4. 执行 Phase 4，**标注每条失败需求的根因分类码**
5. 执行 Phase 5，生成完整的6部分报告

**如果你没有执行 curl 命令，就不能说"已验证"。如果你没有标注根因分类码，就不能生成最终报告。**

---

## Purpose

在 /aet-implement 完成需求实现之后，执行系统级（System Test, ST）功能验证。
验证的核心目标不是跑多少用例，而是诚实回答一个问题：

> **实现是否真正满足用户原始需求？**

**The Iron Law of ST Verification**

- No completion claims without fresh ST execution evidence
- 任何 "100% 通过" / "功能完整" 的声明之前，必须真实跑过测试命令
- 报告失败 + 定位根因，远好于 编造通过 + 丧失信任

---

✅ **Use when:**

- Implement agent 刚完成代码编写，需要验证功能正确性
- **用户手动用自然语言发起独立 ST 系统测试**（例：「做一下 ST 验证，需求和实现代码都在项目里」，模型直接读取 Skill 内容执行）
- 代码评审 / PR 提交 / 合并前 / 里程碑交付节点，对当前实现做运行态功能验证，作为静态代码审查的补充
- 需要生成可追溯的 ST 测试报告（含覆盖率 / 通过率 / 未通过项 / 需求满足度结论）

❌ **Do NOT use when:**

- 还在设计阶段（还没有实现代码）
- 仅需要静态代码审查（用 aet-checking-implementation 或 aet-checking-bad-smell）
- 仅需要单元测试生成（用 aet-generating-test-case）
- 修复 bug 过程中的快速验证（用 aet-diagnosing-bug）

---

## Core Verification Methodology

系统级验证按以下 5 个阶段执行，**不可跳过任何阶段**。每个阶段结束后必须输出对应产物，否则视为该阶段未完成。

---

### Phase 1: Input Context Loading（输入上下文加载）

读取验证所需的全部输入材料。**没有上下文就不能宣称通过**。

按以下顺序自动加载（优先读取 AET 系统自动产出的文档），缺失则按降级规则 AI 自动处理，不依赖用户手动传 $1 / $2 位置参数：

1. **AET 设计文档（优先加载）**：AET 设计阶段自动产出的设计文档。查找项目目录下 `design.md`、`design-plan.md`、`architecture.md`、`system-design.md`，或 AET 产物目录 `.aet/design/`、`.opencode/design/`
2. **AET 开发计划 / 实现文档（其次加载）**：AET 实现阶段产出的实现计划、模块划分、接口设计文档。查找 `implementation-plan.md`、`dev-plan.md`、`impl-spec.md`，或 `.aet/implement/`、`.opencode/implement/`
3. **接口契约**：查找 `contract.yaml`、`openapi.yaml`、`api.yaml`、`docs/api/`（找不到则从实现代码自动推断接口结构，不中止）
4. **需求描述（兜底）**：查找 `RAS.md`、`requirements.md`、`req.md`，或从对话上下文加载用户原始需求
5. **实现代码定位**：
   - HTTP API 实现：扫描 `controllers/`、`routes/`、`api/`、`handlers/`、`services/`、`src/app/api/` 下的接口入口
   - 模块接口：扫描导出的 public 函数签名（`export` / `module.exports` / `def`）
6. **测试环境检查**：
   - 检查服务是否可启动（有 `main.py`/`app.py`/`server.js`/`package.json scripts`）
   - 本地端口占用检测（默认 8000/5000/3000）
   - 检查测试框架：`pytest`/`unittest`（Python）、`node:test`/`jest`/`mocha`（Node.js）、`go test`（Go）、`JUnit`（Java）

**Phase 1 Checkpoint（必须逐项确认）：**
- [ ] 已输出已加载文档清单
- [ ] 已输出需求条目清单
- [ ] 已输出实现代码入口
- [ ] 已输出测试环境信息

**Phase 1 必须输出以下内容（在对话中展示）：**

```markdown
## Phase 1: Input Context Loading

### 已加载文档
| 文档类型 | 文件路径 | 状态 |
|---------|---------|------|
| 需求文档 | RAS.md | ✅ 已加载 / ⚠️ 降级处理 |
| 设计文档 | design.md | ✅ / ❌ 不存在，从代码推断 |
| 实现计划 | dev-plan.md | ✅ / ❌ 不存在，从代码推断 |
| 接口契约 | contract.yaml | ✅ / ❌ 不存在，从代码推断 |

### 需求条目清单
| 需求 ID | 需求标题 | 验收点 | 关联接口 |
|--------|---------|--------|---------|
| R-001 | xxx | N 条 | POST /api/xxx |
| ... | ... | ... | ... |

### 实现代码入口
| 接口 | 文件路径 | 行号 | 方法 |
|------|---------|------|------|
| POST /api/xxx | src/routes/xxx.ts | L42 | handleCreate() |

### 测试环境
- 服务启动命令：`python app.py` / `npm run dev`
- 测试框架：node:test
- 端口：3000（空闲）
```

---

### Phase 2: Multi-Layer Test Case Generation（多层测试用例生成）

**你必须在此阶段生成两类产物：① 结构化用例集（YAML）② 可执行测试代码。**

#### 2.1 用例生成策略

根据 Phase 1 加载的输入材料，用三层策略自动生成测试用例：

| 层级 | 驱动方式 | 生成规则 | 覆盖率目标 |
|------|---------|---------|-----------|
| **L1 参数驱动** | 接口契约 schema（字段类型、必填、范围、枚举） | 正常值 + 边界值（min/max/0/空/超长/非法类型）+ 枚举全覆盖 | 每个参数字段 ≥ 5 条用例 |
| **L2 需求驱动** | 需求文档条目逐条映射 | 每条需求条目至少 1 条正常路径 + 1 条验收条件相关用例 | 需求条目覆盖率 100% |
| **L3 副作用驱动** | 实现代码控制流 + 常见系统风险 | 鉴权绕过、并发竞态、资源耗尽、幂等、异常恢复、跨接口顺序依赖 | 每个写接口（POST/PUT/DELETE）≥ 3 条异常场景 |

#### 2.2 生成可执行测试代码

**你必须根据项目语言和测试框架，生成可直接运行的测试代码文件，写入项目既有测试目录。**

- **自动识别项目测试目录**：Python → `tests/`，Node.js → `test/` 或 `__tests__/`，Go → 同包 `*_test.go`，Java → `src/test/java/`
- **在测试目录下按 feature 创建子目录**：如 `test/st-verification/` 或 `tests/st/test_xxx.py`
- **每条用例对应至少一个测试函数**，函数命名包含用例 ID 以便追溯（如 `test_R001_search_normal`）
- **代码必须可直接运行**，无需手工改写
- **与项目现有测试代码保持一致的组织风格**

#### 2.3 生成结构化用例集

**你必须生成 YAML 格式的用例集文件，写入项目目录：**

```yaml
# 写入路径：ai_assistance/features/{feature-name}/implementation/ST/test-cases.yaml
# 如果目录不存在则创建

feature: "trace-filters"
generated_at: "2026-08-28T10:00:00"
total_cases: 25

test_cases:
  - id: "TC-R001-L1-001"
    requirement_id: "R-001"
    layer: "L1"
    coverage_type: "正常路径"
    interface: "GET /api/experiments/traces?search=abc"
    input:
      method: "GET"
      path: "/api/experiments/traces"
      query:
        search: "abc"
    expected:
      status: 200
      body_schema:
        type: "array"
      side_effects: []
    priority: "P0"

  - id: "TC-R001-L1-002"
    requirement_id: "R-001"
    layer: "L1"
    coverage_type: "边界条件"
    interface: "GET /api/experiments/traces?search="
    input:
      method: "GET"
      path: "/api/experiments/traces"
      query:
        search: ""
    expected:
      status: 200
      body_schema:
        type: "array"
      side_effects: []
    priority: "P1"
  # ... 更多用例
```

**Phase 2 Checkpoint（必须逐项确认）：**
- [ ] 已生成 test-cases.yaml 并写入 ST 目录
- [ ] 已生成可执行测试代码并写入项目测试目录
- [ ] 已输出用例统计表
- [ ] 已输出需求覆盖率检查表
- [ ] 已输出双向追溯矩阵

**Phase 2 必须输出以下内容：**

```markdown
## Phase 2: Multi-Layer Test Case Generation

### 用例统计
| 层级 | 用例数 | 覆盖类型分布 |
|------|--------|-------------|
| L1 参数驱动 | N | 正常路径:N / 边界条件:N / 异常输入:N |
| L2 需求驱动 | N | 正常路径:N / 需求验收点:N |
| L3 副作用驱动 | N | 异常场景:N |
| **合计** | **N** | |

### 需求覆盖率检查
| 需求 ID | 关联用例数 | 覆盖状态 |
|--------|----------|---------|
| R-001 | 5 | ✅ 覆盖 |
| R-002 | 3 | ✅ 覆盖 |
| ... | ... | ... |

### 双向追溯矩阵（需求 ↔ 用例）
| 需求 ID | 用例 ID 列表 | 接口 | 层级 |
|--------|-------------|------|------|
| R-001 | TC-R001-L1-001, TC-R001-L1-002, TC-R001-L2-001 | GET /api/experiments/traces | L1+L2 |
| ... | ... | ... | ... |

### 已生成的文件
- 用例集：`ai_assistance/features/trace-filters/implementation/ST/test-cases.yaml`
- 测试代码：`test/st-verification/trace-filters.test.ts`
```

---

### Phase 3: Dual-Engine Test Execution（双引擎测试执行）

> ⛔ **BLOCKER 规则**：如果你在本阶段没有发送任何 `curl` 命令（HTTP 引擎）且没有运行任何测试框架命令（模块引擎），则 Phase 3 视为**未完成**，禁止进入 Phase 4。仅靠读代码得出的结论不算 ST 验证，算静态分析。

**你必须真实执行测试，不能只做静态代码分析。两种引擎全部执行，全部通过才算该接口通过。**

#### 3.1 执行前准备（必须真实执行，不能跳过）

**Step 1：启动被测服务**

根据 Phase 1 识别的启动命令，后台启动服务：

```bash
# Python 项目
python app.py &
sleep 3

# Node.js 项目
npm run dev &
sleep 5

# 确认端口可用（必须执行）
curl -s -o /dev/null -w "HTTP_STATUS:%{http_code}" http://127.0.0.1:PORT/health 2>/dev/null || echo "PORT_REACHABLE: checking..."
```

如果服务启动失败，如实报告「环境阻塞」并说明原因，不要跳过 HTTP 测试。

**Step 2：确认测试可运行**

```bash
# Python
pytest --co tests/st/ -q 2>&1 | tail -5

# Node.js
npx tsx --test test/st-verification/*.test.ts --dry-run 2>&1 | tail -5
```

#### 3.2 HTTP 接口引擎执行（必须真实发 curl 请求）

> ⛔ **BLOCKER 规则**：HTTP 接口引擎必须至少发送 3 条 curl 请求。如果一条 curl 都没发，Phase 3 的 HTTP 引擎部分视为未完成。

**对每条 HTTP 用例，使用 curl 真实发送 HTTP 请求到服务端口。你必须执行以下命令并记录输出：**

```bash
# 正常用例 - 验证接口基本可用
curl -s -w "\n---\nHTTP_STATUS:%{http_code}\nRESPONSE_TIME:%{time_total}s\n" \
  http://127.0.0.1:PORT/api/experiments/traces?search=abc

# 边界用例 - 空搜索词
curl -s -w "\n---\nHTTP_STATUS:%{http_code}\nRESPONSE_TIME:%{time_total}s\n" \
  http://127.0.0.1:PORT/api/experiments/traces?search=

# 时间筛选用例
curl -s -w "\n---\nHTTP_STATUS:%{http_code}\nRESPONSE_TIME:%{time_total}s\n" \
  "http://127.0.0.1:PORT/api/experiments/traces?from=2026-01-01&to=2026-08-28"

# 标签筛选用例
curl -s -w "\n---\nHTTP_STATUS:%{http_code}\nRESPONSE_TIME:%{time_total}s\n" \
  "http://127.0.0.1:PORT/api/experiments/traces?tagIds=1,2"

# 异常用例 - 非法参数
curl -s -w "\n---\nHTTP_STATUS:%{http_code}\nRESPONSE_TIME:%{time_total}s\n" \
  -X POST http://127.0.0.1:PORT/api/experiments/traces \
  -H "Content-Type: application/json" -d '{"invalid":true}'
```

**你必须记录每条 curl 的实际输出**，包括：
- HTTP 状态码（200/400/404/500 等）
- 响应体内容（JSON 结构、字段）
- 响应时间

**校验维度（逐条对比）：**
- 状态码：预期 200 vs 实际 ?（符 → PASS，不符 → E-STATUS）
- 响应体结构：预期有 `data` 数组 vs 实际有 ?（不符 → E-SCHEMA）
- 响应体内容：预期返回筛选后数据 vs 实际返回 ?（不符 → E-DATA）
- 副作用：预期数据库/文件状态变更 vs 实际 ?（不符 → E-SIDE）

#### 3.3 模块函数引擎执行

**对每条模块用例，运行生成的测试代码：**

```bash
# Python
pytest tests/st/ -v --tb=short 2>&1

# Node.js
npx tsx --test test/st-verification/*.test.ts 2>&1

# Go
go test ./... -run "ST_" -v 2>&1
```

**校验维度：**
- 返回值类型与内容
- 异常抛出是否符合预期
- 无外部依赖污染

#### 3.4 失败分类

| 分类码 | 含义 |
|--------|------|
| `E-SCHEMA` | 响应体不符合接口契约 schema |
| `E-STATUS` | HTTP 状态码不符合预期 |
| `E-DATA` | 返回内容业务逻辑错误 |
| `E-SIDE` | 副作用未触发 / 污染数据 |
| `E-CRASH` | 服务崩溃 / 500 / 未捕获异常 |
| `E-TIMEOUT` | 用例超时（默认阈值 30s） |

**Phase 3 Checkpoint（必须逐项确认）：**
- [ ] 已启动被测服务（或报告环境阻塞原因）
- [ ] 已执行至少3条 curl 命令并记录输出
- [ ] 已执行测试框架命令并记录输出
- [ ] 已输出 HTTP 接口引擎结果表
- [ ] 已输出模块函数引擎结果表
- [ ] 已输出执行汇总表

**Phase 3 必须输出以下内容：**

```markdown
## Phase 3: Dual-Engine Test Execution

### 执行环境
- 服务启动命令：`npm run dev`（端口 3000）
- 测试运行命令：`npx tsx --test test/st-verification/*.test.ts`
- 执行时间：2026-08-28 10:05:00

### HTTP 接口引擎结果
| 用例 ID | 接口 | 预期状态 | 实际状态 | 结果 | 失败码 |
|--------|------|---------|---------|------|--------|
| TC-R001-L1-001 | GET /api/traces?search=abc | 200 | 200 | ✅ PASS | - |
| TC-R001-L1-002 | GET /api/traces?search= | 200 | 404 | ❌ FAIL | E-STATUS |
| ... | ... | ... | ... | ... | ... |

### 模块函数引擎结果
| 用例 ID | 测试函数 | 结果 | 耗时 | 错误信息 |
|--------|---------|------|------|---------|
| TC-R001-L2-001 | test_R001_search_normal | ✅ PASS | 12ms | - |
| TC-R001-L2-002 | test_R001_search_empty | ❌ FAIL | 8ms | AssertionError: expected 200 got 404 |
| ... | ... | ... | ... | ... |

### 执行汇总
| 引擎 | 总数 | 通过 | 失败 | 通过率 |
|------|------|------|------|--------|
| HTTP 接口引擎 | N | N | N | N% |
| 模块函数引擎 | N | N | N | N% |
| **合计** | **N** | **N** | **N** | **N%** |
```

---

### Phase 4: Requirement Satisfaction Evaluation（需求满足度评估）

对照 Phase 1 加载的需求条目和 Phase 3 的执行结果，逐条打分。

> ⛔ **BLOCKER 规则**：如果报告中有任何 ❌ FAIL 或 ⚠️ PARTIAL 的需求，但**没有标注 CA-CONTRACT / CA-IMPL / CA-REQ 根因分类码**，则 Phase 4 视为**未完成**，禁止生成最终报告。

#### 4.1 满足度判定规则

| 判定 | 条件 | 在报告中标记 |
|------|------|------------|
| **完全满足** | 所有关联测试用例通过 + 无 E-CRASH/E-SIDE 严重错误 | ✅ PASS |
| **部分满足** | 关联用例通过率 ≥ 60% 且 < 100%，无严重错误 | ⚠️ PARTIAL |
| **不满足** | 关联用例通过率 < 60% 或 存在严重错误 | ❌ FAIL |

#### 4.2 缺陷根因归因（必须执行，不可跳过）

**对每条 ❌ 或 ⚠️ 的需求，你必须标注根因分类码。判定方法如下：**

**根因分类决策树（按顺序判断）：**

```
失败用例
│
├─ 接口路径/HTTP方法/参数名 与需求/契约定义不一致？
│  ├─ 是 → CA-CONTRACT（接口契约偏移）
│  │      例：需求要求 GET /api/traces?search=xxx，但代码里接口路径是 /api/v2/traces
│  │      例：需求要求接受 from/to 参数，但 API 根本不解析这两个参数
│  │
│  └─ 否 ↓
│
├─ 接口存在且参数正确，但返回结果/行为不正确？
│  ├─ 是 → CA-IMPL（实现缺陷）
│  │      例：API 接受 search 参数，但搜索结果不正确（大小写敏感，违反需求）
│  │      例：API 接受 from/to，但时间过滤逻辑有 bug，边界值处理错误
│  │
│  └─ 否 ↓
│
├─ 需求描述本身有歧义或缺失，无法判定预期行为？
│  ├─ 是 → CA-REQ（需求模糊）
│  │      例：需求说"支持标签筛选"但没说清楚是 AND 还是 OR 逻辑
│  │      例：需求说"跨步骤保持"但没定义哪些步骤、保持多久
│  │
│  └─ 功能完全未实现（代码中不存在该功能）？
│     └─ CA-IMPL（实现缺陷 - 功能缺失）
│        例：需求要求 search 参数，API 代码中完全没有 search 相关逻辑
```

| 根因类型 | 分类码 | 含义 | 判定依据 | 典型场景 |
|---------|--------|------|---------|---------|
| 接口契约偏移 | `CA-CONTRACT` | 需求与实现对接口定义理解不一致 | 接口路径/方法/参数名与需求定义不符 | 需求要求 ?search=，API 不接受此参数 |
| 实现缺陷 | `CA-IMPL` | 实现未达契约要求 | 接口存在但行为不正确，或功能完全缺失 | API 接受参数但逻辑错误；功能未实现 |
| 需求模糊 | `CA-REQ` | 需求定义本身存在歧义或缺失 | 无法明确判定预期行为 | 需求描述不清晰，无法确定正确预期 |

**根因标注示例（你必须像这样标注每条失败/部分通过的需求）：**

| 需求 | 状态 | 根因码 | 根因描述 | 定位 |
|------|------|--------|---------|------|
| R-001 模糊搜索 | ❌ FAIL | `CA-IMPL` | API 未实现 search 参数解析，功能完全缺失 | route.ts:L43-69 |
| R-002 时间筛选 | ❌ FAIL | `CA-IMPL` | API 未实现 from/to 参数解析，功能完全缺失 | route.ts:L43-69 |
| R-003 标签筛选 | ⚠️ PARTIAL | `CA-IMPL` | 函数已存在但未被 API 集成，调用链断裂 | route.ts:L43, trace-tag-filters.ts:L12 |
| R-007 跨页全选 | ⚠️ PARTIAL | `CA-REQ` | 需求未明确"选择全部"在筛选后应取筛选 total 还是全量 total | RAS.md R-007 |
| R-008 API 扩展 | ❌ FAIL | `CA-CONTRACT` | 需求要求接受 search/from/to/tagIds 参数，API 仅接受 user/agent/page/pageSize，接口契约不一致 | route.ts:L43-69 |

**Phase 4 Checkpoint（必须逐项确认）：**
- [ ] 已输出需求满足度逐条评估表
- [ ] 已对每条 ❌/⚠️ 需求标注根因分类码
- [ ] 已输出根因分布统计表

**Phase 4 必须输出以下内容：**

```markdown
## Phase 4: Requirement Satisfaction Evaluation

### 需求满足度逐条评估
| 需求 ID | 需求标题 | 关联用例数 | 通过数 | 通过率 | 判定 | 严重错误 | 根因码 | 备注 |
|--------|---------|-----------|--------|--------|------|---------|--------|------|
| R-001 | 模糊搜索 | 5 | 0 | 0% | ❌ FAIL | 0 | CA-IMPL | search 参数未实现 |
| R-002 | 时间筛选 | 3 | 0 | 0% | ❌ FAIL | 0 | CA-IMPL | from/to 参数缺失 |
| R-005 | 已选常驻 | 4 | 3 | 75% | ⚠️ PARTIAL | 0 | CA-IMPL | 缺少折叠功能 |
| R-010 | 不回归 | 3 | 3 | 100% | ✅ PASS | 0 | - | 现有功能正常 |
| ... | ... | ... | ... | ... | ... | ... | ... | ... |

### 汇总
- 完全满足：N 条（N%）
- 部分满足：N 条（N%）
- 不满足：N 条（N%）

### 根因分布统计
| 根因类型 | 数量 | 占比 |
|---------|------|------|
| CA-CONTRACT（接口契约偏移） | N | N% |
| CA-IMPL（实现缺陷） | N | N% |
| CA-REQ（需求模糊） | N | N% |
```

---

### Phase 5: Final Report Generation（最终报告生成）

**你必须生成结构化 Markdown 报告并写入文件，必须包含以下 6 个部分，缺一不可：**

**报告写入路径：`ai_assistance/features/{feature-name}/implementation/ST/ST-REPORT.md`**
**执行结果写入路径：`ai_assistance/features/{feature-name}/implementation/ST/execution-results.yaml`**

#### 报告模板

```markdown
# ST 系统级测试验证报告

## ① 测试概览
- 执行时间：2026-08-28 10:00:00 ~ 10:15:00（总耗时 15 分钟）
- 需求条数：10 条（R-001 ~ R-010）
- 接口数：3 个（GET /api/traces, POST /api/traces, GET /api/traces/:id）
- 测试用例总数：25 条（L1: 10, L2: 10, L3: 5）
- 测试框架：node:test
- 服务版本：commit a1b2c3d

## ② 总体结果
| 指标 | 数值 |
|------|------|
| 用例通过率 | 40%（10/25） |
| 接口通过率 | 33%（1/3） |
| 需求完全满足率 | 10%（1/10） |
| 严重错误数 | 0 |
| 总体结论 | ❌ 未通过 |

## ③ 需求满足度逐条评估
| 需求 ID | 需求标题 | 判定 | 关联用例 | 通过率 | 根因码 | 备注 |
|--------|---------|------|---------|--------|--------|------|
| R-001 | 模糊搜索 | ❌ FAIL | TC-R001-* | 0% | CA-IMPL | search 参数未实现 |
| R-005 | 已选常驻 | ⚠️ PARTIAL | TC-R005-* | 75% | CA-IMPL | 缺少折叠功能 |
| R-010 | 不回归 | ✅ PASS | TC-R010-* | 100% | - | 现有功能正常 |

## ④ 失败用例明细 + 根因归因
| 用例 ID | 失败码 | 根因类型 | 根因描述 | 定位 | 修复建议 |
|--------|--------|---------|---------|------|---------|
| TC-R001-L1-001 | E-STATUS | CA-IMPL | search 参数未实现，返回 404 | route.ts:L43 | 添加 search 参数解析 |
| TC-R002-L1-001 | E-STATUS | CA-IMPL | from/to 参数缺失，返回 404 | route.ts:L45 | 添加时间筛选逻辑 |

## ⑤ 双向追溯矩阵
| 需求 ID | 用例 ID 列表 | 关联接口 | 层级 | 结果 |
|--------|-------------|---------|------|------|
| R-001 | TC-R001-L1-001~005, TC-R001-L2-001~002 | GET /api/traces | L1+L2 | 0% FAIL |
| R-010 | TC-R010-L2-001~003 | GET/POST /api/traces | L2 | 100% PASS |

## ⑥ 后续操作建议
- 未通过需求（R-001~R-009）：建议回到 /aet-implement 阶段修复
- 部分通过需求（R-005~R-007）：修复缺失子功能后重跑 ST 验证
- 已通过需求（R-010）：可提交 PR
- 整体结论：❌ 未通过，不建议提交 PR，需先完成核心筛选功能实现
```

**Phase 5 Checkpoint（必须逐项确认）：**
- [ ] 已生成包含6部分的完整报告
- [ ] 已写入 ST/ST-REPORT.md
- [ ] 已写入 ST/execution-results.yaml
- [ ] 报告中每个「通过」结论都能追溯到具体命令输出

---

## The Iron Law（再次强调）

**任何情况下都必须遵守**：

1. **没有跑测试，禁止宣称通过**。哪怕只有 1 条用例没执行，也要如实写「未验证」
2. 测试失败就写失败 + 归因，**不许把失败改成通过**，不许跳过失败用例
3. 每个「通过」结论必须能追溯到具体的命令输出（HTTP 响应、函数返回值），不能凭空说
4. 如果测试环境搭不起来、服务起不来，**如实报告阻塞原因**，不要编造结果
5. 如果用户说「不用测了直接过」，礼貌但坚定地说明：这是 ST skill 的铁律，不执行验证无法给出通过结论
6. **必须发 curl 请求测试 HTTP 接口**。仅靠读代码判定接口行为不算 ST 验证。如果服务能启动，必须发 curl；如果服务起不来，必须报告阻塞原因
7. **必须对每条 ❌/⚠️ 需求标注根因分类码**（CA-CONTRACT / CA-IMPL / CA-REQ）。没有根因标注的报告视为未完成

---

## Common Failure Scenarios（高频错误提示）

| 情况 | 正确做法 | 错误做法 |
|------|---------|---------|
| 服务启动报依赖缺失 | 报告：「环境阻塞：缺少 X 依赖，建议先 pip install / npm install」 | 跳过该接口测试，宣称全部通过 |
| 接口契约和代码不一致 | 报告：「接口契约偏移：契约定义 /api/users，代码实际 /api/v1/user」 | 按代码实际路径测，不报告偏移 |
| 数据库没初始化导致用例全挂 | 报告：「环境阻塞：数据库 schema 未初始化，请先执行 migration」 | 删掉这些用例不算失败 |
| L3 异常场景有几条超时 | 报告：「超时失败 N 条，归类 E-TIMEOUT，建议补充超时保护」 | 降低超时阈值到通过为止 |
| 只给了需求没给契约 | 不中止：从实现代码的 handler 签名 / 路由定义自动推断接口结构生成临时 schema，按 L2 + L3 完整执行；L1 如无法推断则标记跳过，报告中标记 WARN: CONTRACT-INFERRED | 中止请求用户传参，打断流程 |
| 代码回退到实现前状态 | 如实报告所有需求未实现，不做静态代码分析替代运行态测试 | 跳过测试执行，仅靠读代码判定 |
| 模型只读代码不发 curl | 必须启动服务并发 curl 请求，即使预期接口不存在也要发请求验证返回 404/500 | 跳过 HTTP 测试，仅靠读 route.ts 代码判定接口行为 |
| 报告中 ❌/⚠️ 需求没有根因码 | 必须按决策树标注 CA-CONTRACT/CA-IMPL/CA-REQ，并给出定位文件:行号 | 只写"未实现"不标注根因类型 |

---

## Output Format Checklist（输出格式自查）

**每次生成报告前，你必须逐条确认以下 8 项。如果有任何一项未完成，禁止生成最终报告：**

- [ ] Phase 1 输出了已加载文档清单和需求条目清单
- [ ] Phase 2 生成了结构化用例集（YAML）并写入 `ST/test-cases.yaml`
- [ ] Phase 2 生成了可执行测试代码并写入项目测试目录
- [ ] Phase 3 真实执行了 HTTP 请求和测试代码（有命令输出为证）
- [ ] Phase 4 对每条失败用例标注了根因分类（CA-CONTRACT / CA-IMPL / CA-REQ）
- [ ] Phase 5 生成了包含 6 个部分的 Markdown 报告并写入 `ST/ST-REPORT.md`
- [ ] 执行结果写入 `ST/execution-results.yaml`
- [ ] 报告中每个「通过」结论都能追溯到具体命令输出

**满足以上 8 条才算完成 ST 验证。**
