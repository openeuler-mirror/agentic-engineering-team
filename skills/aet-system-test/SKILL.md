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

***

## I/O Contract（AC-09 标准输入输出契约）

**作为 AET 流水线节点被调用时，本 Skill 接受以下输入并产出以下输出：**

### 输入（三份 AET 文档路径，可选）

| 参数                 | 类型   | 说明                  | 传入方式                          |
| ------------------ | ---- | ------------------- | ----------------------------- |
| `requirements_doc` | 文件路径 | 需求分析文档（RAS.md）      | AET 流水线自动传入 / 用户自然语言提供 / 自动发现 |
| `design_doc`       | 文件路径 | 功能设计文档（design.md）   | 同上                            |
| `dev_plan_doc`     | 文件路径 | 开发计划文档（dev-plan.md） | 同上                            |
| `feature_name`     | 字符串  | 当前需求 feature 标识     | AET 流水线自动传入 / 从文档目录推断         |

> **输入降级规则**：如果 AET 流水线未传入文档路径，Phase 1 按自动发现规则查找文档。找不到的文档标记为 `⚠️ 降级处理`，从代码推断，不中止流程。

### 输出（三类 ST 产物路径）

| 产物    | 路径                                                                               | 格式       |
| ----- | -------------------------------------------------------------------------------- | -------- |
| 测试用例集 | `ai_assistance/features/{feature_name}/implementation/ST/test-cases.yaml`        | YAML     |
| 执行结果  | `ai_assistance/features/{feature_name}/implementation/ST/execution-results.yaml` | YAML     |
| ST 报告 | `ai_assistance/features/{feature_name}/implementation/ST/ST-REPORT.md`           | Markdown |
| 测试代码  | 项目既有测试目录下按 feature 组织的子目录                                                        | 源码       |

### AET 流水线集成模式

```
# AET 流水线自动调用（无需人工介入）
/aet-implement → 完成代码开发 → 自动触发 /aet-system-test
                                  ↓
                         接收三份文档路径 + feature_name
                                  ↓
                         Phase 1~5 执行
                                  ↓
                         产出三类 ST 产物到指定路径
                                  ↓
                         返回 ST-REPORT.md 路径 + 总体结论
```

### 手动调用模式

```
# 用户自然语言触发
"做一下 ST 验证，需求和实现代码都在项目里"
→ 自动发现文档（不要求用户传参）
→ Phase 1~5 执行
→ 产出三类 ST 产物
```

***

## Purpose

在 /aet-implement 完成需求实现之后，执行系统级（System Test, ST）功能验证。
验证的核心目标不是跑多少用例，而是诚实回答一个问题：

> **实现是否真正满足用户原始需求？**

**The Iron Law of ST Verification**

- No completion claims without fresh ST execution evidence
- 任何 "100% 通过" / "功能完整" 的声明之前，必须真实跑过测试命令
- 报告失败 + 定位根因，远好于 编造通过 + 丧失信任

***

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

***

## Core Verification Methodology

系统级验证按以下 5 个阶段执行，**不可跳过任何阶段**。每个阶段结束后必须输出对应产物，否则视为该阶段未完成。

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

***

### Phase 2: Multi-Layer Test Case Generation（多层测试用例生成）

**你必须在此阶段生成两类产物：① 结构化用例集（YAML）② 可执行测试代码。**

#### 2.1 用例生成策略

根据 Phase 1 加载的输入材料，用三层策略自动生成测试用例：

