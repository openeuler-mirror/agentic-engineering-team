## SOP: Functional Impact Analysis

<guideline>

**Scenario-Driven**: Structure functional impacts by scenario. Every functional impact must map to a scenario, detailing which parts of the function tree are affected and how. Do not establish relationships based on superficial keyword similarity; map solely by whether a scenario's behavioral path intersects with that function.

**Function Library Tree**: Structured as a hierarchy where non-leaf nodes represent **functional domains**, and **function** nodes contain three types of child nodes:

* **Functional Specifications (`function_spec`)**: Global specs for the function.
* **Functional Constraints (`function_constraint`)**: Global constraints for the function.
* **Function Points (`function_point`)**: Specific behavioral points within the function, embedding localized specs, constraints, inputs, processing logic, and outputs.

**Functional Naming**: Function nodes are independent descriptions from a user or business flow perspective, formatted as "Verb + Noun" or "Noun + Function" (e.g., Product Search, Order Payment, Inventory Deduction).

**Impact Assessment Categories**:

* **Add**: New functions not yet present in the system, or new `function_point` / `function_spec` / `function_constraint` additions under an existing function.
* **Modify**: Pre-existing functions or their child nodes whose specifications or constraints are altered. Distinguish between function-level changes (`function_spec`/`function_constraint`) and function-point-level changes (`function_point` specs/constraints), detailing the before-and-after states.
* **Delete**: Existing functions or child nodes deprecated by the current requirement (provide deprecation rationale).

**Granularity Alignment**: Mapping affected functions must rely strictly on actual function library data to maintain precise granularity alignment. Fabrication is strictly prohibited.

#### Tiered Library Browsing

Run the `aet-design-env` `library` subcommand via the `bash` tool to browse the function library, progressively expanding directory nodes as required. The first argument must be the **exact path** to the library file:

```bash
# Root-level browsing (directory nodes collapsed, displaying sub-content previews only)
node <aet-design-env path>/aet-design-env/scripts/aet-design-env.mjs library <function_library.yml>

# Batch expand multiple directory nodes
node <aet-design-env path>/aet-design-env/scripts/aet-design-env.mjs library <function_library.yml> <id1> <id2> <id3>

# Search nodes by keyword (scoped to the whole library or to an expanded sub-tree)
# NOTE: `-s` keyword search is auxiliary only — it cannot replace tiered browsing and risks missing nodes.
#       Use at most 3 keyword searches; then always fall back to expanding the tree from the root.
node <aet-design-env path>/aet-design-env/scripts/aet-design-env.mjs library <function_library.yml> -s <keyword>
```

</guideline>

<instruct>

按场景驱动分析当前需求对既有功能的影响：每条功能影响关联一个场景，分析该场景影响到了功能树中哪几个功能、如何影响。

Analyze the current requirement's impact on existing capabilities using a scenario-driven approach: map each functional impact to a scenario, and deduce which functions within the tree are hit and how.

### [A1] Function Library Mapping

This step is **mandatory** if function library data is provided in the context.

1. **Anchor by Scenario**: Use the identified scenarios, their happy paths, and extension/exception paths as the baseline to trace which nodes in the function tree are intersected by these behavioral paths.
2. Execute root-level browsing to review top-level functional domains and their sub-content previews.
3. **Scan broadly across sub-functions** to compare alternatives before expanding downwards—do not settle prematurely on the first superficially similar domain.
4. Converge systematically to the affected `function` node. Expand its child nodes (`function_spec` / `function_constraint` / `function_point`) to audit the baseline state for subsequent impact delta analysis.

### [A2] Impact Analysis & Confirmation

**Impact Targets occur across two layers**:

* **Function-Level Specs/Constraints** (`function_spec` / `function_constraint`): Globally applicable to the function.
* **Function-Point-Level Specs/Constraints**: Localized strictly within a specific `function_point`.

**Description Granularity**: When querying, summarize the affected functions and their high-level impact (add/delete/modify changes to child nodes). Do not expand into the internal details of the function points at this stage.

> "针对场景 [S-id 名称]，定位到受影响功能：[F-id/名称，简单描述影响； ...]"
> **Q1**: "定位与影响类型是否准确？有无遗漏？"
>
> "影响明细：[F-id 名称，增删改了功能点/功能规格/功能约束； ...]"
> **Q2**: "变化描述是否准确？"

**Completion criterion: Affected functions are accurately localized; Add/Delete/Modify deltas across specs, constraints, and points are analyzed; and user confirmation is obtained.**

</instruct>

<condition>

- If the function library YAML file does not exist, skip [A1] and perform a **lightweight function identification** against the codebase to map relevant functional boundaries and output a candidate function list. [A2] remains mandatory.

</condition>

<constraint>

- DO NOT modify the function library file directly. The library represents immutable baseline knowledge; updates must go through separate maintenance workflows. Record impacts solely within the design documentation.
- DO NOT rely on `-s` keyword search to cover the library on its own — tiered tree expansion is the primary method. Cap `-s` searches at 3 keyword combinations, then always fall back to expanding from the root.
- DO NOT defaults to classifying all functions as "Add" due to the absence of a library. Assess Add/Delete/Modify based on actual system existence.
- DO NOT read the raw function library file directly; the file is too long and its structural hierarchy is prone to introducing noise.
- DO NOT use reading tools to view the `aet-design-env.mjs` source code—execute the `library` subcommand directly via bash.

</constraint>

