/**
 * @file src/cli/commands/plugin/templates.ts
 *
 * Layer 3 — `aet plugin init` template rendering.
 *
 * Placeholder substitution + YAML frontmatter serialization. Borrows
 * spec-kit's `process_template` model (a substitution pipeline over a
 * declarative template) but is far simpler: AET needs a handful of
 * placeholders (`{{id}}`, `{{workflow.name}}`, `{{workflow.description}}`,
 * `{{workflow.steps_count}}`, `{{workflow.steps_list}}`, `{{command.name}}`,
 * `{{command.description}}`, `{{command.prompt}}`, `{{command.skills_list}}`,
 * `{{init_guidance}}`)
 * plus pass-through of host-native tokens like `$ARGUMENTS`.
 */

// ---------------------------------------------------------------------------
// Render context
// ---------------------------------------------------------------------------

/** A step as surfaced to template rendering — name + its core skills. */
export interface RenderStep {
  name: string;
  skills?: string[];
}

export interface RenderContext {
  /** Workflow/command id (e.g. `design`). */
  id: string;
  /** Whether this entry is a multi-stage workflow or a single-dispatch command. */
  kind: 'workflow' | 'command';
  /** Workflow display name (e.g. `Aet-Design`). */
  workflow: {
    name: string;
    description: string;
    /** Ordered steps (for overview rendering). Empty array = no steps. */
    steps: RenderStep[];
  };
  /** Command entry context — set only when `kind === 'command'`. */
  command?: {
    name: string;
    description: string;
    /**
     * The command's concrete execution body. Falls back to `description`
     * when the config omits `prompt` (see {@link CommandDefinition.prompt}).
     */
    prompt: string;
    /** Core skill ids (the "核心 skill" line); empty = routing-type command. */
    skills: string[];
  };
  /**
   * Whether the host ships an AET plugin that handles workflow init +
   * handover automatically. When `true`, `{{init_guidance}}` renders empty
   * (the plugin drives startup); when `false`, it renders an imperative
   * directive telling the agent to call `aet workflow init` via bash.
   */
  hasPlugin: boolean;
  /**
   * Optional frontmatter metadata (effort / allowed-tools / argument-hint)
   * sourced from the workflow/command config entry. The generator merges
   * these into the agent's frontmatter map (only non-empty values) before
   * serialization — they surface verbatim as CC/OC frontmatter keys, letting
   * config authors override the session effort level, pre-approve tools, or
   * declare a slash-command argument hint per entry. Default empty/absent.
   */
  metaFrontmatter?: FrontmatterMeta;
}

/**
 * Optional frontmatter metadata carried per workflow/command entry. Keys
 * mirror the Claude Code frontmatter field names (per ctx7 docs):
 * `effort` (low|medium|high|xhigh|max), `allowed-tools` (tool allowlist),
 * `argument-hint` (slash-command argument hint, a list at the config layer
 * so each positional arg is discrete). All optional; empty values are
 * dropped by the generator rather than rendered.
 *
 * `argument-hint` is a list at the config layer — each element is a BARE
 * positional-argument name (e.g. `["issue-number", "priority"]`), so the
 * workflow engine can lift the declared argument names into a checkpoint
 * without stripping CC-syntax noise. CC's `argument-hint` frontmatter field
 * accepts a single string and uses the `[name]` placeholder convention
 * (per ctx7 agent-sdk docs: `[issue-number] [priority]`), so
 * {@link mergeMetaFrontmatter} wraps each bare name in `[...]` and joins
 * with single spaces at render time. The list→string + `[...]` decoration
 * is a render-time concern only — upstream consumers keep the bare-name
 * list shape.
 */
export interface FrontmatterMeta {
  effort?: string;
  'allowed-tools'?: string;
  'argument-hint'?: string[];
}

// ---------------------------------------------------------------------------
// Placeholder substitution
// ---------------------------------------------------------------------------

/**
 * Render the steps list as a markdown numbered list, one entry per step,
 * annotated with the step's core skill(s). Steps with no skill show `无`:
 *
 *   1. 需求分析（核心 skill: `aet-req-analysis`）
 *   2. 提交文档（核心 skill: 无）
 *
 * Multiple skills join with `、`. An empty steps array renders as `（无阶段）`.
 */
