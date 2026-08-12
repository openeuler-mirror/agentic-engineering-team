import { describe, expect, it } from 'vitest';
import { plugin } from './aet-tools.js';

describe('aet-tools context plugin', () => {
  it('declares name + description', () => {
    expect(plugin.name).toBe('aet-tools');
    expect(plugin.description.length).toBeGreaterThan(0);
  });

  it('ignores the root argument and emits the aet-tools XML block', () => {
    const xml = plugin.run('/does/not/exist');
    expect(xml).toContain('<aet-tools>');
    expect(xml).toContain('</aet-tools>');
  });

  it('documents the three lifecycle tools', () => {
    const xml = plugin.run('/anything');
    expect(xml).toContain('<tool name="aet-workflow-status">');
    expect(xml).toContain('<tool name="aet-workflow-handover">');
    expect(xml).toContain('<tool name="aet-workflow-abort">');
  });

  it('lists related commands and embeds JSON examples in CDATA', () => {
    const xml = plugin.run('/anything');
    expect(xml).toContain('<related-commands>');
    expect(xml).toContain('<![CDATA[');
    expect(xml).toContain(']]></example>');
    expect(xml).toContain('<related-commands>');
    expect(xml).toContain('aet workflow init');
  });
});