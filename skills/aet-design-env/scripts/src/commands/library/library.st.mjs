/**
 * ST (System Test) for the `library` subcommand of aet-design-env.
 *
 * Strategy: end-to-end equivalence check against the original
 * `skills/aet-req-analysis/scripts/library-browser.mjs`. Run both CLIs on
 * the same fixture YAML (root-level browse + incremental expansion modes),
 * normalize the self-referential hint lines (the `提示:` and `Usage:`
 * lines, which embed each CLI's own invocation path and therefore differ
 * between the NEW CLI and the ORIG CLI — this is cross-CLI normalization,
 * not a debt), and assert the normalized outputs are byte-identical.
 * Note: the NEW CLI uses a fixed string for `提示:` (P1#8 fix), so its own
 * output is deterministic across invocations; the ORIG CLI still embeds
 * process.argv[1]. The two CLIs emit different hints, so ST filters both.
 *
 * Run:  npm run st      (from skills/aet-design-env/scripts/src)
 *   or: node library.st.mjs
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..', '..');
const NEW_CLI = resolve(REPO_ROOT, 'skills/aet-design-env/scripts/aet-design-env.mjs');
const ORIG_CLI = resolve(REPO_ROOT, 'skills/aet-req-analysis/scripts/library-browser.mjs');

// Fixture: a small scenario library covering directory + leaf + metadata
// + nested directories, so both modes have something meaningful to render.
const FIXTURE = `type: scenario
data:
  - id: '100001'
    type: directory
    name: IM 渠道对话
    description: 终端用户通过各 IM 平台与 Agent 进行消息交互的对话场景集合。
    actor: 终端用户
    children:
      - id: '100002'
        type: scene
        name: 飞书对话
        description: 通过飞书平台与 Agent 对话。
        actor: 终端用户
      - id: '100003'
        type: scene
        name: 钉钉对话
        description: 通过钉钉平台与 Agent 对话。
        actor: 终端用户
      - id: '100004'
        type: directory
        name: 企业即时通讯子组
        children:
          - id: '100005'
            type: scene
            name: 企业微信对话
            description: 通过企业微信平台与 Agent 对话。
            actor: 终端用户
  - id: '100012'
    type: directory
    name: Agent 对话执行
    description: Agent 处理用户对话请求的核心执行场景。
    actor: 终端用户
    children:
      - id: '100013'
        type: scene
        name: 快速问答
        description: agent.fast 模式快速问答。
        actor: 终端用户
`;

// Self-referential hint lines — each CLI embeds its own invocation path in
// `提示:`/`Usage:`, so NEW CLI and ORIG CLI emit different hints. We strip
// both for cross-CLI normalization (like timestamp filtering), not because
// of process.argv[1] non-determinism (the NEW CLI uses a fixed string after
// the P1#8 fix; the ORIG CLI still uses process.argv[1]).
const HINT_LINE = /^提示: /;
const USAGE_LINE = /^Usage: /;

function normalize(stdout) {
  return stdout
    .split('\n')
    .filter((line) => !HINT_LINE.test(line) && !USAGE_LINE.test(line))
    .join('\n');
}

function runCli(cliPath, args) {
  // Both CLIs are .mjs entry points invoked with `node`.
  // new CLI:  node aet-design-env.mjs library <file> [ids...]
  // orig CLI: node library-browser.mjs <file> [ids...]
  const isUnified = cliPath.endsWith('aet-design-env.mjs');
  const fullArgs = isUnified ? ['library', ...args] : args;
  const r = spawnSync(process.execPath, [cliPath, ...fullArgs], {
    encoding: 'utf-8',
    cwd: REPO_ROOT,
  });
  if (r.status !== 0) {
    throw new Error(
      `CLI exited ${r.status}\nSTDOUT:\n${r.stdout}\nSTDERR:\n${r.stderr}\n` +
      `cmd: ${cliPath} ${fullArgs.join(' ')}`
    );
  }
  return r.stdout;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    console.error(`\n[FAIL] ${label}`);
    console.error('--- expected (orig) ---');
    console.error(expected);
    console.error('--- actual (new) ---');
    console.error(actual);
    console.error('--- unified diff ---');
    const expLines = expected.split('\n');
    const actLines = actual.split('\n');
    const max = Math.max(expLines.length, actLines.length);
    for (let i = 0; i < max; i++) {
      if (expLines[i] !== actLines[i]) {
        console.error(`@@ line ${i + 1} @@`);
        console.error(`- exp: ${JSON.stringify(expLines[i])}`);
        console.error(`+ act: ${JSON.stringify(actLines[i])}`);
      }
    }
    process.exit(1);
  } else {
    console.log(`[PASS] ${label}`);
  }
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'lib-st-'));
  try {
    const fixturePath = join(dir, 'scenario_library.yml');
    writeFileSync(fixturePath, FIXTURE, 'utf-8');

    // Verify CLIs exist
    if (!existsSync(NEW_CLI)) {
      console.error(`NEW_CLI not found: ${NEW_CLI} — run \`npm run build\` first.`);
      process.exit(2);
    }
    if (!existsSync(ORIG_CLI)) {
      console.error(`ORIG_CLI not found: ${ORIG_CLI} — skills/aet-req-analysis must be present.`);
      process.exit(2);
    }

    console.log('=== ST: aet-design-env library vs original library-browser ===\n');

    // Case 1: root-level browse (no node ids)
    {
      const orig = normalize(runCli(ORIG_CLI, [fixturePath]));
      const next = normalize(runCli(NEW_CLI, [fixturePath]));
      assertEqual(next, orig, 'root-level browse (no node ids)');
    }

    // Case 2: incremental expansion — single top-level directory
    {
      const orig = normalize(runCli(ORIG_CLI, [fixturePath, '100001']));
      const next = normalize(runCli(NEW_CLI, [fixturePath, '100001']));
      assertEqual(next, orig, 'incremental expansion (100001)');
    }

    // Case 3: incremental expansion — nested directory
    {
      const orig = normalize(runCli(ORIG_CLI, [fixturePath, '100004']));
      const next = normalize(runCli(NEW_CLI, [fixturePath, '100004']));
      assertEqual(next, orig, 'incremental expansion (100004 nested)');
    }

    // Case 4: incremental expansion — multiple ids in one call
    {
      const orig = normalize(runCli(ORIG_CLI, [fixturePath, '100001', '100012']));
      const next = normalize(runCli(NEW_CLI, [fixturePath, '100001', '100012']));
      assertEqual(next, orig, 'incremental expansion (100001 + 100012)');
    }

    // Case 5: invalid node id — both should emit a warning to stderr and
    // still produce root-level output (orig behavior). Compare stdout only.
    {
      const orig = normalize(runCli(ORIG_CLI, [fixturePath, '999999']));
      const next = normalize(runCli(NEW_CLI, [fixturePath, '999999']));
      assertEqual(next, orig, 'invalid node id (999999)');
    }

    console.log('\nAll system tests passed.');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
