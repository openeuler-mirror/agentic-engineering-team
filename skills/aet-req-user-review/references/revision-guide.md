# Revision Guide

> Loaded on-demand when detailed annotation rules or chain-modification patterns are needed.
> This guide supplements the SKILL.md workflow — it does not replace it.

---

## Annotation Methods Detail

Users can annotate requirement documents using four methods. Each method triggers a specific processing strategy in A4.

### 1. Direct Addition

User inserts new text at any location. The Agent:
- Integrates the content into the deliverable.
- Rewords for style/tone consistency if needed.
- Checks that the addition does not conflict with existing requirements.

**Example**: User adds "系统应支持批量导出功能" between two existing FR items.
**Processing**: Insert as a new FR, assign ID, check for conflicts with existing FRs covering export.

### 2. Deletion

User removes text by deleting it from the file. The Agent:
- Removes the corresponding content.
- Scans the entire document for all references to the deleted content.
- Removes or updates: isolated references, dangling cross-references, contradictory statements.
- Adjusts numbering/ID sequences if a numbered item was deleted.

**Example**: User deletes an entire FR block.
**Processing**: Remove the FR, renumber subsequent FRs, remove all cross-references to that FR ID, check acceptance criteria sections for references.

### 3. Modification

User edits existing text in-place. The Agent:
- Accepts the modification as the new canonical text.
- Adjusts surrounding sections for style/tone consistency.
- Checks whether the modification changes the requirement scope or priority — if so, update dependent sections.

**Example**: User changes "响应时间<3秒" to "响应时间<1秒".
**Processing**: Update the NFR, check if any design constraints or acceptance criteria reference the old threshold.

### 4. Instruction Block (`%%...%%`)

User inserts text starting with `%%` as an instruction to the Agent. Two subtypes:

**Direct modification instruction**:
- `%%增加示例%%` → add an example to the current section.
- `%%细化验收标准%%` → expand acceptance criteria for the current FR.

**Additional work instruction**:
- `%%调研竞品方案%%` → first research competitor solutions, then update the document with findings.
- `%%补充技术约束%%` → first analyze technical constraints, then add them to the document.

Processing: identify the intent, execute the task (using tools if needed), then update the deliverable.

---

## Chain Modification Patterns

When a change affects one part of a requirement document, related sections throughout the document may need updates. Common chain patterns:

| Change Origin | Chain Impact Zones |
|---|---|
| FR added/removed | FR numbering, cross-references, acceptance criteria, traceability matrix |
| NFR threshold changed | Design constraints, acceptance criteria, feasibility section |
| Terminology change | All occurrences across the document, glossary section |
| Scope boundary change | In-scope/out-of-scope lists, priority assignments, dependency graph |
| Priority change | Roadmap section, resource allocation, milestone definitions |

**Rule**: After processing each hunk, scan the entire document for these chain patterns. Apply all necessary updates in a single pass to avoid partial consistency.

---

## Snapshot Safety Protocol

1. **Before edit**: A1 creates a snapshot — the original file is backed up in `/tmp/interactive-revision/<sessionHash>/`.
2. **During edit**: User modifies the original file directly. The snapshot remains untouched.
3. **After edit**: A3 finalize-revision compares original against snapshot, extracts diffs, then destroys both snapshot and session directory.
4. **Round boundary**: Between revision rounds, A1 MUST be re-run because A3 destroyed the previous session. There is no persistent snapshot across rounds.

**Risk**: If A2 is executed without A1, the user edits the original file with no backup — any accidental deletion or corruption is unrecoverable. This is why A1 is a mandatory prerequisite for A2.
