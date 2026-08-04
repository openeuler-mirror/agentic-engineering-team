import { describe, it, expect } from 'vitest';
import { loadComponentChecklist, assembleChecklist } from './assemble-checklist';

describe('loadComponentChecklist', () => {
  it('returns the checklist metadata for a block-scalar checklist', () => {
    // Block-scalar: whole-string trim only, so first line loses indent, later
    // lines keep theirs (faithful to the original parser behavior).
    const result = loadComponentChecklist('__test__', 'intro');
    expect(result).toBe('- [ ] intro item 1\n  - [ ] intro item 2');
  });

  it('returns the checklist metadata for a scalar checklist', () => {
    expect(loadComponentChecklist('__test__', 'section')).toBe('Section checklist text');
  });

  it('returns null for a missing component', () => {
    expect(loadComponentChecklist('__test__', 'does-not-exist')).toBeNull();
  });
});

describe('assembleChecklist (integration via __test__ fixtures)', () => {
  it('inlines each component checklist into the checklist.md template', () => {
    const result = assembleChecklist('__test__');
    expect(result).toContain('Checklist:');
    expect(result).toContain('- [ ] intro item 1');
    expect(result).toContain('- [ ] intro item 2');
    expect(result).toContain('Section checklist text');
  });

  it('leaves no placeholders behind', () => {
    const result = assembleChecklist('__test__');
    expect(result).not.toContain('{{');
    expect(result).not.toContain('}}');
  });
});
