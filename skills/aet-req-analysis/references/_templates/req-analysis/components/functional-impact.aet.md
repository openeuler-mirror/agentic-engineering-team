---
heading_level: 2
checklist: |
  **功能影响**
  1. Add/Delete/Modify 分类是否准确 (ERROR)
     - Add：新功能或既有功能下新增 function_point/function_spec/function_constraint
     - Modify：既有功能或子节点规格/约束被变更，须说明前后状态
     - Delete：废弃功能或子节点须提供废弃理由
     - 无功能库时不得默认全部归类为 Add，须基于系统实际存在判断
  2. 描述粒度是否合适 (INFO)
     - [A2] 阶段仅汇总受影响功能及高层影响，不展开功能点内部细节

---

## 功能影响

<!--guideline: Function tree is a structured mapping of what a system *can do*, focusing on business functions and user value. Node must be an independent functional description from the user or business-flow perspective, in the form of "verb + noun" or "noun + function" (e.g., Manage product information, Process order refunds) -->

<!-- instruct: Determine which function in the existing function tree is impacted by the decomposed requirement, and analyze how and to what extent it is impacted. -->

|编号|名称|影响|描述|关联场景|
|-|-|-|-|-|
|F-xxx|[Function Name]|[增/删/改]|[Impact detail: changes to specific function points (Input/Process/Output), functional specs, or functional constraints]|[SC-xxx]|
