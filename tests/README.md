# AET System Test - 测试套件

## 概述

本目录包含 aet-system-test 组件的单元测试和集成测试，用于验证组件功能是否符合 AC-01~AC-10 验收标准。

## 测试文件结构

```
tests/
├── unit/
│   ├── skill-structure.test.ts           # Skill 结构验证（AC-09）
│   └── root-cause-classification.test.ts # 根因分类逻辑验证（AC-07）
├── integration/
│   └── e2e-agent-insight-257.test.ts     # 端到端集成测试（AC-01~AC-10）
└── README.md                             # 本文件
```

## 运行测试

### 前置条件

```bash
# 确保已安装 Node.js 和 tsx
npm install -g tsx
```

### 运行命令

```bash
# 运行所有测试
cd /root/agentic-engineering-team
node --import tsx --test tests/unit/*.test.ts tests/integration/*.test.ts

# 仅运行单元测试
node --import tsx --test tests/unit/*.test.ts

# 仅运行集成测试
node --import tsx --test tests/integration/*.test.ts
```

## 测试覆盖

### 单元测试

| 测试文件 | 测试内容 | 测试用例数 | 覆盖AC |
|---------|---------|-----------|--------|
| skill-structure.test.ts | Skill 结构验证 | 6 | AC-09 |
| root-cause-classification.test.ts | 根因分类逻辑 | 9 | AC-07 |

### 集成测试

| 测试文件 | 测试内容 | 测试用例数 | 覆盖AC |
|---------|---------|-----------|--------|
| e2e-agent-insight-257.test.ts | 端到端流程验证 | 10 | AC-01~AC-10 |

## 验收标准对照

| AC | 验收标准 | 测试覆盖 |
|----|---------|---------|
| AC-01 | 输入三份文档生成用例集 | e2e: Phase 1-2 |
| AC-02 | HTTP API功能测试 | e2e: Phase 3 (curl) |
| AC-03 | 模块接口测试 | e2e: Phase 3 (test code) |
| AC-04 | 测试代码生成 | e2e: Phase 2 |
| AC-05 | 结构化执行结果 | e2e: AC-05 field check |
| AC-06 | 需求满足度评估 | e2e: Phase 4 |
| AC-07 | 根因标注三类 | unit: root-cause.test.ts |
| AC-08 | ST报告生成 | e2e: Phase 5 |
| AC-09 | Agent调用skill | unit: skill-structure.test.ts |
| AC-10 | 产物写入约定路径 | e2e: AC-10 path check |

## 测试产物示例

测试执行后会在 agent-insight 项目中生成以下产物：

```
ai_assistance/features/trace-filters/implementation/ST/
├── test-cases.yaml           # 测试用例集
├── execution-results.yaml    # 测试执行结果
└── ST-REPORT.md              # ST测试报告
```

## 输出示例

```
✔ Skill Structure Validation: AC-09: Skill should have I/O contract definition (1ms)
✔ Skill Structure Validation: AC-09: Skill should accept three AET document paths (0ms)
✔ Root Cause Classification: AC-07: CA-CONTRACT - API accepts param but ignores it (0ms)
✔ Root Cause Classification: AC-07: CA-IMPL - Feature not implemented (0ms)
✔ Root Cause Classification: AC-07: CA-REQ - Requirement ambiguous (0ms)
✔ E2E: ST Verification: Phase 1: Should load requirement document RAS.md (2ms)
✔ E2E: ST Verification: Phase 5: Should generate ST-REPORT.md (1ms)

ℹ tests 25
ℹ pass 25
ℹ fail 0
```

## 故障排除

### 问题：测试找不到文件

**原因**: Agent Insight 项目路径不正确

**解决**: 确保 `/root/agent-insight` 目录存在且包含测试产物

### 问题：HTTP 测试失败

**原因**: 被测服务未启动

**解决**: 
```bash
cd /root/agent-insight
npm run dev &
```

## 相关链接

- [aet-system-test SKILL.md](../../skills/aet-system-test/SKILL.md)
- [Agent Insight 项目](/root/agent-insight)
- [自验报告](../../AET-ST-SelfVerification-Report.md)