| 层级           | 驱动方式                       | 生成规则                                  | 覆盖率目标                           |
| ------------ | -------------------------- | ------------------------------------- | ------------------------------- |
| **L1 参数驱动**  | 接口契约 schema（字段类型、必填、范围、枚举） | 正常值 + 边界值（min/max/0/空/超长/非法类型）+ 枚举全覆盖 | 每个参数字段 ≥ 5 条用例                  |
| **L2 需求驱动**  | 需求文档条目逐条映射                 | 每条需求条目至少 1 条正常路径 + 1 条验收条件相关用例        | 需求条目覆盖率 100%                    |
| **L3 副作用驱动** | 实现代码控制流 + 常见系统风险           | 鉴权绕过、并发竞态、资源耗尽、幂等、异常恢复、跨接口顺序依赖        | 每个写接口（POST/PUT/DELETE）≥ 3 条异常场景 |

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
    coverage_type: "正常路径"  # 正常路径 / 边界条件 / 异常输入 / 需求验收点
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

***

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

- 状态码：预期 200 vs 实际 ?（不符 → PASS，不符 → E-STATUS）
- 响应体结构：预期有 `data` 数组 vs 实际有 ?（不符 → E-SCHEMA）
- 响应体内容：预期返回筛选后数据 vs 实际返回 ?（不符 → E-DATA）
- 副作用：预期数据库/文件状态变更 vs 实际 ?（不符 → E-SIDE）

#### 3.3 模块函数引擎执行

> ⛔ **AC-03 合规声明**：模块接口测试**仅通过模块对外暴露的公共接口（export / module.exports / public 方法）进行输入-输出行为验证**。禁止访问或依赖任何内部实现细节，包括：私有字段、私有函数、内部变量、文件布局、数据库表结构、缓存实现等。测试代码只调用 public API，通过返回值和可观测的副作用判定行为正确性。

**对每条模块用例，运行生成的测试代码：**

```bash
# Python
pytest tests/st/ -v --tb=short 2>&1

# Node.js
npx tsx --test test/st-verification/*.test.ts 2>&1

# Go
go test ./... -run "ST_" -v 2>&1
```

**校验维度（仅基于公共接口的可观测行为）：**

- 返回值类型与内容（通过 public 函数返回值判定，不检查内部状态）
- 异常抛出是否符合预期（通过 public 接口触发的异常类型和消息判定）
- 副作用观测（仅通过其他 public 接口或外部可观测状态如数据库/文件验证，不检查内部变量）
- 无外部依赖污染（测试前后环境状态一致）

**禁止行为清单（AC-03 红线）：**

- ❌ 在测试中 import/require 模块内部私有文件
- ❌ 直接访问对象的私有属性（如 `obj._internalState`）
- ❌ mock/stub 模块内部私有函数
- ❌ 依赖文件布局或目录结构判定结果
- ✅ 仅通过 `export`/`module.exports`/`public` 暴露的接口调用和验证

#### 3.4 失败分类

| 分类码         | 含义                 |
| ----------- | ------------------ |
| `E-SCHEMA`  | 响应体不符合接口契约 schema  |
| `E-STATUS`  | HTTP 状态码不符合预期      |
| `E-DATA`    | 返回内容业务逻辑错误         |
| `E-SIDE`    | 副作用未触发 / 污染数据      |
| `E-CRASH`   | 服务崩溃 / 500 / 未捕获异常 |
| `E-TIMEOUT` | 用例超时（默认阈值 30s）     |

**Phase 3 必须输出以下内容：**

**execution-results.yaml 完整结构定义（AC-05 合规）：**

