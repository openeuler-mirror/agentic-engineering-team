## SOP: Scenario Analysis

<guideline>

### 场景与用例

- **Scenarios** are lightweight business descriptors (category + goal) representing a user's intent to achieve a specific business outcome.
  - **Scenario Ownership**: Map based on the business domain (what), not the implementation technology (how). The business essence and user pain points remain stable, whereas technical implementations evolve.
  - **Extraction Policy**: Extract strictly from a business perspective (one scenario = one business goal). DO NOT map 1:1 to API endpoints or code modules.
  - **Naming Guideline**: Use a consistent **verb-object** format expressing clear business intent (e.g., "创建订单", "库存盘点"). Always state the business goal and trigger in the scenario's description.
- **Use cases** carry the detailed behavioral steps and system interactions required to fulfill the scenario.
- **Association**: Each scenario must be clearly mapped to its corresponding use cases.

### Scenario Library (If Applicable)

- **Tree Structure**: The scenario library is structured as a tree; leaf nodes represent specific **scenes**, while non-leaf nodes represent **directories**.
- **Granularity Alignment**: Prior to generating any scenarios or use cases, align strictly with the existing scenario library's granularity. Fabrication is strictly prohibited.
- **Use Case Mounting**: Each use case must map to exactly one scenario (leaf node).
- **Scenario Addition**: Add new scenarios only if no fit exists in the current library. New scenarios must have an explicit parent node and match the style and granularity of the existing library.

### Behavior

The fundamental purpose is to **support capability derivation**: by exhaustively reasoning through use case, derive the supporting capabilities the system must possess, especially identifying capabilities users may not have considered but are essential for normal system operation or robustness.

- **Happy Path**: Given valid input, the output or state change the system should produce.
- **Alternative Paths**: Different behaviors under different conditions (e.g., VIP user discount). Users easily overlook such paths.
- **Critical Errors & Exception Handling**: How the system must react under invalid input, timeouts, or dependency failures.

#### Tiered Library Browsing

Run the `aet-design-env` `library` subcommand via the `bash` tool to browse the scenario library, expanding directory nodes progressively as needed. The first argument must be the **exact path** to the scenario library YAML file:

```bash
# Root-level browsing (directory nodes collapsed, displaying sub-content previews only)
node <aet-design-env path>/aet-design-env/scripts/aet-design-env.mjs library <xxx/scenario-library.yml>

# Batch expand multiple directory nodes
node <aet-design-env path>/aet-design-env/scripts/aet-design-env.mjs library <xxx/scenario-library.yml> <id1> <id2> <id3>

# Search nodes by keyword (scoped to the whole library or to an expanded sub-tree)
# NOTE: `-s` keyword search is auxiliary only — it cannot replace tiered browsing and risks missing nodes.
#       Use at most 3 keyword searches; then always fall back to expanding the tree from the root.
node <aet-design-env path>/aet-design-env/scripts/aet-design-env.mjs library <xxx/scenario-library.yml> -s <keyword>
```

</guideline>

<instruct>

### [A1] Scenario Library Analysis

This step is **mandatory** if scenario library data is provided in the context.

Progressively expand the tree using the script, following the localization sequence: **Deconstruct the business essence first, then inspect the tree.**

#### Grasping the Essence

- **The Keyword Trap**: Avoid the common error of matching scenarios based on literal keyword alignment. Any "instant match" must be re-verified against whether the Actor and the underlying business problem truly align.
- **Understand the Business Core**: **Who uses it (Actor)? Why? What business problem does it solve?** Focus strictly on the business problem, ignoring technical implementation.

Briefly output the final conclusions.

#### Breadth Search

1. Execute the root-level browsing script to review top-level categories and their sub-content previews.
2. Using the **Actor + Business Problem** as an anchor, identify all potentially relevant directory nodes and expand them in batches (do not match literally by keyword).
3. **Scan broadly across sub-categories**; do not halt investigation at the first seemingly relevant directory. Ensure comprehensive coverage before selecting the optimal match.
4. Converge progressively down to the leaf node (**scene**), which will serve as the use case mounting point.

### [A2] User Confirmation

For each identified scenario, define the Happy Path, Alternative Paths, and Critical Errors & Exception Handling. Issue the following confirmation questions:

> "我识别到的相关场景为：[scenarios with their full tree path, e.g., 10001-Version-Build → 10002-XX-Build (≤20 characters)]，其中需新增的场景有：[omit if none]"
> **Q1**: "请选择合适场景（可多选）"
>
> "我识别到最重要的用例（主成功）：[Who → under what circumstances → did what → how the system responds → final result (≤20 characters)]，关联场景为: []"
> **Q2**: "主用例是否准确？"
>
> "我识别到的、容易被忽略的扩展/备选/异常事件如下：[1. [扩展/备选/异常] - [描述]; ...(按排序仅列出≤3个关键事件)]"
> **Q2**: "关键扩展、备选和异常是否准确无遗漏？若有遗漏，请补充。"

**Completion criterion: Correct scenario classification is achieved, latent use cases are uncovered, and all critical edge cases are covered.**

</instruct>

<condition>

- If the scenario library YAML file does not exist, skip [A1] and generate scenarios and use cases directly.
- If the library exists or relevant data is provided, [A1] is mandatory; scenario fabrication is strictly prohibited.

</condition>

<constraint>

- DO NOT describe library contents from memory—always execute the script to inspect the actual data.
- DO NOT rely on `-s` keyword search to cover the library on its own — tiered tree expansion is the primary method. Cap `-s` searches at 3 keyword combinations, then always fall back to expanding from the root.
- DO NOT match scenarios purely by literal keyword proximity. Keyword similarity $\neq$ business alignment. Anchor by Actor and business problem first, and rigorously re-verify "instant matches".
- DO NOT read the raw library file directly; the file is too long and its structural hierarchy is prone to introducing noise.
- DO NOT use reading tools to view the `aet-design-env.mjs` source code—execute the `library` subcommand directly via bash.

</constraint>

<patch>

- Present only the critical scenarios and use cases for user confirmation, not the entire documentation package.

</patch>
