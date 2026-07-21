#!/usr/bin/env node
/**
 * resolve-standards - 解析本次涉及语言的「编程语言规范」并拼成一份参考文档
 *
 * 用法:
 *   node resolve-standards.mjs --files src/a.c,src/b.py   # 从文件列表识别语言
 *   node resolve-standards.mjs --langs c,python           # 显式指定语言/框架(如 django,react)
 *   node resolve-standards.mjs --dir src/                 # 扫目录识别语言
 *
 * 解析顺序 (first-hit-wins,每语言独立,domain = implement):
 *   1. ./.aet/implement/custom/language-standards/<lang>.md   项目自定义 (最高)
 *   2. ./.aet/implement/aet/language-standards/<lang>.md       项目基线
 *   3. ~/.aet/implement/custom/language-standards/<lang>.md    公司自定义
 *   4. ~/.aet/implement/aet/language-standards/<lang>.md        公司基线 (install seed,保底)
 *   全部未命中 → 标注「回退通用最佳实践」,不报错。
 *
 * 输出:带「来源标注」表头 + 各语言规范全文拼接,打印到 stdout。
 *
 * 注意:本脚本是 implementing / reviewing 两个 skill 共用的逻辑,各自持有一份副本
 * (数据共享在 ~/.aet,代码各持一份以保持 skill 自包含)。修改时请同步另一份。
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const SUBDIR = 'language-standards';
const projectImplDir = join(process.cwd(), '.aet', 'implement');
const userImplDir = join(homedir(), '.aet', 'implement');

// 内置默认 ext-map(保底);若解析层中存在 ext-map.json 则优先用它(允许公司/项目自定义)
const DEFAULT_EXT_MAP = {
  '.ts': 'typescript', '.tsx': 'typescript', '.js': 'typescript',
  '.jsx': 'typescript', '.mjs': 'typescript', '.cjs': 'typescript',
  '.py': 'python', '.go': 'go', '.rs': 'rust', '.java': 'java',
  '.kt': 'kotlin', '.kts': 'kotlin', '.cs': 'csharp',
  '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp', '.hh': 'cpp',
  '.c': 'c', '.h': 'c', '.vue': 'vue', '.svelte': 'svelte',
  '.css': 'css-less-sass', '.scss': 'css-less-sass',
  '.sass': 'css-less-sass', '.less': 'css-less-sass',
};

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'vendor',
  '__pycache__', '.aet', 'coverage', '.next', 'target',
]);

// 每层的解析路径 + 人类可读来源标注
function layersFor(lang) {
  return [
    { path: join(projectImplDir, 'custom', SUBDIR, `${lang}.md`), label: '项目自定义 (./.aet/implement/custom)' },
    { path: join(projectImplDir, 'aet', SUBDIR, `${lang}.md`), label: '项目基线 (./.aet/implement/aet)' },
    { path: join(userImplDir, 'custom', SUBDIR, `${lang}.md`), label: '公司自定义 (~/.aet/implement/custom)' },
    { path: join(userImplDir, 'aet', SUBDIR, `${lang}.md`), label: '公司基线 (~/.aet/implement/aet)' },
  ];
}

function resolveLang(lang) {
  for (const layer of layersFor(lang)) {
    if (existsSync(layer.path)) {
      return layer;
    }
  }
  return null;
}

// ext-map.json 也走分层解析(只查 4 层,缺失则用内置默认)
function loadExtMap() {
  const candidates = [
    join(projectImplDir, 'custom', SUBDIR, 'ext-map.json'),
    join(projectImplDir, 'aet', SUBDIR, 'ext-map.json'),
    join(userImplDir, 'custom', SUBDIR, 'ext-map.json'),
    join(userImplDir, 'aet', SUBDIR, 'ext-map.json'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        const parsed = JSON.parse(readFileSync(p, 'utf-8'));
        if (parsed && parsed.ext) return parsed.ext;
      } catch {
        /* 损坏则回退内置 */
      }
    }
  }
  return DEFAULT_EXT_MAP;
}

function extOf(file) {
  const base = file.split('/').pop() || file;
  const dot = base.lastIndexOf('.');
  return dot >= 0 ? base.slice(dot).toLowerCase() : '';
}

function walkDir(dir, acc) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkDir(full, acc);
    else acc.push(full);
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { files: null, langs: null, dir: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--files') out.files = (args[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--langs') out.langs = (args[++i] || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    else if (a === '--dir') out.dir = args[++i];
  }
  if (!out.files && !out.langs && !out.dir) {
    console.error('用法: node resolve-standards.mjs (--files a.c,b.py | --langs c,python | --dir src/)');
    process.exit(1);
  }
  return out;
}

function detectLangs({ files, langs, dir }) {
  if (langs) return [...new Set(langs)];
  const extMap = loadExtMap();
  const fileList = files || (() => { const acc = []; if (dir) walkDir(dir, acc); return acc; })();
  const detected = [];
  for (const f of fileList) {
    const lang = extMap[extOf(f)];
    if (lang && !detected.includes(lang)) detected.push(lang);
  }
  return detected;
}

function main() {
  const args = parseArgs();
  const langs = detectLangs(args);

  if (langs.length === 0) {
    console.log('# 本次实现的编程语言规范参考\n\n> 未识别到受支持的编程语言,按通用最佳实践处理。');
    return;
  }

  const resolved = langs.map((lang) => ({ lang, hit: resolveLang(lang) }));

  // 来源标注表头
  let out = '# 本次实现的编程语言规范参考\n\n';
  for (const { lang, hit } of resolved) {
    out += hit
      ? `> ${lang.padEnd(14)} ← 来源: ${hit.label}\n`
      : `> ${lang.padEnd(14)} ← 无规范,回退通用最佳实践\n`;
  }
  out += '\n---\n';

  // 各语言规范全文
  for (const { lang, hit } of resolved) {
    out += `\n## === ${lang} ===\n\n`;
    if (hit) {
      out += readFileSync(hit.path, 'utf-8').trim() + '\n';
    } else {
      out += `(${lang} 在所有配置层均无规范文件,请遵循该语言的通用最佳实践与项目既有风格。)\n`;
    }
  }

  console.log(out.trimEnd());
}

main();
