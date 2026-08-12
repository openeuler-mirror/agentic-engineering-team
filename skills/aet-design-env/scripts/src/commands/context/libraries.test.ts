/**
 * UT for the independent library-probe plugins:
 *   - scenario-library.ts
 *   - function-library.ts
 *   - sdr-library.ts
 *   - fmea-library.ts
 *
 * These three plugins are intentionally NOT abstracted into a shared
 * factory — each plugin implements its own run() and emits an instruction
 * whose content is tailored to that library's semantics. These tests
 * pin the per-existence field-shape contract AND the per-library
 * instruction customization:
 *
 *   - exists=true  : <exists>true</exists> + <path>{abs}</path> +
 *                    <instruction>(forbid direct read + library subcommand
 *                    + library-specific semantic clause)
 *   - exists=false : <exists>false</exists> + <instruction>(degrade +
 *                    keep working without this library + do NOT read
 *                    .aet/*.yml + relative path for future creation) —
 *                    NO <path> emitted, NO library subcommand reference
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { plugin as scenarioPlugin } from './scenario-library';
import { plugin as functionPlugin } from './function-library';
import { plugin as sdrPlugin } from './sdr-library';
import { plugin as fmeaPlugin } from './fmea-library';

function makeTmpRoot(): string {
  return mkdtempSync(join(tmpdir(), 'aet-lib-ut-'));
}

function placeYaml(root: string, filename: string, body = 'type: x\n'): string {
  const aetDir = join(root, '.aet');
  mkdirSync(aetDir, { recursive: true });
  const p = join(aetDir, filename);
  writeFileSync(p, body);
  return p;
}

describe('scenario-library plugin', () => {
  let root: string;
  beforeEach(() => { root = makeTmpRoot(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('exposes name/description', () => {
    expect(scenarioPlugin.name).toBe('scenario-lib');
    expect(scenarioPlugin.description).toContain('scenario_library.yml');
  });

  it('exists=true: emits <path> + forbids direct read + 专用脚本 + 场景库 semantic clause', () => {
    const abs = placeYaml(root, 'scenario_library.yml');
    const out = scenarioPlugin.run(root)!;
    expect(out).toContain('<scenario-library>');
    expect(out).toMatch(/<exists>true<\/exists>/);
    expect(out).toContain(`<path>${abs}</path>`);
    expect(out).toContain('禁止直接读取');
    // Current instruction references "专用脚本" (not the legacy
    // `aet-design-env.mjs library` subcommand form).
    expect(out).toContain('专用脚本');
    expect(out).not.toContain('aet-design-env.mjs library');
    // Library-specific semantic clause — NOT a generic template
    expect(out).toContain('场景库');
    expect(out).toContain('业务操作场景');
  });

  it('exists=false: NO <path>, degrade directive, NO library subcommand reference', () => {
    const out = scenarioPlugin.run(root)!;
    expect(out).toMatch(/<exists>false<\/exists>/);
    expect(out).not.toContain('<path>');
    // Current instruction: library semantic clause + "未提供" notice.
    expect(out).toContain('未提供');
    expect(out).toContain('场景库');
    // No `library` subcommand / 专用脚本 reference when missing
    expect(out).not.toContain('library 子命令');
    expect(out).not.toContain('aet-design-env.mjs library');
    expect(out).not.toContain('专用脚本');
  });

  it('reports exists=false (no <path>) when the path is a directory, not a file', () => {
    mkdirSync(join(root, '.aet'), { recursive: true });
    mkdirSync(join(root, '.aet', 'scenario_library.yml'));
    const out = scenarioPlugin.run(root)!;
    expect(out).toMatch(/<exists>false<\/exists>/);
    expect(out).not.toContain('<path>');
  });

  it('always returns a non-null string (status reporting, never "no data")', () => {
    const r = scenarioPlugin.run(root);
    if (r === null) throw new Error('plugin returned null');
    expect(typeof r).toBe('string');
    expect(r.length).toBeGreaterThan(0);
  });
});

describe('function-library plugin', () => {
  let root: string;
  beforeEach(() => { root = makeTmpRoot(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('exposes name/description', () => {
    expect(functionPlugin.name).toBe('function-lib');
    expect(functionPlugin.description).toContain('function_library.yml');
  });

  it('exists=true: emits <path> + forbids direct read + 专用脚本 + 功能库 semantic clause', () => {
    const abs = placeYaml(root, 'function_library.yml');
    const out = functionPlugin.run(root)!;
    expect(out).toContain('<function-library>');
    expect(out).toMatch(/<exists>true<\/exists>/);
    expect(out).toContain(`<path>${abs}</path>`);
    expect(out).toContain('禁止直接读取');
    expect(out).toContain('专用脚本');
    expect(out).not.toContain('aet-design-env.mjs library');
    // Library-specific semantic clause — distinct from scenario-library
    expect(out).toContain('功能库');
    expect(out).toContain('能力组合');
    // Ensure the scenario-library semantic clause is NOT leaking in
    expect(out).not.toContain('业务操作场景');
  });

  it('exists=false: NO <path>, degrade directive, NO library subcommand reference', () => {
    const out = functionPlugin.run(root)!;
    expect(out).toMatch(/<exists>false<\/exists>/);
    expect(out).not.toContain('<path>');
    expect(out).toContain('未提供');
    expect(out).toContain('功能库');
    expect(out).not.toContain('aet-design-env.mjs library');
    expect(out).not.toContain('专用脚本');
  });

  it('always returns a non-null string', () => {
    const r = functionPlugin.run(root);
    if (r === null) throw new Error('plugin returned null');
    expect(typeof r).toBe('string');
    expect(r.length).toBeGreaterThan(0);
  });
});

describe('sdr-library plugin — two-block nested output', () => {
  let root: string;
  beforeEach(() => { root = makeTmpRoot(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  function sdrRun(r: string): string {
    const out = sdrPlugin.run(r);
    if (out === null) throw new Error('sdr plugin returned null');
    return out;
  }

  // Slice a `<tag>...</tag>` block out of `out`. NOTE: '<sdr>' does not
  // collide with '<sdr-library>' because the 5th char of '<sdr-library>'
  // is '-' not '>'; same for the closing tags.
  function sliceBlock(out: string, tag: string): string {
    const start = out.indexOf(`<${tag}>`);
    const end = out.indexOf(`</${tag}>`) + `</${tag}>`.length;
    return out.slice(start, end);
  }

  it('exposes name/description mentioning both files', () => {
    expect(sdrPlugin.name).toBe('sdr-lib');
    expect(sdrPlugin.description).toContain('sdr_library.yml');
    expect(sdrPlugin.description).toContain('sec_func_specs.yml');
  });

  it('both missing: <sdr> envelope wraps <sdr-library> + <sec-func-specs>, both false, no <path>', () => {
    const out = sdrRun(root);
    // Top-level envelope is <sdr>...</sdr>
    expect(out.indexOf('<sdr>')).toBeGreaterThanOrEqual(0);
    expect(out.lastIndexOf('</sdr>')).toBeGreaterThan(out.indexOf('<sdr>'));
    // Inner sub-blocks: <sdr-library> and <sec-func-specs>
    expect(out).toContain('<sdr-library>');
    expect(out).toContain('</sdr-library>');
    expect(out).toContain('<sec-func-specs>');
    expect(out).toContain('</sec-func-specs>');
    // BOTH sub-blocks report exists=false (joint degradation)
    expect((out.match(/<exists>false<\/exists>/g) || []).length).toBe(2);
    expect((out.match(/<exists>true<\/exists>/g) || []).length).toBe(0);
    // No <path> when degraded
    expect(out).not.toContain('<path>');
  });

  it('sdr present, sec missing: BOTH sub-blocks false (joint degradation), no <path>', () => {
    // The two files form ONE composite library — if EITHER is missing,
    // BOTH sub-blocks report exists=false. This is the user-requested
    // "any one missing → all missing" semantics. The instruction text
    // does NOT describe this logic; it stays tailored per sub-block.
    placeYaml(root, 'sdr_library.yml', 'type: sdr\n');
    const out = sdrRun(root);
    expect((out.match(/<exists>false<\/exists>/g) || []).length).toBe(2);
    expect((out.match(/<exists>true<\/exists>/g) || []).length).toBe(0);
    expect(out).not.toContain('<path>');
  });

  it('sec present, sdr missing: BOTH sub-blocks false (joint degradation), no <path>', () => {
    placeYaml(root, 'sec_func_specs.yml', 'type: sec\n');
    const out = sdrRun(root);
    expect((out.match(/<exists>false<\/exists>/g) || []).length).toBe(2);
    expect((out.match(/<exists>true<\/exists>/g) || []).length).toBe(0);
    expect(out).not.toContain('<path>');
  });

  it('both present: both sub-blocks have exists=true and <path>, distinct semantic clauses', () => {
    placeYaml(root, 'sdr_library.yml', 'type: sdr\n');
    placeYaml(root, 'sec_func_specs.yml', 'type: sec\n');
    const out = sdrRun(root);
    expect((out.match(/<exists>true<\/exists>/g) || []).length).toBe(2);
    expect((out.match(/<path>/g) || []).length).toBe(2);
    expect((out.match(/<exists>false<\/exists>/g) || []).length).toBe(0);
    expect(out).toContain(`<path>${join(root, '.aet', 'sdr_library.yml')}</path>`);
    expect(out).toContain(`<path>${join(root, '.aet', 'sec_func_specs.yml')}</path>`);
    // SDR semantic appears ONLY in <sdr-library> block; sec semantic
    // appears ONLY in <sec-func-specs> block. The two instructions are
    // tailored independently and must not leak into each other.
    const sdrBlock = sliceBlock(out, 'sdr-library');
    const secBlock = sliceBlock(out, 'sec-func-specs');
    expect(sdrBlock).toContain('SDR 库');
    expect(sdrBlock).toContain('SDR分析');
    expect(sdrBlock).not.toContain('安全功能规范库');
    expect(secBlock).toContain('安全功能规范库');
    expect(secBlock).toContain('SDR关联');
    expect(secBlock).not.toContain('SDR分析');
  });

  it('degraded: each sub-block instruction keeps its own degrade directive', () => {
    // both missing → both sub-blocks emit their own degrade instruction.
    // Verify each block's degrade clause is present and tailored to that
    // block (no cross-contamination).
    const out = sdrRun(root);
    const sdrBlock = sliceBlock(out, 'sdr-library');
    const secBlock = sliceBlock(out, 'sec-func-specs');
    expect(sdrBlock).toContain('未提供 SDR 库');
    expect(sdrBlock).toContain('继续工作');
    expect(secBlock).toContain('未提供安全功能规范库');
    // The sec block has no "继续工作" clause (its degrade instruction is
    // terser — just "未提供"). Pin this so future edits stay intentional.
    expect(secBlock).not.toContain('继续工作');
  });

  it('always returns a non-null string even when both files are missing', () => {
    const r = sdrRun(root);
    expect(typeof r).toBe('string');
    expect(r.length).toBeGreaterThan(0);
  });
});

describe('fmea-library plugin', () => {
  let root: string;
  beforeEach(() => { root = makeTmpRoot(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('exposes name/description', () => {
    expect(fmeaPlugin.name).toBe('fmea-lib');
    expect(fmeaPlugin.description).toContain('fmea_library.yml');
  });

  it('exists=true: emits <path> + forbids direct read + 专用脚本 + FMEA 库 semantic clause', () => {
    const abs = placeYaml(root, 'fmea_library.yml');
    const out = fmeaPlugin.run(root)!;
    expect(out).toContain('<fmea-library>');
    expect(out).toMatch(/<exists>true<\/exists>/);
    expect(out).toContain(`<path>${abs}</path>`);
    expect(out).toContain('禁止直接读取');
    expect(out).toContain('专用脚本');
    expect(out).not.toContain('aet-design-env.mjs library');
    // Library-specific semantic clause — NOT a generic template
    expect(out).toContain('FMEA 库');
    expect(out).toContain('故障模式');
  });

  it('exists=false: NO <path>, degrade directive, NO library subcommand reference', () => {
    const out = fmeaPlugin.run(root)!;
    expect(out).toMatch(/<exists>false<\/exists>/);
    expect(out).not.toContain('<path>');
    expect(out).toContain('未提供');
    expect(out).toContain('FMEA 库');
    expect(out).not.toContain('aet-design-env.mjs library');
    expect(out).not.toContain('专用脚本');
  });

  it('reports exists=false (no <path>) when the path is a directory, not a file', () => {
    mkdirSync(join(root, '.aet'), { recursive: true });
    mkdirSync(join(root, '.aet', 'fmea_library.yml'));
    const out = fmeaPlugin.run(root)!;
    expect(out).toMatch(/<exists>false<\/exists>/);
    expect(out).not.toContain('<path>');
  });

  it('always returns a non-null string', () => {
    const r = fmeaPlugin.run(root);
    if (r === null) throw new Error('plugin returned null');
    expect(typeof r).toBe('string');
    expect(r.length).toBeGreaterThan(0);
  });
});