export function renderStepsList(steps: RenderStep[]): string {
  if (steps.length === 0) return '（无阶段）';
  return steps
    .map((step, i) => {
      const skills = step.skills?.filter((s) => s.length) ?? [];
      const skillPart =
        skills.length > 0
          ? skills.map((s) => `\`${s}\``).join('、')
          : '无';
      return `${i + 1}. ${step.name}（核心 skill: ${skillPart}）`;
    })
    .join('\n');
}

/**
 * Render the command's core-skill line. Commands are single-dispatch entries
 * with no lifecycle — the generated file must be self-contained, so the skill
 * is declared up front: `核心 skill: \`a\`、\`b\`\n\n`. Routing-type commands
 * without a core skill render `''` (nothing), leaving just the description.
 */
export function renderCommandSkillsBlock(skills: string[]): string {
  const filtered = skills?.filter((s) => s.length) ?? [];
  if (filtered.length === 0) return '';
  return `核心 skill: ${filtered.map((s) => `\`${s}\``).join('、')}\n\n`;
}

/**
 * Render the init-guidance block — an imperative directive telling the
 * agent to start the workflow via bash right now. Suppressed (returns `''`)
 * when the host has an AET plugin (`ctx.hasPlugin === true`), because the
 * plugin intercepts the trigger and runs `aet workflow init` + `handover`
 * itself; surfacing the directive in that case would be redundant noise.
 *
 * The two-step flow (`init` then `handover`) is used per the AGENTS.md
 * contract: `init` creates the checkpoint (`workflow_started`), then
 * `handover` enters step 1 (`step_advanced` + task prompt injection).
 *
 * The `init` command carries `--argument "<原始需求>"` so the user's
 * initial-requirement description is captured into the checkpoint and can
 * be re-injected by `workflow.continue` on resume. The agent substitutes
 * the placeholder with the user's actual requirement text.
 */
export function renderInitGuidance(ctx: RenderContext): string {
  if (ctx.hasPlugin) return '';
  const id = ctx.id;
  return [
    '## 启动工作流',
    '',
    '请立即通过 bash 执行以下命令初始化本工作流（将 `<原始需求>` 替换为用户输入的初始需求描述）：',
    '',
    '```',
    `aet workflow init --name ${id} --argument "<原始需求>"`,
    '```',
    '',
    '收到 `workflow_started` 响应后，执行以下命令进入第一阶段：',
    '',
    '```',
    'aet workflow handover',
    '```',
    '',
    '后续每次执行 `aet workflow handover` 会注入下一阶段的任务 prompt，请遵照执行。'
      + '每完成一个阶段，再次执行 `aet workflow handover` 进入下一阶段，直到工作流完成。',
  ].join('\n');
}

/**
 * Replace AET placeholders in a template string. Only `{{...}}` tokens are
 * touched — host-native tokens (e.g. `$ARGUMENTS`) pass through verbatim.
 * `$ARGUMENTS` is kept as CC's catch-all (the full raw arg blob) because
 * positional `$0`/`$1`/… split args on whitespace and cannot represent a
 * single argument containing spaces; `$ARGUMENTS` preserves them intact.
 * Unknown `{{...}}` tokens are left as-is (so a typo surfaces visibly
 * rather than silently producing empty output).
 */
export function renderTemplate(tpl: string, ctx: RenderContext): string {
  return tpl
    .replaceAll('{{id}}', ctx.id)
    .replaceAll('{{workflow.name}}', ctx.workflow.name)
    .replaceAll('{{workflow.description}}', ctx.workflow.description)
    .replaceAll('{{workflow.steps_count}}', String(ctx.workflow.steps.length))
    .replaceAll('{{workflow.steps_list}}', renderStepsList(ctx.workflow.steps))
    .replaceAll('{{command.name}}', ctx.command?.name ?? '')
    .replaceAll('{{command.description}}', ctx.command?.description ?? '')
    .replaceAll('{{command.prompt}}', ctx.command?.prompt ?? '')
    .replaceAll('{{command.skills_list}}', renderCommandSkillsBlock(ctx.command?.skills ?? []))
    .replaceAll('{{init_guidance}}', renderInitGuidance(ctx));
}

