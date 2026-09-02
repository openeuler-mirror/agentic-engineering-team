// AET System Test - Unit Test: Root Cause Classification Logic
// 验证根因分类规则是否符合 AC-07 规范

import { describe, it } from 'node:test';
import assert from 'node:assert';

// 模拟根因分类函数
function classifyRootCause(scenario: {
  apiAcceptsParam?: boolean;
  apiIgnoresParam?: boolean;
  returnsAllData?: boolean;
  featureExists?: boolean;
  featureNotImplemented?: boolean;
  requirementAmbiguous?: boolean;
  requirementMissing?: boolean;
  implementationBug?: boolean;
}): string {
  // 决策树逻辑
  if (scenario.requirementAmbiguous || scenario.requirementMissing) {
    return 'CA-REQ';
  }
  if (scenario.apiAcceptsParam && (scenario.apiIgnoresParam || scenario.returnsAllData)) {
    return 'CA-CONTRACT';
  }
  if (scenario.featureNotImplemented || !scenario.featureExists) {
    return 'CA-IMPL';
  }
  if (scenario.implementationBug) {
    return 'CA-IMPL';
  }
  return 'UNKNOWN';
}

describe('Root Cause Classification', () => {
  it('AC-07: CA-CONTRACT - API accepts param but ignores it', () => {
    const result = classifyRootCause({
      apiAcceptsParam: true,
      apiIgnoresParam: true,
      returnsAllData: true
    });
    assert.strictEqual(result, 'CA-CONTRACT', 'Should classify as CA-CONTRACT');
  });

  it('AC-07: CA-CONTRACT - API returns all data (no-op)', () => {
    const result = classifyRootCause({
      apiAcceptsParam: true,
      returnsAllData: true
    });
    assert.strictEqual(result, 'CA-CONTRACT', 'Should classify as CA-CONTRACT');
  });

  it('AC-07: CA-IMPL - Feature not implemented', () => {
    const result = classifyRootCause({
      featureExists: false,
      featureNotImplemented: true
    });
    assert.strictEqual(result, 'CA-IMPL', 'Should classify as CA-IMPL');
  });

  it('AC-07: CA-IMPL - Implementation bug', () => {
    const result = classifyRootCause({
      featureExists: true,
      implementationBug: true
    });
    assert.strictEqual(result, 'CA-IMPL', 'Should classify as CA-IMPL');
  });

  it('AC-07: CA-REQ - Requirement ambiguous', () => {
    const result = classifyRootCause({
      requirementAmbiguous: true
    });
    assert.strictEqual(result, 'CA-REQ', 'Should classify as CA-REQ');
  });

  it('AC-07: CA-REQ - Requirement missing', () => {
    const result = classifyRootCause({
      requirementMissing: true
    });
    assert.strictEqual(result, 'CA-REQ', 'Should classify as CA-REQ');
  });

  it('Decision tree: CA-REQ takes priority over CA-CONTRACT', () => {
    const result = classifyRootCause({
      apiAcceptsParam: true,
      apiIgnoresParam: true,
      requirementAmbiguous: true
    });
    assert.strictEqual(result, 'CA-REQ', 'CA-REQ should have higher priority');
  });

  it('Decision tree: CA-CONTRACT takes priority over CA-IMPL', () => {
    const result = classifyRootCause({
      apiAcceptsParam: true,
      apiIgnoresParam: true,
      featureNotImplemented: true
    });
    assert.strictEqual(result, 'CA-CONTRACT', 'CA-CONTRACT should have higher priority than CA-IMPL');
  });

  it('Decision tree: All three root cause types should be covered', () => {
    const testCases = [
      { scenario: { apiAcceptsParam: true, apiIgnoresParam: true }, expected: 'CA-CONTRACT' },
      { scenario: { featureNotImplemented: true }, expected: 'CA-IMPL' },
      { scenario: { requirementAmbiguous: true }, expected: 'CA-REQ' }
    ];
    
    const rootCauses = new Set(testCases.map(tc => classifyRootCause(tc.scenario)));
    assert.ok(rootCauses.has('CA-CONTRACT'), 'Should have CA-CONTRACT');
    assert.ok(rootCauses.has('CA-IMPL'), 'Should have CA-IMPL');
    assert.ok(rootCauses.has('CA-REQ'), 'Should have CA-REQ');
    assert.strictEqual(rootCauses.size, 3, 'Should have all three root cause types');
  });
});
