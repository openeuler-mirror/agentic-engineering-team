/**
 * Plugin: sdr-library
 *
 * Probes THREE files under `{root}/.aet/`:
 *   1. security_sdr_library.yml  — 安全 SDR 主库   (<security><sdr-library>)
 *   2. sec_func_specs.yml       — 安全功能规范库   (<security><sec-func-specs>)
 *   3. reliability_sdr_library.yml — 可靠性 SDR 主库 (<reliability><sdr-library>)
 *
 * SDR is split into TWO independent groups — security and reliability —
 * each with its OWN main library file. The two groups do NOT depend on
 * each other; each group's existence is judged from its own file alone.
 *   - security group   : <sdr-library> (main) + <sec-func-specs> (optional)
 *   - reliability group : <sdr-library> (main) — NO specs sub-block
 *
 * sec_func_specs.yml is an OPTIONAL appendage of the security group, with
 * a ONE-WAY dependency on the security main library:
 *   - <sec-func-specs> reports exists=true ONLY when BOTH the security
 *     main library AND sec_func_specs.yml are present.
 *   - When the security main library is missing, <sec-func-specs> is
 *     forced to exists=false EVEN IF sec_func_specs.yml exists on disk.
 *   - When the security main library is present but sec_func_specs.yml is
 *     missing, <sdr-library> still reports true (specs is optional) while
 *     <sec-func-specs> reports false.
 * This replaces the OLD two-way joint-degradation semantics (where either
 * file missing forced BOTH blocks false). The security main library is now
 * the sole anchor of "has security SDR".
 *
 * Output layout (whitespace is part of the contract — STs assert it):
 *   <sdr>
 *   <security>
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
 *   </security>
 *   <reliability>
 *   <sdr-library>
 *   <exists>...</exists>
 *   <path>...</path>      (only when exists=true)
 *   <instruction>...</instruction>
 *   </sdr-library>
 *   </reliability>
 *   </sdr>
 *
 * Truth table (pinned by STs):
 *   security_sdr | sec_func_specs | <security><sdr-library> | <security><sec-func-specs>
 *     present   |    present      |        true             |          true
 *     present   |    missing      |        true             |          false  (specs optional)
 *     missing   |    present      |        false            |          false  (one-way: main missing → specs forced false)
 *     missing   |    missing      |        false            |          false
 *   reliability_sdr | <reliability><sdr-library>
 *      present      |        true
 *      missing      |        false
 *
 * Field-shape contract per inner block:
 *   - exists=true  : <exists>true</exists> + <path>{abs}</path> +
 *                    <instruction>(forbid direct read + use the script)
 *   - exists=false : <exists>false</exists> + <instruction>(degrade +
 *                    keep working without this library) — NO <path>
 *
 * The three sub-block builders are written out independently inside this
 * file so each block's instruction can evolve without touching the
 * others; they do NOT share code with scenario/function/fmea plugins.
 */
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from './types';

const TOP_TAG = 'sdr';
const SECURITY_TAG = 'security';
const RELIABILITY_TAG = 'reliability';
const SDR_TAG = 'sdr-library';
const SEC_SPECS_TAG = 'sec-func-specs';
const SEC_SDR_FILE = 'security_sdr_library.yml';
const REL_SDR_FILE = 'reliability_sdr_library.yml';
const SEC_SPECS_FILE = 'sec_func_specs.yml';

function buildSecuritySdrBlock(root: string, secSdrExists: boolean): string {
  const filePath = join(root, '.aet', SEC_SDR_FILE);

  if (secSdrExists) {
    return [
      `<${SDR_TAG}>`,
      `<exists>true</exists>`,
      `<path>${filePath}</path>`,
      `<instruction>安全 SDR 库用于进行各个功能的安全 SDR 分析。禁止直接读取该 YAML 文件内容（节点可能极多，read 会污染上下文）。请使用对应脚本读取。`,
      `</instruction>`,
      `</${SDR_TAG}>`,
    ].join('\n');
  }

  return [
    `<${SDR_TAG}>`,
    `<exists>false</exists>`,
    `<instruction>安全 SDR 库用于进行各个功能的安全 SDR 分析。当前项目未提供安全 SDR 库，请在没有该库的情况下继续工作。</instruction>`,
    `</${SDR_TAG}>`,
  ].join('\n');
}

