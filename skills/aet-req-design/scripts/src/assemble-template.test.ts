import { describe, it, expect } from 'vitest';
import {
  stripHtmlComments,
  parseFrontmatter,
  adjustHeadingLevel,
  addSectionNumbers,
  validateHeadingLevel,
  validateTargetLevel,
  getCurrentTime,
  assembleTemplate,
} from './assemble-template';

describe('stripHtmlComments', () => {
  it('leaves plain text unchanged', () => {
    expect(stripHtmlComments('hello world')).toBe('hello world');
  });

  it('removes a single comment', () => {
    expect(stripHtmlComments('a<!-- comment -->b')).toBe('ab');
  });

  it('removes nested comments', () => {
    expect(stripHtmlComments('a<!-- outer <!-- inner --> still outer -->b')).toBe('ab');
  });

  it('handles comments spanning newlines', () => {
    expect(stripHtmlComments('x<!-- line1\nline2 -->y')).toBe('xy');
  });

  it('returns empty for comment-only content', () => {
    expect(stripHtmlComments('<!-- only a comment -->')).toBe('');
  });
});

describe('parseFrontmatter', () => {
  it('returns empty metadata when no frontmatter', () => {
    const result = parseFrontmatter('just body text');
    expect(result.metadata).toEqual({});
    expect(result.body).toBe('just body text');
  });

  it('parses simple key:value pairs', () => {
    const result = parseFrontmatter('---\nkey: value\nfoo: bar\n---\nbody');
    expect(result.metadata.key).toBe('value');
    expect(result.metadata.foo).toBe('bar');
    expect(result.body).toBe('body');
  });

  it('parses block scalar (|) value — whole-string trim (outer indent only)', () => {
    // Block-scalar lines are joined preserving per-line indent, then only the
    // outer string is trimmed, so the first line loses its indent but later
    // lines keep theirs (faithful to the original parser behavior).
    const result = parseFrontmatter('---\nkey: |\n  line1\n  line2\n---\nbody');
    expect(result.metadata.key).toBe('line1\n  line2');
    expect(result.body).toBe('body');
  });

  it('handles value containing colons', () => {
    const result = parseFrontmatter('---\nurl: https://example.com\n---\nbody');
    expect(result.metadata.url).toBe('https://example.com');
  });

  it('trims body', () => {
    const result = parseFrontmatter('---\nkey: val\n---\n\n  body with spaces  \n');
    expect(result.body).toBe('body with spaces');
  });
});

describe('adjustHeadingLevel', () => {
  it('returns unchanged when fromLevel === toLevel', () => {
    expect(adjustHeadingLevel('## hi', 2, 2)).toBe('## hi');
  });

  it('increases heading levels by the diff', () => {
    expect(adjustHeadingLevel('## hi', 2, 4)).toBe('#### hi');
  });

  it('decreases heading levels by the diff', () => {
    expect(adjustHeadingLevel('#### hi', 4, 2)).toBe('## hi');
  });

  it('clamps to minimum level 1', () => {
    expect(adjustHeadingLevel('## hi', 4, 1)).toBe('# hi');
  });

  it('clamps to maximum level 6', () => {
    expect(adjustHeadingLevel('###### hi', 1, 4)).toBe('###### hi');
  });

  it('leaves non-heading lines untouched', () => {
    expect(adjustHeadingLevel('plain text\n## hi', 2, 4)).toBe('plain text\n#### hi');
  });
});

describe('addSectionNumbers', () => {
  it('numbers a single H2 with §N', () => {
    expect(addSectionNumbers('## Title')).toBe('## §1 Title');
  });

  it('numbers nested H2/H3/H4', () => {
    expect(addSectionNumbers('## A\n### B\n#### C')).toBe('## §1 A\n### 1.1 B\n#### 1.1.1 C');
  });

  it('resets sub-counters on new H2', () => {
    expect(addSectionNumbers('## A\n### B\n## C')).toBe('## §1 A\n### 1.1 B\n## §2 C');
  });

  it('leaves H1 untouched', () => {
    expect(addSectionNumbers('# Title\n## A')).toBe('# Title\n## §1 A');
  });

  it('leaves H5+ untouched', () => {
    expect(addSectionNumbers('##### note')).toBe('##### note');
  });
});

describe('validateHeadingLevel', () => {
  it('defaults to 2 when undefined', () => {
    expect(validateHeadingLevel(undefined, 'c')).toBe(2);
  });

  it('passes through valid levels 0-6', () => {
    expect(validateHeadingLevel('0', 'c')).toBe(0);
    expect(validateHeadingLevel('3', 'c')).toBe(3);
    expect(validateHeadingLevel('6', 'c')).toBe(6);
  });

  it('defaults to 2 on non-numeric', () => {
    expect(validateHeadingLevel('abc', 'c')).toBe(2);
  });

  it('defaults to 2 when out of range (0-6)', () => {
    expect(validateHeadingLevel('-1', 'c')).toBe(2);
    expect(validateHeadingLevel('7', 'c')).toBe(2);
  });
});

describe('validateTargetLevel', () => {
  it('returns null when undefined', () => {
    expect(validateTargetLevel(undefined, 'c')).toBeNull();
  });

  it('passes through valid levels 1-6', () => {
    expect(validateTargetLevel('1', 'c')).toBe(1);
    expect(validateTargetLevel('6', 'c')).toBe(6);
  });

  it('returns null on non-numeric', () => {
    expect(validateTargetLevel('abc', 'c')).toBeNull();
  });

  it('returns null when out of range (1-6)', () => {
    expect(validateTargetLevel('0', 'c')).toBeNull();
    expect(validateTargetLevel('7', 'c')).toBeNull();
  });
});

describe('getCurrentTime', () => {
  it('matches the expected format', () => {
    expect(getCurrentTime()).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \(UTC[+-]\d+(\.\d+)?\)$/);
  });
});

describe('assembleTemplate (integration via __test__ fixtures)', () => {
  const result = assembleTemplate('__test__');

  it('prepends metadata block with version', () => {
    expect(result).toContain('version: 1.0');
  });

  it('auto-fills update_time in the expected format', () => {
    expect(result).toMatch(/update_time: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} \(UTC[+-]\d+(\.\d+)?\)/);
  });

  it('inlines intro component at level 2 with section number', () => {
    expect(result).toContain('## §1 Introduction');
    expect(result).toContain('This is the intro.');
  });

  it('inlines section component adjusted to level 3 with sub-number', () => {
    expect(result).toContain('### 1.1 Section');
    expect(result).toContain('Section body.');
  });
});