```yaml
# 写入路径：ai_assistance/features/{feature-name}/implementation/ST/execution-results.yaml
# 每条用例必须记录以下 6 个字段，缺一不可（AC-05 要求）

feature: "trace-filters"
executed_at: "2026-08-29T18:12:00Z"
environment:
  service_command: "npm run dev"
  port: 3000
  framework: "node:test"
  commit: "a1b2c3d"

results:
  - case_id: "TC-R001-L1-001"
    requirement_id: "R-001"
    engine: "HTTP"
    interface: "GET /api/experiments/traces?search=abc"
    input:
      method: "GET"
      url: "http://127.0.0.1:3000/api/experiments/traces?search=abc"
      headers: {}
      body: null
    actual_output:
      status_code: 200
      response_body: '{"data": [...11 records...], "total": 11}'
      response_time_ms: 45
    assertion_result:
      status_check: "PASS"
      schema_check: "PASS"
      content_check: "FAIL"
      side_effect_check: "SKIP"
      overall: "FAIL"
    duration_ms: 52
    log_summary: "HTTP 200 returned 11 records, expected filtered results"
    side_effect_obs:
      type: "none"
      details: "无数据库写入，无副作用"
    failure_code: "E-DATA"
    root_cause: "CA-CONTRACT"
    root_cause_desc: "API 接受 search 参数但返回全量数据，参数语义偏移"
    location: "route.ts:L43-69"

  - case_id: "TC-R001-L2-001"
    requirement_id: "R-001"
    engine: "MODULE"
    interface: "test_R001_search_match_id"
    input:
      function: "searchTraces"
      args: { search: "abc" }
    actual_output:
      return_value: "[11 records]"
      exception: null
    assertion_result:
      type_check: "PASS"
      value_check: "FAIL"
      exception_check: "PASS"
      overall: "FAIL"
    duration_ms: 11
    log_summary: "Expected filtered results, got all 11 records"
    side_effect_obs:
      type: "none"
      details: "纯函数调用，无副作用"
    failure_code: "E-DATA"
    root_cause: "CA-CONTRACT"
    root_cause_desc: "搜索函数接受参数但返回全量数据"
    location: "route.ts:L43-69"

# ... 每条用例一条记录
```

**execution-results.yaml 每条记录必须包含以下 6 个字段（AC-05 要求）：**

| 字段                 | 说明      | 示例                                                                                 |
| ------------------ | ------- | ---------------------------------------------------------------------------------- |
| `input`            | 用例的输入参数 | `{ method, url, body }` 或 `{ function, args }`                                     |
| `actual_output`    | 实际输出    | `{ status_code, response_body, response_time_ms }` 或 `{ return_value, exception }` |
| `assertion_result` | 断言结果    | `{ status_check, schema_check, content_check, side_effect_check, overall }`        |
| `duration_ms`      | 执行耗时    | `52`                                                                               |
| `log_summary`      | 日志摘要    | `"HTTP 200 returned 11 records, expected filtered results"`                        |
| `side_effect_obs`  | 副作用观测   | `{ type: "database_write", details: "新增 1 条记录" }` 或 `{ type: "none" }`             |

**Phase 3 对话输出内容：**

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

***

### Phase 4: Requirement Satisfaction Evaluation（需求满足度评估）

对照 Phase 1 加载的需求条目和 Phase 3 的执行结果，逐条打分。

#### 4.1 满足度判定规则

| 判定       | 条件                                 | 在报告中标记     |
| -------- | ---------------------------------- | ---------- |
| **完全满足** | 所有关联测试用例通过 + 无 E-CRASH/E-SIDE 严重错误 | ✅ PASS     |
| **部分满足** | 关联用例通过率 ≥ 60% 且 < 100%，无严重错误       | ⚠️ PARTIAL |
| **不满足**  | 关联用例通过率 < 60% 或 存在严重错误             | ❌ FAIL     |

#### 4.2 缺陷根因归因（必须执行，不可跳过）

> ⛔ **BLOCKER 规则**：如果报告中有任何 ❌ FAIL 或 ⚠️ PARTIAL 的需求，但**没有标注 CA-CONTRACT / CA-IMPL / CA-REQ 根因分类码**，则 Phase 4 视为**未完成**，禁止生成最终报告。

**对每条 ❌ 或 ⚠️ 的需求，你必须标注根因分类码。判定方法如下：**

**根因分类决策树（按顺序判断，不可跳过任何分支）：**

> ⛔ **BLOCKER 规则**：如果所有失败用例都被归为同一个根因类型（如 100% CA-IMPL），则 Phase 4 视为**未完成**。真实项目必然存在多种根因混合，你必须对每条失败用例独立分析，不可批量归类。

