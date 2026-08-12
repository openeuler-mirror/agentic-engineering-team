/**
 * Plugin: sdr-library
 *
 * Probes TWO files under `{root}/.aet/`:
 *   1. sdr_library.yml       — SDR 库   (<sdr-library> sub-block)
 *   2. sec_func_specs.yml    — 安全功能规范库 (<sec-func-specs> sub-block)
 *
 * Output layout (whitespace is part of the contract — STs assert it):
 *   <sdr>
 *   <sdr-library>
 *   <exists>...</exists>
 *   <path>...</path>      (only when exists=true)
 *   <instruction>...</instruction>
 *   </sdr-library>
 *   <sec-func-specs>
 *   <exists>...</exists>
 *   <path>...</path>      (only when exists=true)
 *   <instruction>...</instruction>
 *   </sec-func-specs>
 *   </sdr>
 *
 * BOTH sub-blocks report the SAME existence value: the plugin treats the
 * two files as ONE composite library — if EITHER file is missing, BOTH
 * sub-blocks report exists=false (degrade together). When both files are
 * present, both sub-blocks report exists=true and each emits its own
 * absolute <path>. The instruction text does NOT describe this joint
 * logic; it stays tailored to each sub-block's semantics.
 *
 * Field-shape contract per inner block:
 *   - exists=true  : <exists>true</exists> + <path>{abs}</path> +
 *                    <instruction>(forbid direct read + use the script)
 *   - exists=false : <exists>false</exists> + <instruction>(degrade +
 *                    keep working without this library) — NO <path>
 *
 * The two sub-blocks have INDEPENDENT, library-specific instructions:
 *   - <sdr-library>   : SDR 分析用途
 *   - <sec-func-specs> : 安全功能规范与 SDR 的关联
 *
 * This plugin is intentionally self-contained — it does NOT share code
 * with scenario-library / function-library. The two sub-block builders
 * are also written out independently inside this file so each block's
 * instruction can evolve without touching the other.
 */
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from './types';

const TOP_TAG = 'sdr';
const SDR_TAG = 'sdr-library';
const SEC_TAG = 'sec-func-specs';
const SDR_FILE = 'sdr_library.yml';
const SEC_FILE = 'sec_func_specs.yml';

function buildSdrBlock(root: string, allExist: boolean): string {
  const filePath = join(root, '.aet', SDR_FILE);

  if (allExist) {
    return [
      `<${SDR_TAG}>`,
      `<exists>true</exists>`,
      `<path>${filePath}</path>`,
      `<instruction>SDR 库用于进行各个功能的SDR分析。禁止直接读取该 YAML 文件内容（节点可能极多，read 会污染上下文）。请使用对应脚本读取。`,
      `</instruction>`,
      `</${SDR_TAG}>`,
    ].join('\n');
  }

  return [
    `<${SDR_TAG}>`,
    `<exists>false</exists>`,
    `<instruction>SDR 库用于进行各个功能的SDR分析。当前项目未提供 SDR 库，请在没有该库的情况下继续工作。</instruction>`,
    `</${SDR_TAG}>`,
  ].join('\n');
}

function buildSecBlock(root: string, allExist: boolean): string {
  const filePath = join(root, '.aet', SEC_FILE);

  if (allExist) {
    return [
      `<${SEC_TAG}>`,
      `<exists>true</exists>`,
      `<path>${filePath}</path>`,
      `<instruction>安全功能规范库中的规范与SDR关联，用于具体分析每一项SDR。禁止直接读取该 YAML 文件内容（节点可能极多，read 会污染上下文）。请使用对应脚本读取。`,
      `</instruction>`,
      `</${SEC_TAG}>`,
    ].join('\n');
  }

  return [
    `<${SEC_TAG}>`,
    `<exists>false</exists>`,
    `<instruction>安全功能规范库中的规范与SDR关联，用于具体分析每一项SDR。当前项目未提供安全功能规范库。</instruction>`,
    `</${SEC_TAG}>`,
  ].join('\n');
}

export const plugin: Plugin = {
  name: 'sdr-lib',
  description: `探测 .aet/${SDR_FILE} 与 .aet/${SEC_FILE} 是否存在，输出路径与浏览指令`,
  run(root: string): string {
    const sdrPath = join(root, '.aet', SDR_FILE);
    const secPath = join(root, '.aet', SEC_FILE);
    const sdrExists = existsSync(sdrPath) && statSync(sdrPath).isFile();
    const secExists = existsSync(secPath) && statSync(secPath).isFile();
    // Joint degradation: the two files form ONE composite library. If
    // EITHER is missing, BOTH sub-blocks report exists=false. This is
    // reflected in the field shape (no <path> when degraded) but NOT
    // described in the instruction text — the instruction stays
    // tailored to each sub-block's semantics.
    const allExist = sdrExists && secExists;
    return `<${TOP_TAG}>\n${buildSdrBlock(root, allExist)}\n${buildSecBlock(root, allExist)}\n</${TOP_TAG}>`;
  },
};
