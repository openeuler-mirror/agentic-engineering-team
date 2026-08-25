/**
 * Plugin: function-library
 *
 * Probes `{root}/.aet/function_library.yml` and emits a <function-library>
 * XML block reporting whether the 功能库 is present.
 *
 * Field shape:
 *   - exists=true  : <exists>true</exists> + <path>{abs}</path> +
 *                    <instruction>(forbid direct read + library subcommand)
 *   - exists=false : <exists>false</exists> + <instruction>(degrade:
 *                    keep working without this library, do NOT read
 *                    .aet/*.yml) — NO <path> emitted
 *
 * The instruction content is tailored to the 功能库 (describes reusable
 * capability composition; the capability-side input for requirement
 * ↔ design mapping). This plugin is intentionally self-contained — it
 * does NOT share code with scenario-library / sdr-library, so each
 * plugin's instruction can evolve independently.
 */
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from './types';

const FILENAME = 'function_library.yml';
const XML_TAG = 'function-library';

export const plugin: Plugin = {
  name: 'function-lib',
  description: `探测 .aet/${FILENAME} 是否存在，输出路径与浏览指令`,
  run(root: string): string {
    const filePath = join(root, '.aet', FILENAME);
    const exists = existsSync(filePath) && statSync(filePath).isFile();

    if (exists) {
      return [
        `<${XML_TAG}>`,
        `<exists>true</exists>`,
        `<path>${filePath}</path>`,
        `<instruction>功能库用于描述系统可复用的能力组合，是需求与设计映射的能力侧输入。禁止直接读取该 YAML 文件内容。请用专用脚本逐级阅读场景库。`,
        `</instruction>`,
        `</${XML_TAG}>`,
      ].join('\n');
    }

    return [
      `<${XML_TAG}>`,
      `<exists>false</exists>`,
      `<instruction>功能库用于描述系统能力组合，是需求与设计映射的能力侧输入。当前项目未提供功能库。</instruction>`,
      `</${XML_TAG}>`,
    ].join('\n');
  },
};