```
失败用例
  │
  ├─ ① 接口路径/HTTP方法/参数 是否与需求/契约定义不一致？
  │   ├─ 是 → CA-CONTRACT（接口契约偏移）
  │   │        例：需求要求 GET /api/traces?search=xxx，但代码里接口路径是 /api/v2/traces
  │   │        例：需求要求接受 from/to 参数，但 API 根本不接受这两个参数（返回 400/404）
  │   │
  │   └─ 否 ↓
  │
  ├─ ② API 接受了参数，但参数的语义/行为与契约定义不一致？
  │   │   （参数存在于 URL 中且被接受，但 API 忽略它、当 no-op 处理，
  │   │    或响应字段语义与契约不符）
  │   ├─ 是 → CA-CONTRACT（接口契约偏移 - 参数语义偏移）
  │   │        例：API 接受 ?search=abc 但返回全量数据（search 被当 no-op），契约要求按关键词过滤
  │   │        例：API 接受 ?from=&to= 但不按时间过滤，契约要求按时间范围筛选
  │   │        例：API 的 total 字段始终返回全量计数，契约要求返回筛选后的计数
  │   │        例：API 接受 ?tagIds=1,2 但不按标签过滤，契约要求按标签 AND 筛选
  │   │
  │   └─ 否 ↓
  │
  ├─ ③ 接口存在且参数语义正确，但具体实现逻辑有 bug？
  │   ├─ 是 → CA-IMPL（实现缺陷 - 逻辑错误）
  │   │        例：API 接受 search 参数且确实做了模糊搜索，但大小写敏感，违反需求要求的 case-insensitive
  │   │        例：API 接受 from/to 且做了时间过滤，但边界值处理错误（from 当天数据被排除）
  │   │        例：标签筛选函数已集成到 API，但 AND 逻辑写成 OR 逻辑
  │   │
  │   └─ 否 ↓
  │
  ├─ ④ 需求描述本身有歧义或缺失，无法判定预期行为？
  │   ├─ 是 → CA-REQ（需求模糊）
  │   │        例：需求说"支持标签筛选"但没说清楚是 AND 还是 OR 逻辑
  │   │        例：需求说"跨步骤保持"但没定义哪些步骤、保持多久
  │   │        例：需求说"选择全部"但没说筛选后应取筛选 total 还是全量 total
  │   │
  │   └─ ⑤ 功能完全未实现（代码中不存在该功能，且非接口参数层面的问题）？
  │       ├─ 是 → CA-IMPL（实现缺陷 - 功能缺失）
  │       │        例：需求要求前端搜索框（含 300ms 防抖），前端代码中完全没有搜索框组件
  │       │        例：需求要求已选 Trace 常驻区域，前端代码中不存在该 UI 组件
  │       │        例：标签函数已存在但未被 API 集成，调用链断裂
  │       │
  │       └─ 如果以上都不匹配，重新从 ① 开始检查
```

**根因分类速查表（快速判定）：**

| 实际情况                | 根因类型            | 判定关键                     |
| ------------------- | --------------- | ------------------------ |
| API 不接受参数（400/404）  | CA-CONTRACT     | 参数层面不一致                  |
| API 接受参数但忽略（返回全量数据） | **CA-CONTRACT** | 参数语义偏移：契约要求过滤，实现当 no-op  |
| API 的响应字段语义与契约不符    | **CA-CONTRACT** | 响应字段语义偏移：如 total 不反映筛选结果 |
| API 实现了过滤但逻辑有 bug   | CA-IMPL         | 功能存在但行为错误                |
| 前端组件完全不存在           | CA-IMPL         | 功能缺失（非接口参数层面）            |
| 函数已存在但未被调用          | CA-IMPL         | 集成缺失                     |
| 需求描述不清晰无法判定对错       | CA-REQ          | 需求层面问题                   |

