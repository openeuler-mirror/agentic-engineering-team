#!/usr/bin/env node
/**
 * AET 插件不能往 stdout 写东西。
 *
 * OpenCode TUI 会捕获插件进程的 stdout 并渲染到输入框附近，混进来的提示会盖住
 * 用户正在输入的内容。`console.error` / `console.warn` 走 stderr，不受影响；
 * 只有 `console.log` 走 stdout。
 *
 *     node .platform/test/no-stdout-pollution.mjs
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '../..');
const FILES = ['.opencode/plugins/aet.js', '.platform/utils/trace-logger.js'];

// ① Node 的通道语义（这段是真跑出来的，判据的后半部分依赖它）
const probe = 'console.log("L"); console.error("E"); console.warn("W");';
// execFileSync 只返回 stdout；要看两个流得用 spawnSync 的 stdout/stderr 字段
const r = spawnSync(process.execPath, ['-e', probe], { encoding: 'utf8' });
const onOut = r.stdout ?? '';
const onErr = r.stderr ?? '';
if (!onOut.includes('L') || onOut.includes('E') || onOut.includes('W')) {
  console.error('FAIL  Node 通道语义与预期不符：stdout 应只收到 console.log');
  process.exit(1);
}
if (!onErr.includes('E') || !onErr.includes('W') || onErr.includes('L')) {
  console.error('FAIL  Node 通道语义与预期不符：stderr 应收到 console.error/warn');
  process.exit(1);
}

// ② 源文件里不应再有 console.log
let bad = 0;
for (const rel of FILES) {
  const hits = [...readFileSync(path.join(ROOT, rel), 'utf8').matchAll(/console\.log/g)].length;
  if (hits > 0) {
    console.error(`FAIL  ${rel} 仍有 ${hits} 处 console.log —— 它会写进 stdout`);
    bad += 1;
  }
}
if (bad > 0) process.exit(1);

console.log('全部通过（Node 语义已实测；两个文件里没有 console.log，提示改走 stderr）');
