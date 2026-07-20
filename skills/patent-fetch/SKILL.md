---
name: patent-fetch
description: 专利检索CLI工具。使用patent-mcp-server fetch-one命令获取专利详情，适用于竞品分析中的专利来源检索。支持WO、US、EP、JP、CN等专利号格式，无需API密钥，完全免费。
---

# 专利检索技能

专利检索CLI工具，用于竞品分析阶段获取专利技术方案、创新保护和技术路线信息。

## CLI使用方式

### 基本命令

```bash
patent-mcp-server fetch-one <专利号>
```

### 专利号格式支持

| 格式 | 示例 | 说明 |
|------|------|------|
| **WO/PCT** | `WO2020182466` | WIPO国际专利申请 |
| **US** | `US7654321`、`US7654321B2` | 美国专利 |
| **EP** | `EP1234567`、`EP1234567A1` | 欧洲专利 |
| **JP** | `JP12345678` | 日本专利 |
| **CN** | `CN123456789` | 中国专利 |
| **KR** | `KR10201234567` | 韩国专利 |

### 使用示例

```bash
# 检索WIPO国际专利
patent-mcp-server fetch-one WO2020182466

# 检索美国专利
patent-mcp-server fetch-one US7654321

# 检索欧洲专利
patent-mcp-server fetch-one EP3456789A1

# 检索中国专利
patent-mcp-server fetch-one CN123456789A
```

## 返回数据结构

CLI返回结构化JSON，可直接用于竞品分析报告：

```json
{
  "canonical_id": "US7654321",
  "success": true,
  "from_cache": true,
  "metadata": {
    "title": "专利标题",
    "abstract": "专利摘要内容...",
    "inventors": ["发明人A", "发明人B"],
    "assignee": "专利权人公司",
    "filing_date": "2006-12-27",
    "publication_date": "2010-02-02",
    "grant_date": null,
    "jurisdiction": "US",
    "doc_type": "patent"
  },
  "sources": [
    {"source": "USPTO", "success": true, "elapsed_ms": 1842}
  ]
}
```

### 字段映射到竞品分析JSON

| CLI返回字段 | 竞品分析JSON字段 | 说明 |
|-------------|-----------------|------|
| `canonical_id` | `evidenceRecords[].sourceName` | 专利号（如"专利号US7654321"） |
| `metadata.title` | 竞品标题分析 | 专利标题 |
| `metadata.abstract` | 竞品技术方案分析 | 技术原理摘要 |
| `metadata.inventors` | 核心机制分析 | 发明人信息 |
| `metadata.assignee` | 市场证据 | 专利权人（公司信息） |
| `metadata.publication_date` | 日期信息 | 公开/授权日期 |

## 在竞品分析中的应用

### 1. 检索流程

当竞品分析需要专利来源数据时：

```
Step 1: 从关键词或竞品描述识别专利号
  - 竞品官网提及专利号
  - 技术博客引用专利
  - 关键词搜索发现专利

Step 2: 使用CLI获取专利详情
  - patent-mcp-server fetch-one <专利号>

Step 3: 解析JSON数据
  - 提取title、abstract、assignee等
  - 分析技术方案和创新保护范围

Step 4: 记录到evidenceRecords
  - sourceType: "patent"
  - sourceName: "专利号US7654321"
  - sourceUrl: WIPO/USPTO链接
  - summary: abstract摘要
  - relevance: 与竞品技术的关联
```

### 2. 填充竞品分析JSON示例

```json
{
  "evidenceRecords": [
    {
      "id": "ev-patent-001",
      "sourceType": "patent",
      "sourceName": "专利号WO2020182466",
      "sourceUrl": "https://patentscope.wipo.int/search/en/detail.jsf?docId=WO2020182466",
      "retrievedAt": "2026-04-27",
      "summary": "Compilation of quantum algorithms - 量子算法编译方法",
      "relevance": "竞品X的量子计算核心算法与此专利技术路线相似",
      "categoryLabel": "专利来源"
    }
  ]
}
```

### 3. 分析要点

**技术方案确认**：
- 从abstract提取核心技术原理
- 与竞品实现方案对比差异

**创新保护分析**：
- 专利权人信息（竞品公司或竞争对手）
- 专利覆盖范围（jurisdiction）

**技术路线规划**：
- 专利申请时间线
- 技术演进路径

## 状态说明

| 状态 | 说明 |
|------|------|
| **CLI可用** | ✅ `patent-mcp-server fetch-one` 正常工作 |
| **MCP模式** | ❌ 已禁用（Node.js 24 ESM bug + Python 3.13 asyncio bug） |
| **数据源** | WIPO PATENTSCOPE（127.2M专利，完全免费） |
| **认证要求** | 无需API Key，无需注册 |

## 注意事项

### 1. 专利号规范

- 使用规范化专利号（如`US7654321`而非`US-7,654,321`）
- CLI自动规范化输入格式
- 支持带字母后缀的专利号（如`US7654321B2`）

### 2. 数据限制

| 字段 | 返回情况 | 说明 |
|------|---------|------|
| **CPC分类** | ❌ 不返回 | WIPO不提供CPC分类数据 |
| **IPC分类** | ❌ 不返回 | WIPO不提供IPC分类数据 |
| **引用数** | ❌ 不返回 | 无引用统计信息 |

### 3. 缓存机制

- CLI自动缓存已检索专利
- 缓存位置：`~/.cache/patent-mcp-server/`
- 缓存命中时响应更快（~100ms）

### 4. 错误处理

```bash
# 专利不存在
patent-mcp-server fetch-one INVALID123
# 返回: {"success": false, "error": "Patent not found"}

# 网络错误
# 返回: {"success": false, "error": "Network timeout"}
```

## 参考资料

- **WIPO PATENTSCOPE**: https://patentscope.wipo.int/search/
- **项目文档**: `docs/patent-api-alternatives.md`
- **完整指南**: `docs/PATENT-SEARCH-FINAL-GUIDE.md`
- **源码**: `packages/research-mcp-router/src/clients/patent.ts`

## 相关技能

- **enhanced-competitor-analysis**: 增强版竞品分析指南，包含专利检索要点

## 最佳实践

### 1. 批量检索

当需要检索多个专利时，顺序执行CLI调用：

```bash
for patent_id in WO2020182466 US7654321 EP3456789; do
  patent-mcp-server fetch-one $patent_id
done
```

### 2. 数据整合

将CLI返回数据整合到竞品分析报告：

```
competitor-research阶段:
  ├─ 学术来源: research_paper_search
  ├─ 开源项目: research_github_search_repos  
  ├─ 专利来源: patent-mcp-server fetch-one ← 使用本技能
  └─ 产业现状: Tavily/search skill
```

### 3. 技术方案对比

使用专利数据对比竞品技术：

```
竞品A vs 专利US7654321:
  ├─ 技术原理对比: abstract字段分析
  ├─ 实现差异: 竞品实现 vs 专利描述
  ├─ 创新保护: 竞品是否绕过专利
  └─ 技术路线: 专利申请时间线分析
```