| 根因类型   | 分类码           | 含义              | 判定依据                                                  | 典型场景                                  |
| ------ | ------------- | --------------- | ----------------------------------------------------- | ------------------------------------- |
| 接口契约偏移 | `CA-CONTRACT` | 需求与实现对接口定义理解不一致 | ① 参数不接受（路径/方法/参数缺失）② **参数接受但语义偏移**（no-op/忽略/响应字段语义不符） | API 接受 ?search= 但返回全量数据；total 不反映筛选结果 |
| 实现缺陷   | `CA-IMPL`     | 实现未达契约要求        | 功能已实现但行为有 bug，或功能完全缺失（非接口参数层面）                        | 搜索大小写敏感；前端组件不存在；函数未集成                 |
| 需求模糊   | `CA-REQ`      | 需求定义本身存在歧义或缺失   | 无法明确判定预期行为                                            | 需求未定义筛选逻辑（AND/OR）；未定义 total 语义        |

**根因标注示例（你必须像这样标注每条失败/部分通过的需求）：**

> 注意：以下示例展示了三类根因的典型场景，**真实项目中必然存在多种根因混合**。如果你的报告中所有失败用例都是同一个根因类型，说明你的分类不充分，需要重新分析。

| 需求           | 状态         | 根因码           | 根因描述                                                 | 定位                                     |
| ------------ | ---------- | ------------- | ---------------------------------------------------- | -------------------------------------- |
| R-001 模糊搜索   | ❌ FAIL     | `CA-CONTRACT` | API 接受 search 参数但返回全量数据，参数语义偏移（契约要求按关键词过滤，实现当 no-op） | route.ts:L43-69                        |
| R-002 时间筛选   | ❌ FAIL     | `CA-CONTRACT` | API 接受 from/to 参数但不按时间过滤，参数语义偏移                      | route.ts:L43-69                        |
| R-003 标签筛选   | ⚠️ PARTIAL | `CA-IMPL`     | 标签函数已存在但未被 API 集成，调用链断裂                              | route.ts:L43, trace-tag-filters.ts:L12 |
| R-007 跨页全选   | ⚠️ PARTIAL | `CA-REQ`      | 需求未明确"选择全部"在筛选后应取筛选 total 还是全量 total                 | RAS.md R-007                           |
| R-008 API 扩展 | ❌ FAIL     | `CA-CONTRACT` | API 接受 search/from/to/tagIds 参数但全部当 no-op，参数语义整体偏移   | route.ts:L43-69                        |
| R-005 已选区域   | ❌ FAIL     | `CA-IMPL`     | 前端代码中不存在已选 Trace 常驻区域组件，功能完全缺失                       | page.tsx（组件不存在）                        |
| R-010 搜索逻辑   | ⚠️ PARTIAL | `CA-IMPL`     | 搜索功能已实现但大小写敏感，违反需求要求的 case-insensitive               | search-utils.ts:L23                    |

**Phase 4 必须输出以下内容：**

```markdown
## Phase 4: Requirement Satisfaction Evaluation

### 需求满足度逐条评估
| 需求 ID | 需求标题 | 关联用例数 | 通过数 | 通过率 | 判定 | 严重错误 | 备注 |
|--------|---------|-----------|--------|--------|------|---------|------|
| R-001 | 模糊搜索 | 5 | 2 | 40% | ❌ FAIL | 0 | search 参数未实现 |
| R-002 | 时间筛选 | 3 | 0 | 0% | ❌ FAIL | 0 | from/to 参数缺失 |
| R-005 | 已选常驻 | 4 | 3 | 75% | ⚠️ PARTIAL | 0 | 缺少折叠功能 |
| R-010 | 不回归 | 3 | 3 | 100% | ✅ PASS | 0 | 现有功能正常 |
| ... | ... | ... | ... | ... | ... | ... | ... |

### 汇总
- 完全满足：N 条（N%）
- 部分满足：N 条（N%）
- 不满足：N 条（N%）

### 失败用例根因归因
| 用例 ID | 需求 ID | 失败码 | 根因类型 | 根因描述 | 定位 |
|--------|--------|--------|---------|---------|------|
| TC-R001-L1-002 | R-001 | E-STATUS | CA-IMPL | API 未实现 search 参数，返回 404 | src/app/api/experiments/traces/route.ts:L43 |
| TC-R002-L1-001 | R-002 | E-SCHEMA | CA-CONTRACT | 契约定义 from/to 参数，代码无此参数 | src/app/api/experiments/traces/route.ts:L45 |
| ... | ... | ... | ... | ... | ... |

### 根因分布统计
| 根因类型 | 数量 | 占比 |
|---------|------|------|
| CA-CONTRACT（接口契约偏移） | N | N% |
| CA-IMPL（实现缺陷） | N | N% |
| CA-REQ（需求模糊） | N | N% |
```

