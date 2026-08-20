/**
 * @file src/cli/commands/context/aet-tools.ts
 *
 * Plugin: aet-tools
 *
 * Emits an `<aet-tools>` XML block documenting how a coding agent should
 * operate the AET workflow lifecycle — three core tools (status /
 * handover / abort) with full tool-schema style entries: description,
 * syntax, parameters, when-to-use, behavior, returns, and a runnable
 * example with the actual JSON envelope.
 *
 * The output shape mirrors function-calling tool schemas (description +
 * typed parameters + behavior + returns + examples) so an agent that
 * parses tool definitions can parse this probe's output verbatim.
 *
 * Scope: this probe documents the three commands an agent uses to
 * operate workflow state. `aet workflow init` (workflow bootstrap) and
 * `aet context` (metadata query) are listed in <related-commands> only
 * — init is typically invoked by the plugin handler (active mode) or
 * the user, not by the agent mid-step; context is orthogonal to the
 * lifecycle.
 *
 * JSON examples are wrapped in CDATA so the raw JSON (with quotes,
 * newlines, braces) survives XML parsing intact — agents reading the
 * XML see the exact envelope they will receive when they invoke the
 * command with `--output json`.
 */
import type { Plugin } from './types.js';

const XML_TAG = 'aet-tools';

export const plugin: Plugin = {
  name: 'aet-tools',
  description: 'AET workflow lifecycle 工具调用指南（status / handover / abort 三大操作 + 完整 schema）',
  run(_root: string): string {
    return [
      `<${XML_TAG}>`,
      `  <overview>`,
      `    AET CLI 用 \`aet &lt;resource&gt; &lt;action&gt; [flags]\` 形式调用。`,
      `    默认 --output prompt（人类可读文本）；插件场景或需要机器解析时用 --output json，`,
      `    返回 CommandResult 信封：\`{ ok, prompt, events[], data?, error? }\`。`,
      `    agent 操作 workflow 状态主要用以下三个工具：status / handover / abort。`,
      `    Baseline workflows: design / implement / bugfix。`,
      `  </overview>`,
      ``,
      buildStatusTool(),
      ``,
      buildHandoverTool(),
      ``,
      buildAbortTool(),
      ``,
      `  <related-commands>`,
      `    <cmd syntax="aet workflow init --name &lt;id&gt; [--output json|prompt]">`,
      `      创建 checkpoint（不进入任何 step）。通常由 plugin handler 在用户输入 /aet-* 斜杠命令时调用（主动形态），`,
      `      或 init 后由 agent 自调 handover 进入 step 1。返回 data.status='workflow_started' 或 'intervention_required'（已有 active）。`,
      `    </cmd>`,
      `    <cmd syntax="aet context [plugin-name...] [--root &lt;path&gt;]">`,
      `      元数据查询（不走 Core；stdout 永远 XML）。本命令即是该机制的一个 plugin。`,
      `    </cmd>`,
      `  </related-commands>`,
      `</${XML_TAG}>`,
    ].join('\n');
  },
};

// ---------------------------------------------------------------------------
// Tool schema builders — one per lifecycle command
// ---------------------------------------------------------------------------

function buildStatusTool(): string {
  return [
    `  <tool name="aet-workflow-status">`,
    `    <description>查询当前 project root 下的 active workflow（只读，无副作用，不写 checkpoint）</description>`,
    `    <syntax>aet workflow status [--output json|prompt]</syntax>`,
    `    <parameters>`,
    `      <parameter name="--output" type="enum" required="false" default="prompt">`,
    `        json | prompt — 输出编码模式。prompt = 人类可读文本；json = CommandResult 信封（机器解析）`,
    `      </parameter>`,
    `    </parameters>`,
    `    <when-to-use>`,
    `      - agent 启动时自检"我现在处于哪个 step"`,
    `      - handover 前确认当前 step（避免跳错）`,
    `      - handover 后验证推进是否生效`,
    `      - 用户询问 workflow 进度时`,
    `      - 中断恢复时定位 last active workflow`,
    `      - 任何需要确认 active workflow 状态的场景`,
    `    </when-to-use>`,
    `    <behavior>`,
    `      Core 从 \`&lt;projectRoot&gt;/.aet/core-checkpoint/index.json\` 读取最新 updatedAt 的 active 条目`,
    `      （One active workflow per project root 契约）。不写 checkpoint、不 bump updatedAt、不 emit events[]。`,
    `      无 active 时返回 no_active 提示文本；有 active 时组装 workflow / checkpoint / currentStep / 时间戳摘要。`,
    `    </behavior>`,
    `    <returns>`,
    `      ok=true; data.status:`,
    `        - 'active'    → 有 active workflow；data.workflow / workflowName / currentStep / nextStep / checkpointId 填充`,
    `        - 'no_active' → 无 active workflow；所有 id 字段为 null；prompt 提示先 init`,
    `    </returns>`,
    `    <example><![CDATA[`,
    `$ aet workflow status --output json`,
    `{`,
    `  "ok": true,`,
    `  "prompt": "## Active workflow\\n\\n- workflow: design\\n- checkpoint: ckpt_1738200000000_a1b2c3\\n- current step: requirements_design\\n- started at: 2026-07-29T10:23:11.000Z\\n- last updated: 2026-07-29T11:05:42.000Z",`,
    `  "events": [],`,
    `  "data": {`,
    `    "status": "active",`,
    `    "workflow": "design",`,
    `    "workflowName": "Aet-Design",`,
    `    "currentStep": "requirements_design",`,
    `    "nextStep": null,`,
    `    "checkpointId": "ckpt_1738200000000_a1b2c3"`,
    `  }`,
    `}`,
    `]]></example>`,
    `  </tool>`,
  ].join('\n');
}

