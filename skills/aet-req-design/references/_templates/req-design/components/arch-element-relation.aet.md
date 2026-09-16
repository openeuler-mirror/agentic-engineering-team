---
heading_level: 2
checklist: |
  **功能与系统元素关系管理**

  1. 架构元素来源是否正确 (ERROR)
     - 架构元素名称与类型必须来自架构元素库（architecture_element_library.yml），格式为《{type}》{name}

  2. 所属功能域来源是否正确 (ERROR)
     - 所属功能域必须来自功能库（function_library.yml），不得凭空编造

  3. 变更内容是否清晰 (WARNING)
     - 明确描述该架构元素在本需求中的具体变更内容
---

## 功能与系统元素关系管理

<!-- guideline: 展示"哪些功能涉及哪些系统架构元素，以及各自的变更内容与所属功能域"。仅当架构元素库（architecture_element_library.yml）存在时生成本节；若未提供架构元素库则整节省略。 -->
<!-- condition: architecture-element-library exists=Generate, missing=Skip -->
<!-- constraint: 架构元素列取自架构元素库（architecture_element_library.yml），格式为《{type}》{name}（如《Component》glibc、《SubDomain》基础服务、《Domain》Base系统）。所属功能域列取自功能库（function_library.yml），须与功能库中定义的功能域名称一致。功能列与变更内容列来自本次需求设计分析。 -->

|架构元素|功能|变更内容|所属功能域|
|-|-|-|-|
|《{type}》[element name]|[function]|[change description]|[function domain from function_library.yml]|