***

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
| 需求 ID | 需求标题 | 判定 | 关联用例 | 通过率 | 备注 |
|--------|---------|------|---------|--------|------|
| R-001 | 模糊搜索 | ❌ FAIL | TC-R001-* | 40% | search 参数未实现 |
| R-005 | 已选常驻 | ⚠️ PARTIAL | TC-R005-* | 75% | 缺少折叠功能 |
| R-010 | 不回归 | ✅ PASS | TC-R010-* | 100% | 现有功能正常 |

## ④ 失败用例明细 + 根因归因
| 用例 ID | 失败码 | 根因类型 | 根因描述 | 定位 | 修复建议 |
|--------|--------|---------|---------|------|---------|
| TC-R001-L1-002 | E-STATUS | CA-IMPL | search 参数未实现 | route.ts:L43 | 添加 search 参数解析 |
| TC-R002-L1-001 | E-SCHEMA | CA-CONTRACT | from/to 参数缺失 | route.ts:L45 | 添加时间筛选逻辑 |

## ⑤ 双向追溯矩阵
| 需求 ID | 用例 ID 列表 | 关联接口 | 层级 | 结果 |
|--------|-------------|---------|------|------|
| R-001 | TC-R001-L1-001~005, TC-R001-L2-001~002 | GET /api/traces | L1+L2 | 40% FAIL |
| R-010 | TC-R010-L2-001~003 | GET/POST /api/traces | L2 | 100% PASS |