function buildSecFuncSpecsBlock(root: string, secSdrExists: boolean, secSpecsExists: boolean): string {
  // ONE-WAY dependency: specs is meaningful only when the security main
  // library exists. When the main library is missing, specs is forced
  // false regardless of whether sec_func_specs.yml is on disk.
  const effective = secSdrExists && secSpecsExists;
  const filePath = join(root, '.aet', SEC_SPECS_FILE);

  if (effective) {
    return [
      `<${SEC_SPECS_TAG}>`,
      `<exists>true</exists>`,
      `<path>${filePath}</path>`,
      `<instruction>安全功能规范库中的规范与安全 SDR 关联，用于具体分析每一项安全 SDR。禁止直接读取该 YAML 文件内容（节点可能极多，read 会污染上下文）。请使用对应脚本读取。`,
      `</instruction>`,
      `</${SEC_SPECS_TAG}>`,
    ].join('\n');
  }

  return [
    `<${SEC_SPECS_TAG}>`,
    `<exists>false</exists>`,
    `<instruction>安全功能规范库中的规范与安全 SDR 关联，用于具体分析每一项安全 SDR。当前项目未提供安全功能规范库。</instruction>`,
    `</${SEC_SPECS_TAG}>`,
  ].join('\n');
}

function buildReliabilitySdrBlock(root: string, relSdrExists: boolean): string {
  const filePath = join(root, '.aet', REL_SDR_FILE);

  if (relSdrExists) {
    return [
      `<${SDR_TAG}>`,
      `<exists>true</exists>`,
      `<path>${filePath}</path>`,
      `<instruction>可靠性 SDR 库用于进行各个功能的可靠性 SDR 分析。禁止直接读取该 YAML 文件内容（节点可能极多，read 会污染上下文）。请使用对应脚本读取。`,
      `</instruction>`,
      `</${SDR_TAG}>`,
    ].join('\n');
  }

  return [
    `<${SDR_TAG}>`,
    `<exists>false</exists>`,
    `<instruction>可靠性 SDR 库用于进行各个功能的可靠性 SDR 分析。当前项目未提供可靠性 SDR 库，请在没有该库的情况下继续工作。</instruction>`,
    `</${SDR_TAG}>`,
  ].join('\n');
}

export const plugin: Plugin = {
  name: 'sdr-lib',
  description: `探测 .aet/${SEC_SDR_FILE}、.aet/${SEC_SPECS_FILE}、.aet/${REL_SDR_FILE} 是否存在，输出路径与浏览指令`,
  run(root: string): string {
    const secSdrPath = join(root, '.aet', SEC_SDR_FILE);
    const relSdrPath = join(root, '.aet', REL_SDR_FILE);
    const secSpecsPath = join(root, '.aet', SEC_SPECS_FILE);
    const secSdrExists = existsSync(secSdrPath) && statSync(secSdrPath).isFile();
    const relSdrExists = existsSync(relSdrPath) && statSync(relSdrPath).isFile();
    const secSpecsExists = existsSync(secSpecsPath) && statSync(secSpecsPath).isFile();

    const securityBlock = [
      `<${SECURITY_TAG}>`,
      buildSecuritySdrBlock(root, secSdrExists),
      buildSecFuncSpecsBlock(root, secSdrExists, secSpecsExists),
      `</${SECURITY_TAG}>`,
    ].join('\n');

    const reliabilityBlock = [
      `<${RELIABILITY_TAG}>`,
      buildReliabilitySdrBlock(root, relSdrExists),
      `</${RELIABILITY_TAG}>`,
    ].join('\n');

    return `<${TOP_TAG}>\n${securityBlock}\n${reliabilityBlock}\n</${TOP_TAG}>`;
  },
};
