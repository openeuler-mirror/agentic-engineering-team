/**
 * Direct unit tests for util.ts shared utilities.
 *
 * Gap 2 of testability audit: frontmatter/heading/comment-strip functions
 * were only covered INDIRECTLY through template.test.ts / library.test.ts.
 * The stripHtmlComments nesting bug went undetected precisely because there
 * was no direct test — the indirect tests used simple non-nested inputs.
 *
 * This file covers each function's contract directly, including edge cases
 * and the INTENTIONAL DIVERGENCE semantics documented in util.ts (which
 * differ from template.ts's byte-locked implementations).
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseFrontmatter,
  adjustHeadingLevel,
  addSectionNumbers,
  stripHtmlComments,
  skillRoot,
} from './util';

/* ----------------------------------------------------------- parseFrontmatter */

describe('parseFrontmatter', () => {
  it('returns empty metadata when no frontmatter present', () => {
    const r = parseFrontmatter('Hello world');
    expect(r.metadata).toEqual({});
    expect(r.body).toBe('Hello world');
  });

  it('parses simple key:value pairs', () => {
    const r = parseFrontmatter('---\nname: test\nversion: 1\n---\nBody');
    expect(r.metadata).toEqual({ name: 'test', version: '1' });
    expect(r.body).toBe('Body');
  });

  it('strips surrounding double quotes', () => {
    const r = parseFrontmatter('---\ntitle: "Hello"\n---\nBody');
    expect(r.metadata.title).toBe('Hello');
  });

  it('strips surrounding single quotes', () => {
    const r = parseFrontmatter("---\ntitle: 'Hello'\n---\nBody");
    expect(r.metadata.title).toBe('Hello');
  });

  it('handles block scalar | (literal)', () => {
    const fm = '---\ndescription: |\n  Line 1\n  Line 2\n---\nBody';
    const r = parseFrontmatter(fm);
    expect(r.metadata.description).toBe('Line 1\nLine 2');
  });

  it('handles block scalar > (folded)', () => {
    const fm = '---\ndescription: >\n  Line 1\n  Line 2\n---\nBody';
    const r = parseFrontmatter(fm);
    expect(r.metadata.description).toBe('Line 1\nLine 2');
  });

  it('lenient fallback: block scalar with flush-left (non-YAML) content is still read', () => {
    // Real-world regression: component files shipped `checklist: |` followed
    // by unindented content. Strict parsing yields an empty block; the parser
    // must fall back to collecting until the next flush-left `key:` line.
    const fm = '---\nheading_level: 2\nchecklist: |\n**Title**\n\n1. Item one\n   - Detail\n---\n## Body';
    const r = parseFrontmatter(fm);
    expect(r.metadata.heading_level).toBe('2');
    expect(r.metadata.checklist).toBe('**Title**\n\n1. Item one\n - Detail');
    expect(r.body).toBe('## Body');
  });

  it('lenient fallback stops at the next flush-left key line', () => {
    const fm = '---\nchecklist: |\nFree text\nother_key: value\n---\nBody';
    const r = parseFrontmatter(fm);
    expect(r.metadata.checklist).toBe('Free text');
    expect(r.metadata.other_key).toBe('value');
  });

  it('lenient fallback keeps lines starting with # or - (not treated as keys)', () => {
    const fm = '---\nchecklist: |\n# Heading\n- item\n---\nBody';
    const r = parseFrontmatter(fm);
    expect(r.metadata.checklist).toBe('# Heading\n- item');
  });

  it('skips lines without colon', () => {
    const r = parseFrontmatter('---\nnoColon\nkey: val\n---\nBody');
    expect(r.metadata).toEqual({ key: 'val' });
  });

  it('skips empty lines in frontmatter', () => {
    const r = parseFrontmatter('---\n\nkey: val\n\n---\nBody');
    expect(r.metadata).toEqual({ key: 'val' });
  });

  it('leaves body UNtrimmed (intentional divergence from template.ts)', () => {
    // template.ts trims the body; util.ts does NOT — documented divergence.
    const r = parseFrontmatter('---\nkey: val\n---\n\n\nBody with leading newlines');
    expect(r.body.startsWith('\n')).toBe(true);
  });

  it('handles empty frontmatter block (with blank line between delimiters)', () => {
    // The regex /^---\n([\s\S]*?)\n---\n?/ requires \n before closing ---,
    // so `---\n---\nBody` does NOT parse (no \n between delimiters).
    // Use `---\n\n---\nBody` (blank line) for an empty frontmatter block.
    const r = parseFrontmatter('---\n\n---\nBody');
    expect(r.metadata).toEqual({});
    expect(r.body).toBe('Body');
  });

  it('handles content with only frontmatter (no body)', () => {
    const r = parseFrontmatter('---\nkey: val\n---\n');
    expect(r.metadata).toEqual({ key: 'val' });
    expect(r.body).toBe('');
  });
});

/* -------------------------------------------------------- adjustHeadingLevel */