## ⑥ 后续操作建议
- 未通过需求（R-001~R-009）：建议回到 /aet-implement 阶段修复
- 部分通过需求（R-005~R-007）：修复缺失子功能后重跑 ST 验证
- 已通过需求（R-010）：可提交 PR
- 整体结论：❌ 未通过，不建议提交 PR，需先完成核心筛选功能实现
```

***

## The Iron Law（再次强调）

**任何情况下都必须遵守**：

1. **没有跑测试，禁止宣称通过**。哪怕只有 1 条用例没执行，也要如实写「未验证」
2. 测试失败就写失败 + 归因，**不许把失败改成通过**，不许跳过失败用例
3. 每个「通过」结论必须能追溯到具体的命令输出（HTTP 响应、函数返回值），不能凭空说
4. 如果测试环境搭不起来、服务起不来，**如实报告阻塞原因**，不要编造结果
5. 如果用户说「不用测了直接过」，礼貌但坚定地说明：这是 ST skill 的铁律，不执行验证无法给出通过结论
6. **必须发 curl 请求测试 HTTP 接口**。仅靠读代码判定接口行为不算 ST 验证。如果服务能启动，必须发 curl；如果服务起不来，必须报告阻塞原因
7. **必须对每条 ❌/⚠️ 需求标注根因分类码**（CA-CONTRACT / CA-IMPL / CA-REQ）。没有根因标注的报告视为未完成
8. **根因分类必须有多样性**。如果所有失败用例都是同一个根因类型（如 100% CA-IMPL），说明分类不充分。**API 接受参数但忽略（no-op）是 CA-CONTRACT，不是 CA-IMPL**。AC-07 要求三类根因各至少覆盖一例

***

## Common Failure Scenarios（高频错误提示）

| 情况                    | 正确做法                                                                                                       | 错误做法                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 服务启动报依赖缺失             | 报告：「环境阻塞：缺少 X 依赖，建议先 pip install / npm install」                                                            | 跳过该接口测试，宣称全部通过                   |
| 接口契约和代码不一致（例如路径变了）    | 报告：「接口契约偏移：契约定义 /api/users，代码实际 /api/v1/user」                                                              | 按代码实际路径测，不报告偏移                   |
| 数据库没初始化导致用例全挂         | 报告：「环境阻塞：数据库 schema 未初始化，请先执行 migration」                                                                   | 删掉这些用例不算失败                       |
| L3 异常场景有几条超时          | 报告：「超时失败 N 条，归类 E-TIMEOUT，建议补充超时保护」                                                                        | 降低超时阈值到通过为止                      |
| 只给了需求没给契约（常见）         | 不中止：从实现代码的 handler 签名 / 路由定义自动推断接口结构生成临时 schema，按 L2 + L3 完整执行；L1 如无法推断则标记跳过，报告中标记 WARN: CONTRACT-INFERRED | 中止请求用户传参，打断流程                    |
| 代码回退到实现前状态            | 如实报告所有需求未实现，不做静态代码分析替代运行态测试                                                                                | 跳过测试执行，仅靠读代码判定                   |
| 模型只读代码不发 curl         | 必须启动服务并发 curl 请求，即使预期接口不存在也要发请求验证返回 404/500                                                                | 跳过 HTTP 测试，仅靠读 route.ts 代码判定接口行为 |
| 报告中 ❌/⚠️ 需求没有根因码      | 必须按决策树标注 CA-CONTRACT/CA-IMPL/CA-REQ，并给出定位文件:行号                                                             | 只写"未实现"不标注根因类型                   |
| 所有失败都标为 CA-IMPL（100%） | **API 接受参数但返回全量数据（no-op）应标为 CA-CONTRACT**，不是 CA-IMPL。重新按决策树分支②判定                                           | 批量归为 CA-IMPL，忽略参数语义偏移            |
| 根因分布只有一种类型            | AC-07 要求三类根因（CA-CONTRACT/CA-IMPL/CA-REQ）各至少覆盖一例。如果只有一种，检查是否有 CA-REQ（需求模糊）或 CA-CONTRACT（参数语义偏移）被误判为 CA-IMPL | 忽略多样性要求，全部判为同一种根因                |

***

## Output Format Checklist（输出格式自查）

每次生成报告前自查以下 14 项：

- [ ] Phase 1 输出了已加载文档清单和需求条目清单
- [ ] Phase 2 生成了结构化用例集（YAML）并写入 `ST/test-cases.yaml`
- [ ] Phase 2 生成了可执行测试代码并写入项目测试目录
- [ ] Phase 3 真实执行了 HTTP 请求和测试代码（有命令输出为证）
- [ ] Phase 3 模块引擎仅通过公共接口验证，未访问私有实现（AC-03）
- [ ] Phase 3 execution-results.yaml 每条记录包含 6 个字段：输入/实际输出/断言/耗时/日志/副作用（AC-05）
- [ ] Phase 4 根因分布**不是 100% 同一种类型**（API 接受参数但 no-op = CA-CONTRACT）
- [ ] Phase 4 三类根因（CA-CONTRACT / CA-IMPL / CA-REQ）各至少覆盖一例（AC-07 要求）
- [ ] Phase 5 生成了包含 6 个部分的 Markdown 报告并写入 `ST/ST-REPORT.md`
- [ ] 执行结果写入 `ST/execution-results.yaml`（含 6 个必填字段）
- [ ] 报告中每个「通过」结论都能追溯到具体命令输出
- [ ] Skill 支持接受三份 AET 文档路径输入（AC-09 I/O 契约）
- [ ] 所有产物写入 AC-10 指定路径（`ai_assistance/features/{feature}/implementation/ST/`）

**满足以上 14 条才算完成 ST 验证。**
