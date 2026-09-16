/**
 * Plugin: architecture-element-library
 *
 * Probes `{root}/.aet/architecture_element_library.yml` and emits an
 * <architecture-element-library> XML block reporting whether the 架构元素库
 * is present.
 *
 * Field shape:
 *   - exists=true  : <exists>true</exists> + <path>{abs}</path> +
 *                    <instruction>(forbid direct read + library subcommand)
 *   - exists=false : <exists>false</exists> + <instruction>(degrade:
 *                    keep working without this library, do NOT read
 *                    .aet/*.yml) — NO <path> emitted
 *
 * The instruction content is tailored to the 架构元素库 (describes the
 * system's architecture elements — Domain / SubDomain / Component —
 * that form the system-element side of the requirement ↔ design
 * mapping). This plugin is intentionally self-contained — it does NOT
 * share code with scenario-library / function-library / sdr-library /
 * fmea-library, so each plugin's instruction can evolve independently.
 */
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from './types';

const FILENAME = 'architecture_element_library.yml';
const XML_TAG = 'architecture-element-library';

export const plugin: Plugin = {
  name: 'arch-element-lib',
  description: `探测 .aet/${FILENAME} 是否存在，输出路径与浏览指令`,
  run(root: string): string {
    const filePath = join(root, '.aet', FILENAME);
    const exists = existsSync(filePath) && statSync(filePath).isFile();

    if (exists) {
      return [
        `<${XML_TAG}>`,
        `<exists>true</exists>`,
        `<path>${filePath}</path>`,
        `<instruction>架构元素库用于描述系统的架构元素（Domain / SubDomain / Component），是需求设计阶段功能与系统元素关系映射的架构侧输入。禁止直接读取该 YAML 文件内容。请用专用脚本逐级阅读架构元素库。`,
        `</instruction>`,
        `</${XML_TAG}>`,
      ].join('\n');
    }

    return [
      `<${XML_TAG}>`,
      `<exists>false</exists>`,
      `<instruction>架构元素库用于描述系统的架构元素（Domain / SubDomain / Component），是需求设计阶段功能与系统元素关系映射的架构侧输入。当前项目未提供架构元素库。</instruction>`,
      `</${XML_TAG}>`,
    ].join('\n');
  },
};