describe('adjustHeadingLevel', () => {
  it('returns content unchanged when diff is 0', () => {
    const md = '## Title\n\nText';
    expect(adjustHeadingLevel(md, 2, 2)).toBe(md);
  });

  it('shifts headings up by 1', () => {
    expect(adjustHeadingLevel('## Title\n### Sub', 2, 3))
      .toBe('### Title\n#### Sub');
  });

  it('shifts headings down by 1', () => {
    expect(adjustHeadingLevel('### Title\n#### Sub', 3, 2))
      .toBe('## Title\n### Sub');
  });

  it('clamps to level 1 (minimum)', () => {
    expect(adjustHeadingLevel('## Title', 2, 0)).toBe('# Title');
  });

  it('clamps to level 6 (maximum)', () => {
    expect(adjustHeadingLevel('## Title', 2, 10)).toBe('###### Title');
  });

  it('normalizes tab separator to space (same as template.ts)', () => {
    // The regex \s matches tab, but the replacement uses ' ' (space).
    // JSDoc claims "preserving the original separator" but the code actually
    // normalizes to space — same behavior as template.ts for this input.
    expect(adjustHeadingLevel('##\tTitle', 2, 3)).toBe('### Title');
  });

  it('does not affect non-ATX headings (no space after #)', () => {
    const md = '##NoSpace';
    expect(adjustHeadingLevel(md, 2, 3)).toBe(md);
  });

  it('handles content with no headings', () => {
    const md = 'Just text\n\nMore text';
    expect(adjustHeadingLevel(md, 2, 3)).toBe(md);
  });

  it('affects all heading levels simultaneously (not just fromLevel)', () => {
    // The function shifts ALL headings by diff, not just headings at fromLevel.
    expect(adjustHeadingLevel('# H1\n## H2\n### H3', 2, 3))
      .toBe('## H1\n### H2\n#### H3');
  });
});

/* ---------------------------------------------------------- addSectionNumbers */

describe('addSectionNumbers', () => {
  it('numbers H1 as section N', () => {
    // INTENTIONAL DIVERGENCE: util.ts numbers H1; template.ts skips H1.
    expect(addSectionNumbers('# Title')).toBe('# §1 Title');
  });

  it('numbers H2 as section N (same counter as H1)', () => {
    expect(addSectionNumbers('## Title')).toBe('## §1 Title');
  });

  it('numbers H3 as N.M (sub-counter)', () => {
    expect(addSectionNumbers('# Top\n### Sub'))
      .toBe('# §1 Top\n### §1.1 Sub');
  });

  it('numbers H4 as N.M.K (sub-sub-counter)', () => {
    expect(addSectionNumbers('# Top\n### Sub\n#### SubSub'))
      .toBe('# §1 Top\n### §1.1 Sub\n#### §1.1.1 SubSub');
  });

  it('skips headings already starting with the section sign character', () => {
    // The skip check uses /^[§§]/ which tests for the actual § character.
    const md = '# §1 Already numbered';
    expect(addSectionNumbers(md)).toBe(md);
  });

  it('skips headings already starting with a number + space', () => {
    // The skip check /^\d+(\.\d+)*\s/ requires digit(s) + optional .digit + space.
    // `1. Already` does NOT match (dot not followed by digit).
    // `1 Already` DOES match.
    const md = '# 1 Already';
    expect(addSectionNumbers(md)).toBe(md);
  });

  it('skips headings starting with dotted number + space', () => {
    const md = '# 1.2 Already';
    expect(addSectionNumbers(md)).toBe(md);
  });

  it('does not number H5/H6 (returns unchanged)', () => {
    const md = '##### Title\n###### Title';
    expect(addSectionNumbers(md)).toBe(md);
  });

  it('resets counters per top-level section', () => {
    expect(addSectionNumbers('# A\n### x\n# B\n### y'))
      .toBe('# §1 A\n### §1.1 x\n# §2 B\n### §2.1 y');
  });

  it('handles content with no headings', () => {
    expect(addSectionNumbers('Just text')).toBe('Just text');
  });
});

/* ---------------------------------------------------------- stripHtmlComments */

describe('stripHtmlComments', () => {
  it('returns text unchanged when no comments present', () => {
    expect(stripHtmlComments('Hello world')).toBe('Hello world');
  });

  it('removes a simple comment', () => {
    expect(stripHtmlComments('a<!-- comment -->b')).toBe('ab');
  });

  it('handles nested comments (the bug that was fixed)', () => {
    // OLD regex-iterative implementation left ` c -->`.
    // The depth-counter implementation correctly collapses to ''.
    expect(stripHtmlComments('<!-- a <!-- b --> c -->')).toBe('');
  });

  it('handles deeply nested comments', () => {
    expect(stripHtmlComments('<!-- <!-- <!-- x --> --> -->')).toBe('');
  });

  it('handles adjacent comments', () => {
    expect(stripHtmlComments('<!-- a --><!-- b -->')).toBe('');
  });

  it('preserves text between comments', () => {
    expect(stripHtmlComments('a<!-- x -->b<!-- y -->c')).toBe('abc');
  });

  it('handles unclosed comment (consumes to end)', () => {
    expect(stripHtmlComments('a<!-- unclosed')).toBe('a');
  });

  it('handles empty comment', () => {
    expect(stripHtmlComments('a<!---->b')).toBe('ab');
  });

  it('handles multiline content with comments', () => {
    const input = 'Line 1\n<!-- comment\nspanning lines\n-->\nLine 2';
    expect(stripHtmlComments(input)).toBe('Line 1\n\nLine 2');
  });
});

/* ----------------------------------------------------------------- skillRoot */

describe('skillRoot', () => {
  it('returns a valid directory containing SKILL.md', () => {
    // In vitest (source mode), skillRoot resolves two levels up from
    // scripts/src/util.ts → skills/aet-design-env/.
    const root = skillRoot();
    expect(root).toBeTruthy();
    expect(existsSync(join(root, 'SKILL.md'))).toBe(true);
  });
});
