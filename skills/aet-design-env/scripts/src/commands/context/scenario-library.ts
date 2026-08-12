/**
 * Plugin: scenario-library
 *
 * Probes `{root}/.aet/scenario_library.yml` and emits a <scenario-library>
 * XML block reporting whether the 场景库 is present.
 *
 * Field shape:
 *   - exists=true  : <exists>true</exists> + <path>{abs}</path> +
 *                    <instruction>(forbid direct read + library subcommand)
 *   - exists=false : <exists>false</exists> + <instruction>(degrade:
 *                    keep working without this library, do NOT read
 *                    .aet/*.yml) — NO <path> emitted
 *
 * The instruction content is tailored to the 场景库 (describes user
 * business operation scenes; input for scenario-based requirements
 * analysis). This plugin is intentionally self-contained — it does NOT
 * share code with function-library / sdr-library, so each plugin's
 * instruction can evolve independently.
 */
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from './types';

const FILENAME = 'scenario_library.yml';
const XML_TAG = 'scenario-library';

export const plugin: Plugin = {
  name: 'scenario-lib',
  description: `探测 .aet/${FILENAME} 是否存在，输出路径与浏览指令`,
  run(root: string): string {
    const filePath = join(root, '.aet', FILENAME);
    const exists = existsSync(filePath) && statSync(filePath).isFile();

    if (exists) {
      return [
        `<${XML_TAG}>`,
        `<exists>true</exists>`,
        `<path>${filePath}</path>`,
        `<instruction>场景库用于描述用户的具体业务操作场景，是后续场景化需求分析的输入。禁止直接读取该 YAML 文件内容。请用专用脚本逐级阅读场景库。`,
        `</instruction>`,
        `</${XML_TAG}>`,
      ].join('\n');
    }

    return [
      `<${XML_TAG}>`,
      `<exists>false</exists>`,
      `<instruction>场景库用于描述用户业务操作场景，是后续场景化需求分析的输入。当前项目未提供场景库。</instruction>`,
      `</${XML_TAG}>`,
    ].join('\n');
  },
};