function buildHandoverTool(): string {
  return [
    `  <tool name="aet-workflow-handover">`,
    `    <description>`,
    `      推进 workflow step。currentStep=null 时第一次 handover 进入 step 1；`,
    `      后续 handover 推进下一 step；末步时再 handover 即自然完成 workflow。`,
    `      可用 --step 显式跳转（前进跳过 / 回退重做）。`,
    `    </description>`,
    `    <syntax>aet workflow handover [--step &lt;id&gt;] [--output json|prompt]</syntax>`,
    `    <parameters>`,
    `      <parameter name="--step" type="string" required="false">`,
    `        显式目标 step id。缺省则按 workflow 定义顺序推进下一 step。`,
    `        前进跳过：跳到更后面的 step；回退重做：跳到前面的 step（重新执行）。`,
    `        必须是当前 workflow 已定义的 id；不存在则返回 UNKNOWN_STEP 错误。`,
    `      </parameter>`,
    `      <parameter name="--output" type="enum" required="false" default="prompt">`,
    `        json | prompt — 输出编码模式`,
    `      </parameter>`,
    `    </parameters>`,
    `    <when-to-use>`,
    `      - 当前 step 任务完成，推进下一 step（被动形态：agent 在 step 内自调）`,
    `      - 用户输入 /aet-* 斜杠命令启动 workflow（主动形态：plugin handler 调 init + handover 进入 step 1）`,
    `      - 需要重做某 step：--step 回退到目标 step`,
    `      - 需要跳过某 step：--step 前进到目标 step`,
    `      - workflow 走到最后一步时再 handover → 自然完成`,
    `    </when-to-use>`,
    `    <behavior>`,
    `      Core 从 .aet/core-checkpoint/ 读 active workflow + currentStep（caller 不传身份）：`,
    `        1. 解析当前 step 定义 + 目标 step 定义（--step 或下一 step）`,
    `        2. 处理边界步骤钩子（旧 step after + 新 step before）：context.clear / prompt.inject_system 作为 events[] 带出（plugin-only）；prompt.inject 先执行——返回钩子自身 prompt 并提示再次 handover，checkpoint 记 pendingTransition，步骤不推进（data.status='hook_pending'）`,
    `        3. 无 prompt.inject 时：记录 step_advanced（from=oldStep, to=newStep），把新 step 任务文本作为 top-level prompt 字段返回`,
    `      末步时（nextStep 为 null）：记录 workflow_completed，归档 checkpoint 到 archive/，`,
    `      prompt 返回"工作流完成"文本，data.status='workflow_complete'。`,
    `    </behavior>`,
    `    <returns>`,
    `      ok=true; data.status:`,
    `        - 'step_advanced'      → 成功进入新 step；data.currentStep=新 step id；data.nextStep=下一 step id 或 null（末步提示再 handover 即完成）`,
    `        - 'hook_pending'       → 边界有 prompt.inject 钩子先执行：返回钩子 prompt（含"再次 handover"提醒），currentStep 不变；再次 handover 才推进`,
    `        - 'workflow_complete' → 末步再 handover；workflow 自然结束；currentStep=null；prompt 文本"工作流完成"`,
    `      ok=false; error.code:`,
    `        - 'NO_ACTIVE_WORKFLOW' → 无 active workflow；提示先 init`,
    `        - 'UNKNOWN_STEP'       → --step 指定的 id 在当前 workflow 中不存在`,
    `        - 'UNKNOWN_WORKFLOW'   → checkpoint 引用的 workflow 在 config 中已删除（stale config）`,
    `    </returns>`,
    `    <example><![CDATA[`,
    `$ aet workflow handover --output json`,
    `{`,
    `  "ok": true,`,
    `  "prompt": "## AET step handover\\n\\nWorkflow: Aet-Implement\\n\\nNext step:\\n- id: implement\\n- description: 按开发计划执行实现",`,
    `  "events": [`,
    `    {"id": "context.clear", "payload": {"reason": "step.clear: development_plan"}}`,
    `  ],`,
    `  "data": {`,
    `    "status": "step_advanced",`,
    `    "workflow": "implement",`,
    `    "workflowName": "Aet-Implement",`,
    `    "currentStep": "implement",`,
    `    "nextStep": "verify",`,
    `    "checkpointId": "ckpt_1738200000000_a1b2c3"`,
    `  }`,
    `}`,
    `]]></example>`,
    `  </tool>`,
  ].join('\n');
}

