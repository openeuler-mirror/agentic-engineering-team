/**
 * Plugin: fmea-library
 *
 * Probes `{root}/.aet/fmea_library.yml` and emits a <fmea-library>
 * XML block reporting whether the FMEA 库 is present.
 *
 * Field shape:
 *   - exists=true  : <exists>true</exists> + <path>{abs}</path> +
 *                    <instruction>(forbid direct read + library subcommand)
 *   - exists=false : <exists>false</exists> + <instruction>(degrade:
 *                    keep working without this library, do NOT read
 *                    .aet/*.yml) — NO <path> emitted
 *
 * The instruction content is tailored to the FMEA 库 (fault mode and
 * effects analysis library; describes each function's fault modes, the
 * reliability-side input). This plugin is intentionally self-contained —
 * it does NOT share code with scenario-library / function-library /
 * sdr-library, so each plugin's instruction can evolve independently.
 */
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from './types';

const FILENAME = 'fmea_library.yml';
const XML_TAG = 'fmea-library';

export const plugin: Plugin = {
  name: 'fmea-lib',
  description: `探测 .aet/${FILENAME} 是否存在，输出路径与浏览指令`,
  run(root: string): string {
    const filePath = join(root, '.aet', FILENAME);
    const exists = existsSync(filePath) && statSync(filePath).isFile();

    if (exists) {
      return [
        `<${XML_TAG}>`,
        `<exists>true</exists>`,
        `<path>${filePath}</path>`,
        `<instruction>FMEA 库用于描述系统各功能的故障模式与影响分析，是可靠性分析侧输入。禁止直接读取该 YAML 文件内容。请用专用脚本逐级阅读故障模式库。`,
        `</instruction>`,
        `</${XML_TAG}>`,
      ].join('\n');
    }

    return [
      `<${XML_TAG}>`,
      `<exists>false</exists>`,
      `<instruction>FMEA 库用于描述系统各功能的故障模式与影响分析，是可靠性分析侧输入。当前项目未提供 FMEA 库。</instruction>`,
      `</${XML_TAG}>`,
    ].join('\n');
  },
};
