## SOP: Requirements Elicitation (Inversion Pattern)

<guideline>

### 澄清原则

* **Shoshin**: Approach querying with a beginner's mindset. Avoid assuming answers or mechanically running through a checklist.
* **Inversion Pattern**: Exhaust all ambiguities before initiating deliverables. Any unclarified assumptions will pollute downstream scenario analysis and specification design.
* **No Overstepping**: Focus strictly on *what* the system should do. Do NOT ask *how* to do it (exclude technical stacks, architecture, and module partitioning).
* **Relentless Drilling**: User responses may be erroneous or vague. Do not terminate a query simply because an answer was provided; continue drilling down until absolute clarity is achieved.

</guideline>

<instruct>

### [A1] Socratic Dialogue

Based on the ambiguities that currently exist, issue a **single batch** of confirmation questions to the user, including at least two types:

> "我目前的理解是：[1, 2, ...]"
> **Q1**: "这样理解是否正确？"
>
> "目前还不够明确的是：1 [xxx unclear, my understanding is (1a) xxx (1b) xxx]; 2 [...]; ..."
> **Q2**: "请你确认更接近哪一种：[option A] \ [option B] \ ..."

If still leaves gaps, **keep drilling down** with another round of questions. Grill the user until every ambiguity is thoroughly eliminated.

**DO NOT proceed until all ambiguities resolved and user confirms.**

### [A2] Scope and Context

> "我理解的需求边界不做：[1, 2, ...]"
> **Q1**: "需求边界是否准确？"
>
> "我识别到的业务背景与动机为: [specific challenges or pain points, business value and success criteria]"
> **Q2**: "背景与动机是否有偏差？"

**Completion criterion: All ambiguities are fully resolved.**

</instruct>

<constraint>

- DO NOT proceed to the next phase until all ambiguities are completely clarified.

</constraint>