function buildAbortTool(): string {
  return [
    `  <tool name="aet-workflow-abort">`,
    `    <description>`,
    `      主动终止 active workflow（用户放弃，非自然完成）。`,
    `      归档 checkpoint 标 status='aborted'（与 completed 区分），可选 --reason 记入 history 供审计。`,
    `      终止后该 project root 不再有 active workflow，可以重新 init 启动新 workflow。`,
    `    </description>`,
    `    <syntax>aet workflow abort [--reason &lt;text&gt;] [--output json|prompt]</syntax>`,
    `    <parameters>`,
    `      <parameter name="--reason" type="string" required="false">`,
    `        人类可读的放弃原因，记入 checkpoint history 的 workflow_aborted 事件供审计追溯。`,
    `        推荐：简明描述为何放弃（"需求方向错了" / "用户取消" / "实现走偏需重来"）。`,
    `      </parameter>`,
    `      <parameter name="--output" type="enum" required="false" default="prompt">`,
    `        json | prompt — 输出编码模式`,
    `      </parameter>`,
    `    </parameters>`,
    `    <when-to-use>`,
    `      - 用户主动放弃当前 workflow（"做错了" / "换方向" / "不做了"）`,
    `      - workflow 走偏需要重来：先 abort 旧 active，再 init 启动新的`,
    `      - init 时遇到 intervention_required（已有 active 阻止新建）→ 先 abort 旧的`,
    `      - 切换 workflow 类型（如从 design 切到 bugfix）：先 abort 当前`,
    `    </when-to-use>`,
    `    <behavior>`,
    `      Core 从 .aet/core-checkpoint/ 读 active workflow：`,
    `        1. 记录 workflow_aborted + reason 到 checkpoint history`,
    `        2. 把 checkpoint 文件移到 .aet/core-checkpoint/archive/，status='aborted'`,
    `        3. 从 active index 移除该条目`,
    `        4. prepend 到 recentCompleted（capped 10），status='aborted' 与 completed 区分`,
    `      不 emit events[]（abort 是被动 CLI 返回；plugin 形态读取 data.status 释放 session）`,
    `    </behavior>`,
    `    <returns>`,
    `      ok=true; data.status:`,
    `        - 'workflow_aborted' → 终止成功；currentStep=null；nextStep=null；checkpointId=被归档的 id`,
    `      ok=false; error.code:`,
    `        - 'NO_ACTIVE_WORKFLOW' → 无 active 可终止；提示先 init 或用 status 查`,
    `    </returns>`,
    `    <example><![CDATA[`,
    `$ aet workflow abort --reason "需求方向错了，重来" --output json`,
    `{`,
    `  "ok": true,`,
    `  "prompt": "## Workflow aborted\\n\\n- workflow: design\\n- checkpoint: ckpt_1738200000000_a1b2c3\\n- reason: 需求方向错了，重来",`,
    `  "events": [],`,
    `  "data": {`,
    `    "status": "workflow_aborted",`,
    `    "workflow": "design",`,
    `    "workflowName": "Aet-Design",`,
    `    "currentStep": null,`,
    `    "nextStep": null,`,
    `    "checkpointId": "ckpt_1738200000000_a1b2c3"`,
    `  }`,
    `}`,
    `]]></example>`,
    `  </tool>`,
  ].join('\n');
}
