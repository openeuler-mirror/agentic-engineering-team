// AET System Test - Unit Test: Skill Structure Validation
// 验证 SKILL.md 结构是否符合 AC-09 规范

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';

describe('Skill Structure Validation', () => {
  const skillPath = '/root/agentic-engineering-team/skills/aet-system-test/SKILL.md';
  let skillContent: string;

  before(() => {
    skillContent = readFileSync(skillPath, 'utf-8');
  });

  it('AC-09: Skill should have I/O contract definition', () => {
    assert.ok(skillContent.includes('I/O Contract') || skillContent.includes('输入') || skillContent.includes('输出'), 
      'Skill should define I/O contract');
  });

  it('AC-09: Skill should accept three AET document paths', () => {
    assert.ok(skillContent.includes('requirements_doc') || skillContent.includes('需求') || skillContent.includes('RAS'),
      'Skill should accept requirements document');
    assert.ok(skillContent.includes('design_doc') || skillContent.includes('设计'),
      'Skill should accept design document');
    assert.ok(skillContent.includes('dev_plan_doc') || skillContent.includes('dev-plan'),
      'Skill should accept dev-plan document');
  });

  it('AC-09: Skill should output three ST artifacts', () => {
    assert.ok(skillContent.includes('test-cases') || skillContent.includes('用例集'),
      'Skill should output test cases');
    assert.ok(skillContent.includes('execution-results') || skillContent.includes('执行结果'),
      'Skill should output execution results');
    assert.ok(skillContent.includes('ST-REPORT') || skillContent.includes('ST报告'),
      'Skill should output ST report');
  });

  it('AC-10: Skill should define correct output paths', () => {
    assert.ok(skillContent.includes('ai_assistance/features/'),
      'Output path should follow ai_assistance/features/{feature-name}/ pattern');
  });

  it('Skill should have Phase 1-5 workflow', () => {
    assert.ok(skillContent.includes('Phase 1') || skillContent.includes('阶段1'),
      'Should have Phase 1');
    assert.ok(skillContent.includes('Phase 5') || skillContent.includes('阶段5'),
      'Should have Phase 5');
  });

  it('Skill should define root cause classification', () => {
    assert.ok(skillContent.includes('CA-CONTRACT') || skillContent.includes('接口契约偏移'),
      'Should define CA-CONTRACT');
    assert.ok(skillContent.includes('CA-IMPL') || skillContent.includes('实现缺陷'),
      'Should define CA-IMPL');
    assert.ok(skillContent.includes('CA-REQ') || skillContent.includes('需求模糊'),
      'Should define CA-REQ');
  });
});
