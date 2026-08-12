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

describe('sdr-library plugin — security/reliability grouped output', () => {
  let root: string;
  beforeEach(() => { root = makeTmpRoot(); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  function sdrRun(r: string): string {
    const out = sdrPlugin.run(r);
    if (out === null) throw new Error('sdr plugin returned null');
    return out;
  }

  // Slice a `<tag>...</tag>` block out of `out`. Tag boundary matching is
  // exact: '<sdr>' does not collide with '<sdr-library>' because the 5th
  // char of '<sdr-library>' is '-' not '>'; same for '<security>' vs
  // '<sec-func-specs>' (5th char 't' vs '-') and '<reliability>'. Closing
  // tags mirror this. To slice an INNER sub-block living inside a group,
  // first slice the group, then slice the sub-block from that slice.
  function sliceBlock(out: string, tag: string): string {
    const start = out.indexOf(`<${tag}>`);
    const end = out.indexOf(`</${tag}>`) + `</${tag}>`.length;
    return out.slice(start, end);
  }

  it('exposes name/description mentioning all three files', () => {
    expect(sdrPlugin.name).toBe('sdr-lib');
    expect(sdrPlugin.description).toContain('security_sdr_library.yml');
    expect(sdrPlugin.description).toContain('sec_func_specs.yml');
    expect(sdrPlugin.description).toContain('reliability_sdr_library.yml');
  });

  it('all missing: <sdr> wraps <security> + <reliability>, all three exists=false, no <path>', () => {
    const out = sdrRun(root);
    // Top-level envelope is <sdr>...</sdr>
    expect(out.indexOf('<sdr>')).toBeGreaterThanOrEqual(0);
    expect(out.lastIndexOf('</sdr>')).toBeGreaterThan(out.indexOf('<sdr>'));
    // Two groups
    expect(out).toContain('<security>');
    expect(out).toContain('</security>');
    expect(out).toContain('<reliability>');
    expect(out).toContain('</reliability>');
    // THREE sub-blocks (security sdr-library + sec-func-specs + reliability
    // sdr-library), all exists=false
    expect((out.match(/<exists>false<\/exists>/g) || []).length).toBe(3);
    expect((out.match(/<exists>true<\/exists>/g) || []).length).toBe(0);
    // No <path> when degraded
    expect(out).not.toContain('<path>');
  });

  it('security main present, specs missing: security sdr-library=true+path, sec-func-specs=false no path, reliability=false (specs optional)', () => {
    placeYaml(root, 'security_sdr_library.yml', 'type: security_sdr\n');
    const out = sdrRun(root);
    // Security main library reports true with its own path.
    expect((out.match(/<exists>true<\/exists>/g) || []).length).toBe(1);
    expect((out.match(/<exists>false<\/exists>/g) || []).length).toBe(2);
    expect(out).toContain(`<path>${join(root, '.aet', 'security_sdr_library.yml')}</path>`);
    // sec_func_specs.yml absent → sec-func-specs reports false, NO <path>
    // for it. Only the one <path> above is present.
    expect((out.match(/<path>/g) || []).length).toBe(1);
    // Reliability group still false (independent).
    const relBlock = sliceBlock(out, 'reliability');
    expect(relBlock).toMatch(/<exists>false<\/exists>/);
    expect(relBlock).not.toContain('<path>');
  });

  it('security main missing, specs present: security sdr-library=false, sec-func-specs FORCED false (one-way dependency), no path', () => {
    // One-way dependency: when the security main library is missing,
    // sec-func-specs is forced false EVEN THOUGH sec_func_specs.yml is
    // on disk. This is the user-corrected semantics — "如果没有 sec
    // library，那么无论如何 specs 也是无". Pin this against the old
    // two-way joint-degradation (which would also yield both false but
    // for a different reason); the distinguishing case is the NEXT test
    // (security present, specs missing → security still true).
    placeYaml(root, 'sec_func_specs.yml', 'type: sec\n');
    const out = sdrRun(root);
    expect((out.match(/<exists>true<\/exists>/g) || []).length).toBe(0);
    expect((out.match(/<exists>false<\/exists>/g) || []).length).toBe(3);
    expect(out).not.toContain('<path>');
  });

  it('reliability main present: reliability sdr-library=true+path; reliability group has NO <sec-func-specs> sub-block; security still false', () => {
    placeYaml(root, 'reliability_sdr_library.yml', 'type: reliability_sdr\n');
    const out = sdrRun(root);
    expect((out.match(/<exists>true<\/exists>/g) || []).length).toBe(1);
    expect((out.match(/<exists>false<\/exists>/g) || []).length).toBe(2);
    expect(out).toContain(`<path>${join(root, '.aet', 'reliability_sdr_library.yml')}</path>`);
    // Reliability group contains a <sdr-library> but NO <sec-func-specs>.
    const relBlock = sliceBlock(out, 'reliability');
    expect(relBlock).toContain('<sdr-library>');
    expect(relBlock).not.toContain('<sec-func-specs>');
    // Security group still degraded (independent of reliability).
    const secGroup = sliceBlock(out, 'security');
    expect((secGroup.match(/<exists>false<\/exists>/g) || []).length).toBe(2);
    expect(secGroup).not.toContain('<path>');
  });

  it('all three present: three exists=true + three <path> (security_sdr / sec_func_specs / reliability_sdr)', () => {
    placeYaml(root, 'security_sdr_library.yml', 'type: security_sdr\n');
    placeYaml(root, 'sec_func_specs.yml', 'type: sec\n');
    placeYaml(root, 'reliability_sdr_library.yml', 'type: reliability_sdr\n');
    const out = sdrRun(root);
    expect((out.match(/<exists>true<\/exists>/g) || []).length).toBe(3);
    expect((out.match(/<exists>false<\/exists>/g) || []).length).toBe(0);
    expect((out.match(/<path>/g) || []).length).toBe(3);
    expect(out).toContain(`<path>${join(root, '.aet', 'security_sdr_library.yml')}</path>`);
    expect(out).toContain(`<path>${join(root, '.aet', 'sec_func_specs.yml')}</path>`);
    expect(out).toContain(`<path>${join(root, '.aet', 'reliability_sdr_library.yml')}</path>`);
  });

  it('semantic isolation: each sub-block keeps its own clause, no cross-contamination', () => {
    placeYaml(root, 'security_sdr_library.yml', 'type: security_sdr\n');
    placeYaml(root, 'sec_func_specs.yml', 'type: sec\n');
    placeYaml(root, 'reliability_sdr_library.yml', 'type: reliability_sdr\n');
    const out = sdrRun(root);
    const secGroup = sliceBlock(out, 'security');
    const relGroup = sliceBlock(out, 'reliability');
    const secSdrBlock = sliceBlock(secGroup, 'sdr-library');
    const secSpecsBlock = sliceBlock(secGroup, 'sec-func-specs');
    const relSdrBlock = sliceBlock(relGroup, 'sdr-library');
    // Security sdr-library: 安全 SDR clause
    expect(secSdrBlock).toContain('安全 SDR 库');
    expect(secSdrBlock).toContain('安全 SDR 分析');
    expect(secSdrBlock).not.toContain('可靠性');
    expect(secSdrBlock).not.toContain('安全功能规范库');
    // Sec-func-specs: 安全功能规范 + 安全 SDR 关联
    expect(secSpecsBlock).toContain('安全功能规范库');
    expect(secSpecsBlock).toContain('安全 SDR 关联');
    expect(secSpecsBlock).not.toContain('可靠性');
    expect(secSpecsBlock).not.toContain('安全 SDR 分析');
    // Reliability sdr-library: 可靠性 SDR clause, no security/specs leakage
    expect(relSdrBlock).toContain('可靠性 SDR 库');
    expect(relSdrBlock).toContain('可靠性 SDR 分析');
    expect(relSdrBlock).not.toContain('安全');
    expect(relSdrBlock).not.toContain('安全功能规范库');
  });

  it('degraded: each sub-block keeps its own degrade directive', () => {
    // all missing → each sub-block emits its own degrade instruction.
    const out = sdrRun(root);
    const secGroup = sliceBlock(out, 'security');
    const relGroup = sliceBlock(out, 'reliability');
    const secSdrBlock = sliceBlock(secGroup, 'sdr-library');
    const secSpecsBlock = sliceBlock(secGroup, 'sec-func-specs');
    const relSdrBlock = sliceBlock(relGroup, 'sdr-library');
    expect(secSdrBlock).toContain('未提供安全 SDR 库');
    expect(secSdrBlock).toContain('继续工作');
    // The sec-func-specs degrade clause is terser — just "未提供" with
    // no "继续工作" clause. Pin this so future edits stay intentional.
    expect(secSpecsBlock).toContain('未提供安全功能规范库');
    expect(secSpecsBlock).not.toContain('继续工作');
    expect(relSdrBlock).toContain('未提供可靠性 SDR 库');
    expect(relSdrBlock).toContain('继续工作');
  });

  it('always returns a non-null string even when all files are missing', () => {
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
