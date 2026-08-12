import { describe, expect, it } from 'vitest';
import {
  buildFileContent,
  mergeMetaFrontmatter,
  renderCommandSkillsBlock,
  renderFrontmatter,
  renderInitGuidance,
  renderStepsList,
  renderTemplate,
  serializeFrontmatter,
} from './templates.js';
import type { RenderContext, RenderStep } from './templates.js';

function ctx(overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    id: 'aet-design',
    kind: 'workflow',
    workflow: {
      name: 'Aet-Design',
      description: '设计工作流',
      steps: [
        { name: '需求分析', skills: ['aet-req-analysis'] },
        { name: '提交文档' },
      ] as RenderStep[],
    },
    hasPlugin: true,
    ...overrides,
  };
}

describe('renderTemplate', () => {
  it('substitutes known placeholders', () => {
    const c = ctx();
    const out = renderTemplate(
      '{{id}} | {{workflow.name}} | {{workflow.description}} | {{workflow.steps_count}}',
      c,
    );
    expect(out).toBe('aet-design | Aet-Design | 设计工作流 | 2');
  });

  it('leaves unknown placeholders intact (typos surface visibly)', () => {
    expect(renderTemplate('{{workflow.typo}} {{other}}', ctx())).toBe('{{workflow.typo}} {{other}}');
  });

  it('passes host-native tokens ($ARGUMENTS) through verbatim', () => {
    expect(renderTemplate('/aet-design $ARGUMENTS', ctx())).toBe('/aet-design $ARGUMENTS');
  });
});

describe('renderStepsList', () => {
  it('renders a numbered list with core skills', () => {
    const out = renderStepsList(ctx().workflow.steps!);
    expect(out).toContain('1. 需求分析（核心 skill: `aet-req-analysis`）');
    expect(out).toContain('2. 提交文档（核心 skill: 无）');
  });

  it('renders an empty-marker for no steps', () => {
    expect(renderStepsList([])).toBe('（无阶段）');
  });
});

describe('renderCommandSkillsBlock', () => {
  it('renders the core-skill line', () => {
    expect(renderCommandSkillsBlock(['a', 'b'])).toBe('核心 skill: `a`、`b`\n\n');
  });

  it('returns empty for no skills (routing command)', () => {
    expect(renderCommandSkillsBlock([])).toBe('');
  });
});

describe('renderInitGuidance', () => {
  it('renders empty when the host has a plugin', () => {
    expect(renderInitGuidance(ctx({ hasPlugin: true }))).toBe('');
  });

  it('renders a self-init directive when no plugin', () => {
    const out = renderInitGuidance(ctx({ hasPlugin: false }));
    expect(out).toContain('aet workflow init --name aet-design --argument "<原始需求>"');
    expect(out).toContain('aet workflow handover');
  });
});

describe('mergeMetaFrontmatter', () => {
  it('returns base untouched when meta absent', () => {
    expect(mergeMetaFrontmatter({ description: 'x' })).toEqual({ description: 'x' });
  });

  it('decorates bare argument-hint names into [name] form', () => {
    const out = mergeMetaFrontmatter({ description: 'x' }, { 'argument-hint': ['issue-number', 'priority'] });
    expect(out['argument-hint']).toBe('[issue-number] [priority]');
  });

  it('drops empty argument-hint lists', () => {
    const out = mergeMetaFrontmatter({}, { 'argument-hint': [] });
    expect(out['argument-hint']).toBeUndefined();
  });

  it('copies effort and allowed-tools', () => {
    const out = mergeMetaFrontmatter({}, { effort: 'low', 'allowed-tools': 'Read Grep' });
    expect(out['effort']).toBe('low');
    expect(out['allowed-tools']).toBe('Read Grep');
  });
});

describe('serializeFrontmatter', () => {
  it('renders single-line values inline', () => {
    expect(serializeFrontmatter({ description: 'hello' })).toBe('description: hello');
  });

  it('renders multi-line values as a block scalar', () => {
    const out = serializeFrontmatter({ description: 'line1\nline2' });
    expect(out).toBe('description: |\n  line1\n  line2');
  });
});

describe('renderFrontmatter', () => {
  it('runs template substitution on every value', () => {
    const out = renderFrontmatter({ description: '{{workflow.description}}' }, ctx());
    expect(out.description).toBe('设计工作流');
  });
});

describe('buildFileContent', () => {
  it('assembles fenced frontmatter + blank line + body', () => {
    const out = buildFileContent({ description: 'desc', 'disable-model-invocation': 'true' }, 'body {{id}}', ctx());
    expect(out).toBe('---\ndescription: desc\ndisable-model-invocation: true\n---\n\nbody aet-design\n');
  });
});