/** Render every value of a frontmatter map. */
export function renderFrontmatter(
  fm: Record<string, string>,
  ctx: RenderContext,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fm)) {
    out[k] = renderTemplate(v, ctx);
  }
  return out;
}

/**
 * Merge a workflow/command's optional frontmatter metadata (effort /
 * allowed-tools / argument-hint) into a copy of the agent's base frontmatter
 * map. Only non-empty values are written — empty strings and empty arrays
 * are dropped so the serialized frontmatter stays clean when the config
 * author leaves a field at its default. Returns the base map untouched when
 * `meta` is absent.
 *
 * `argument-hint` is a list of BARE positional-argument names at the config
 * layer (e.g. `["issue-number", "priority"]`), so the workflow engine can
 * lift the declared names into a checkpoint without CC-syntax noise. CC's
 * `argument-hint` frontmatter field accepts a single string using the
 * `[name]` placeholder convention (ctx7 agent-sdk docs: `[issue-number]
 * [priority]`), so each bare name is wrapped in `[...]` and the list is
 * joined with single spaces here — `["a", "b"]` → `"[a] [b]"`. The
 * decoration + list→string conversion lives HERE (the render boundary),
 * not in the config type, so upstream consumers keep the bare-name list.
 *
 * This runs BEFORE {@link serializeFrontmatter}, so the merged keys flow
 * through the normal single-line vs block-scalar serialization path (these
 * three fields are always single-line, but the path is shared).
 */
export function mergeMetaFrontmatter(
  base: Record<string, string>,
  meta?: FrontmatterMeta,
): Record<string, string> {
  if (!meta) return base;
  const out: Record<string, string> = { ...base };
  if (meta.effort) out['effort'] = meta.effort;
  if (meta['allowed-tools']) out['allowed-tools'] = meta['allowed-tools'];
  // argument-hint: bare-name list → single space-joined "[name] [...]"
  // string for CC frontmatter (ctx7 agent-sdk placeholder convention).
  // Guard against non-array input (e.g. a stale global config that predates
  // the list migration and carries a legacy string "") — treat it as empty
  // rather than throwing, so a stale ~/.aet/config/workflow.json never
  // breaks `aet plugin init`.
  const raw = meta['argument-hint'];
  const argHint =
    Array.isArray(raw) ? raw.filter((s) => s.length) : [];
  if (argHint.length > 0) {
    out['argument-hint'] = argHint.map((name) => `[${name}]`).join(' ');
  }
  return out;
}

// ---------------------------------------------------------------------------
// YAML frontmatter serialization
// ---------------------------------------------------------------------------

/**
 * Serialize a key→string frontmatter map to YAML. Single-line values use
 * inline `key: value`; multi-line values use block-scalar `key: |` form
 * (required for OpenCode skill `description`, which carries trigger
 * phrases across lines). Minimal hand-rolled serializer — AET frontmatter
 * values are plain strings (no nesting, no quoting needed beyond basic
 * colon/newline handling).
 */
export function serializeFrontmatter(fm: Record<string, string>): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(fm)) {
    if (v.includes('\n')) {
      // Block scalar: `key: |` then each line indented 2 spaces.
      lines.push(`${k}: |`);
      for (const line of v.split('\n')) {
        lines.push(`  ${line}`);
      }
    } else {
      lines.push(`${k}: ${v}`);
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Full file content assembly
// ---------------------------------------------------------------------------

/**
 * Assemble the complete file content for an agent adapter: YAML
 * frontmatter delimited by `---` fences, then a blank line, then the body.
 * Both `markdown-flat` and `markdown-skill` use the same shape (they
 * differ only in filename + destDir + body content — see default_agents.ts).
 *
 * `frontmatter`/`body` are passed explicitly so the generator can pick the
 * workflow template (`entry.frontmatter`/`entry.body`) or the command
 * template (`entry.commandFrontmatter`/`entry.commandBody`) per entry kind.
 */
export function buildFileContent(
  frontmatter: Record<string, string>,
  body: string,
  ctx: RenderContext,
): string {
  const fm = serializeFrontmatter(renderFrontmatter(frontmatter, ctx));
  const renderedBody = renderTemplate(body, ctx);
  return `---\n${fm}\n---\n\n${renderedBody}\n`;
}

