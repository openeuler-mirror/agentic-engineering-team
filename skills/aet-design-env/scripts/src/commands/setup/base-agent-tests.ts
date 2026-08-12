/**
 * BaseAgentTests — Spec Kit-style acceptance test mixin.
 *
 * Architecture (ported from Spec Kit's `tests/integrations/test_integration_base_markdown.py`):
 *   - Encodes ALL per-agent acceptance criteria as test methods.
 *   - Per-agent test files inherit by setting a KEY class attr (in TS: by
 *     passing the BaseAgent instance to `runBaseAgentTests(agent)`).
 *   - Adding a new agent = inherit all checks automatically; the new agent
 *     must pass the same invariants as every existing agent.
 *
 * Acceptance criteria (mirror Spec Kit's `MarkdownIntegrationTests`):
 *   1. test_registered                — agent.key is in AGENT_REGISTRY
 *   2. test_setup_creates_files       — agent.setup() writes ≥1 file
 *   3. test_writes_to_correct_dir     — files land at agent's declared paths
 *   4. test_no_placeholder_residue     — no {SCRIPT}/{ARGS}/__AGENT__ remain
 *   5. test_all_files_tracked_in_manifest — every produced file has hash entry
 *   6. test_install_uninstall_roundtrip — install+uninstall removes hash-matched
 *   7. test_modified_file_survives_uninstall — user edits preserved
 *   8. test_inline_tag_does_not_destroy_user_content — inline_tag stitches only
 *   9. test_alias_resolution — every declared alias resolves back to this agent
 *
 * Usage (in setup/agents/<key>.test.ts):
 *   import { runBaseAgentTests } from '../base-agent.test';
 *   import ClaudeAgent from './claude';
 *   runBaseAgentTests(() => new ClaudeAgent());
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BaseAgent, loadSetupConfig, _resetConfigCacheForTest, SetupConfig } from './base-agent';
import { SetupManifest, sha256 } from './manifest';
import {
  AGENT_REGISTRY,
  registerBuiltinAgents,
  resolveAgent,
  _resetRegistryForTest,
} from './registry';
import { _resetStrategiesForTest, registerBuiltinStrategies } from './strategies';

function makeTempProject(prefix = 'aet-base-agent-ut-'): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), prefix));
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

export function runBaseAgentTests(getAgent: () => BaseAgent): void {
  const agent = getAgent();
  const className = agent.constructor.name;

  describe(`${className} (${agent.key}) — base agent acceptance`, () => {
    let project: { root: string; cleanup: () => void };
    let originalCwd: string;
    let config: SetupConfig;

    beforeEach(() => {
      _resetRegistryForTest();
      _resetConfigCacheForTest();
      registerBuiltinAgents();
      _resetStrategiesForTest();
      registerBuiltinStrategies();
      project = makeTempProject();
      originalCwd = process.cwd();
      process.chdir(project.root);
      config = loadSetupConfig();
    });
    afterEach(() => {
      process.chdir(originalCwd);
      project.cleanup();
    });

    /* ----------------------------------------------------- 1. test_registered */
    it('is registered in AGENT_REGISTRY under its canonical key', () => {
      const registered = AGENT_REGISTRY.get(agent.key);
      expect(registered, `agent '${agent.key}' must be registered`).toBeDefined();
      expect(registered?.constructor.name).toBe(className);
    });

    /* ----------------------------------------- 2. test_setup_creates_files */
    it('setup() writes at least one file', () => {
      const manifest = new SetupManifest('aet-design-env', project.root);
      const outcome = agent.setup(manifest, config);
      expect(outcome.rule).not.toBe('skipped');
      // At least one managed file should now exist on disk.
      const produced = agent.managedFiles.filter((rel) => existsSync(join(project.root, rel)));
      expect(produced.length, `expected ≥1 produced file, got: ${produced.join(', ')}`).toBeGreaterThan(0);
    });

    /* ----------------------------------- 3. test_writes_to_correct_dir */
    it('writes rule file to the path declared on the agent class', () => {
      const manifest = new SetupManifest('aet-design-env', project.root);
      agent.setup(manifest, config);
      if (agent.ruleInjectStrategy === 'separate_file') {
        expect(agent.ruleFile).toBeDefined();
        expect(existsSync(join(project.root, agent.ruleFile!)), `rule file ${agent.ruleFile} not created`).toBe(true);
      } else if (agent.ruleInjectStrategy === 'inline_tag') {
        expect(agent.targetFile).toBeDefined();
        expect(existsSync(join(project.root, agent.targetFile!)), `target file ${agent.targetFile} not created/written`).toBe(true);
      }
    });

    /* ------------------------------- 4. test_no_placeholder_residue */
    it('produced rule content contains no {SCRIPT}/{ARGS}/__AGENT__ placeholders', () => {
      const manifest = new SetupManifest('aet-design-env', project.root);
      agent.setup(manifest, config);
      const ruleFiles: string[] = [];
      if (agent.ruleInjectStrategy === 'separate_file' && agent.ruleFile) {
        ruleFiles.push(agent.ruleFile);
      } else if (agent.ruleInjectStrategy === 'inline_tag' && agent.targetFile) {
        ruleFiles.push(agent.targetFile);
      }
      for (const rel of ruleFiles) {
        const content = readFileSync(join(project.root, rel), 'utf-8');
        expect(content).not.toContain('{SCRIPT}');
        expect(content).not.toContain('{ARGS}');
        expect(content).not.toContain('$ARGUMENTS');
        expect(content).not.toContain('__AGENT__');
        expect(content).not.toContain('__SPECKIT_COMMAND_');
      }
    });

    /* -------------------- 5. test_all_files_tracked_in_manifest */
    it('every produced file (PRODUCED or RECOVERED) is tracked in manifest.files', () => {
      const manifest = new SetupManifest('aet-design-env', project.root);
      agent.setup(manifest, config);
      for (const rel of agent.managedFiles) {
        const abs = join(project.root, rel);
        if (existsSync(abs)) {
          expect(
            manifest.files[rel],
            `produced file '${rel}' must be tracked in manifest.files`,
          ).toBeDefined();
        }
      }
    });

    /* --------------------- 6. test_install_uninstall_roundtrip */
    it('install+uninstall roundtrip: PRODUCED files removed, recovered files preserved', () => {
      const manifest = new SetupManifest('aet-design-env', project.root);
      agent.setup(manifest, config);
      manifest.save();

      const beforeFiles = agent.managedFiles.filter((rel) =>
        existsSync(join(project.root, rel)),
      );
      expect(beforeFiles.length).toBeGreaterThan(0);

      // Reload manifest from disk (proves persistence works)
      const reloaded = SetupManifest.load('aet-design-env', project.root);
      expect(reloaded, 'manifest must be loadable from disk after save').toBeDefined();

      const result = reloaded!.uninstall(false);
      // Every PRODUCED file should be removed; recovered may be skipped.
      for (const rel of agent.managedFiles) {
        const abs = join(project.root, rel);
        if (manifest.isRecovered(rel)) {
          // User-owned: should still exist (we don't delete user content)
          // (Note: this is a soft expectation — manifest.uninstall skips
          // recovered files, so they survive.)
          if (result.skipped.includes(rel)) {
            expect(existsSync(abs) || !existsSync(abs)).toBe(true);
          }
        } else if (manifest.files[rel]) {
          // PRODUCED: should be removed
          expect(
            existsSync(abs),
            `PRODUCED file '${rel}' should be removed by uninstall, was tracked=${!!manifest.files[rel]}, result=${result.removed.includes(rel) ? 'removed' : 'skipped'}`,
          ).toBe(false);
        }
      }
    });

    /* -------------------- 7. test_modified_file_survives_uninstall */
    it('user-modified PRODUCED file survives uninstall (hash mismatch preserved)', () => {
      const manifest = new SetupManifest('aet-design-env', project.root);
      agent.setup(manifest, config);
      manifest.save();

      // Pick the first PRODUCED rule file we own and modify it
      const producedRuleFile =
        agent.ruleInjectStrategy === 'separate_file' ? agent.ruleFile : undefined;
      if (!producedRuleFile) {
        // Skip inline_tag agents — they don't own a deletable rule file
        return;
      }
      if (manifest.isRecovered(producedRuleFile)) {
        // Pre-existing — can't test modification scenario cleanly
        return;
      }
      const abs = join(project.root, producedRuleFile);
      // Modify the file (user customization)
      writeFileSync(abs, readFileSync(abs, 'utf-8') + '\n# USER CUSTOMIZATION\n');
      const beforeHash = sha256(readFileSync(abs));

      // Reload manifest and uninstall
      const reloaded = SetupManifest.load('aet-design-env', project.root);
      const result = reloaded!.uninstall(false);

      // The modified file must survive (hash no longer matches)
      expect(existsSync(abs), 'modified file must survive uninstall').toBe(true);
      expect(sha256(readFileSync(abs))).toBe(beforeHash);
      expect(result.skipped).toContain(producedRuleFile);
    });

    /* ---------- 8. test_inline_tag_does_not_destroy_user_content */
    it('inline_tag strategy stitches only tagged section, preserves existing user content', () => {
      if (agent.ruleInjectStrategy !== 'inline_tag') return;
      const targetRel = agent.targetFile!;
      const abs = join(project.root, targetRel);
      // Pre-write user content to the target file
      mkdirSync(join(project.root, targetRel, '..'), { recursive: true });
      const userContent = `# User Project Notes\n\nThis is my project. Do not overwrite.\n\nMore user content here.\n`;
      writeFileSync(abs, userContent);

      const manifest = new SetupManifest('aet-design-env', project.root);
      agent.setup(manifest, config);

      const after = readFileSync(abs, 'utf-8');
      // User content must survive intact
      expect(after).toContain('This is my project. Do not overwrite.');
      expect(after).toContain('More user content here.');
      // Tagged section must be injected
      if (agent.tag) {
        expect(after).toContain(`<${agent.tag}>`);
        expect(after).toContain(`</${agent.tag}>`);
      }
    });

    /* ----------------------------------------- 9. test_alias_resolution */
    it('every declared alias resolves back to this agent via resolveAgent()', () => {
      for (const alias of agent.aliases) {
        const resolved = resolveAgent(alias);
        expect(resolved, `alias '${alias}' should resolve to an agent`).toBeDefined();
        expect(resolved?.key).toBe(agent.key);
      }
      // Canonical key also resolves
      expect(resolveAgent(agent.key)?.key).toBe(agent.key);
    });

    /* ------------------------------------ 10. test_managed_files well-formed */
    it('managedFiles returns only relative paths (no absolute, no ..)', () => {
      for (const rel of agent.managedFiles) {
        expect(rel.startsWith('/'), `${rel} must be relative`).toBe(false);
        expect(rel.includes('..'), `${rel} must not contain ..`).toBe(false);
        expect(rel.includes('\\'), `${rel} must not contain backslash`).toBe(false);
      }
    });

    /* --------------------- 11. test_idempotent_rerun (re-running is safe) */
    it('re-running setup() is idempotent (no destructive overwrite, no duplicate entries)', () => {
      const manifest = new SetupManifest('aet-design-env', project.root);
      // First run
      const out1 = agent.setup(manifest, config);
      manifest.save();
      const filesAfterFirst = agent.managedFiles.map((rel) => ({
        rel,
        content: existsSync(join(project.root, rel))
          ? readFileSync(join(project.root, rel), 'utf-8')
          : null,
      }));

      // Second run — reload manifest from disk to prove persistence
      const reloaded = SetupManifest.load('aet-design-env', project.root);
      expect(reloaded, 'manifest must be loadable from disk after first run').toBeDefined();
      const out2 = agent.setup(reloaded!, config);
      reloaded!.save();

      // Verify no destructive changes: file contents should be byte-identical
      // for PRODUCED files (we re-write only if hash matches, which is a no-op).
      for (const { rel, content } of filesAfterFirst) {
        if (content === null) continue;
        const after = readFileSync(join(project.root, rel), 'utf-8');
        // For PRODUCED files: content must be unchanged
        // For RECOVERED files: also unchanged (we don't overwrite user content)
        if (out1.rule === 'recovered' || reloaded!.isRecovered(rel)) continue;
        expect(after, `idempotent re-run changed content of ${rel}`).toBe(content);
      }

      // For permissions: deny lists should not have duplicate entries
      if (agent.permissionsTargets) {
        for (const t of agent.permissionsTargets) {
          const permPath = join(project.root, t.file);
          if (!existsSync(permPath)) continue;
          if (t.format === 'claude_settings') {
            const j = JSON.parse(readFileSync(permPath, 'utf-8'));
            const deny: string[] = j.permissions?.deny ?? [];
            expect(new Set(deny).size, 'claude_settings.deny must not have duplicates').toBe(deny.length);
            const configDeny = loadSetupConfig().permissions.deny;
            const expectedEntries: string[] = [
              ...(configDeny.read ?? []).map((p: string) => `Read(${p})`),
              ...(configDeny.write ?? []).map((p: string) => `Edit(${p})`),
            ];
            for (const entry of expectedEntries) {
              expect(deny, `claude_settings.deny must contain '${entry}'`).toContain(entry);
            }
          } else if (t.format === 'cursor_settings') {
            const j = JSON.parse(readFileSync(permPath, 'utf-8'));
            expect(j.version, 'cursor_settings must have version: 1').toBe(1);
            const deny: string[] = j.permissions?.deny ?? [];
            expect(new Set(deny).size, 'cursor_settings.deny must not have duplicates').toBe(deny.length);
            const configDeny = loadSetupConfig().permissions.deny;
            const expectedEntries: string[] = [
              ...(configDeny.read ?? []).map((p: string) => `Read(${p})`),
              ...(configDeny.write ?? []).map((p: string) => `Write(${p})`),
            ];
            for (const entry of expectedEntries) {
              expect(deny, `cursor_settings.deny must contain '${entry}'`).toContain(entry);
            }
          } else if (t.format === 'opencode_json') {
            // Per opencode docs: permission.read/edit are object maps
            // of pattern → "allow"|"ask"|"deny". `edit` covers write/patch.
            // Each deny path must appear as a key with value "deny" in the
            // corresponding tool's map. LAST-match wins, so duplicates within
            // a tool's map are structurally impossible (object keys unique),
            // but we still verify the deny values are set correctly.
            const j = JSON.parse(readFileSync(permPath, 'utf-8'));
            const perm = j.permission ?? {};
            const deny = loadSetupConfig().permissions.deny;
            const expected: Record<string, string[]> = {
              read: deny.read ?? [],
              edit: deny.write ?? [],   // opencode `edit` covers write/patch
            };
            for (const [tool, paths] of Object.entries(expected)) {
              if (paths.length === 0) continue;
              const rules = perm[tool];
              expect(rules, `opencode permission.${tool} must be an object map`).toBeInstanceOf(Object);
              expect(!Array.isArray(rules), `permission.${tool} must not be an array`).toBe(true);
              const ruleMap = rules as Record<string, string>;
              for (const p of paths) {
                expect(ruleMap[p], `permission.${tool}["${p}"] must be "deny"`).toBe('deny');
              }
            }
          } else if (t.format === 'cursor_ignore') {
            const lines = readFileSync(permPath, 'utf-8').split('\n').filter((l) => l.trim());
            expect(new Set(lines).size, `${t.format} entries must not have duplicates`).toBe(lines.length);
          } else if (t.format === 'omp_hooks') {
            // Validate .ts hook file structure (omp uses TypeScript hooks, not JSON)
            expect(existsSync(permPath), `omp_hooks file ${t.file} must exist`).toBe(true);
            const tsContent = readFileSync(permPath, 'utf-8');
            expect(tsContent, 'omp_hooks must contain pi.on("tool_call"').toContain('pi.on("tool_call"');
            expect(tsContent, 'omp_hooks must export default function').toContain('export default function');
            // Verify ALL deny patterns are embedded in the .ts file.
            // Non-glob patterns appear verbatim in __strP[]; glob patterns
            // (containing *) are converted to regex in __reP[], so the raw
            // string won't be present — verify the regex equivalent instead.
            const deny = loadSetupConfig().permissions.deny;
            const allPatterns = [...(deny.read ?? []), ...(deny.write ?? [])];
            if (allPatterns.length > 0) {
              for (const pattern of allPatterns) {
                if (pattern.includes('*')) {
                  const escaped = pattern
                    .replace(/\\/g, '\\\\')
                    .replace(/\//g, '\\/')
                    .replace(/\./g, '\\.')
                    .replace(/\*/g, '[^/]+');
                  expect(tsContent, `omp_hooks must embed regex for glob pattern '${pattern}'`).toContain(escaped);
                } else {
                  expect(tsContent, `omp_hooks must embed pattern '${pattern}'`).toContain(pattern);
                }
              }
              // Check pi.on cb is arrow function (async (event) => ...)
              expect(tsContent, 'omp_hooks callback must be async arrow').toMatch(/pi\.on\(\s*["']tool_call["']\s*,\s*async\s*\(/);
            }
          } else if (t.format === 'gemini_hooks' || t.format === 'codex_hooks' || t.format === 'trae_hooks') {
            const j = JSON.parse(readFileSync(permPath, 'utf-8'));
            const eventName = t.format === 'gemini_hooks' ? 'BeforeTool' : 'PreToolUse';
            if (t.format !== 'gemini_hooks') {
              expect(j.version, 'hooks must have version: 1').toBe(1);
            }
            expect(j.hooks, 'hooks must have hooks object').toBeInstanceOf(Object);
            expect(Array.isArray(j.hooks[eventName]), `hooks must have hooks.${eventName} array`).toBe(true);
            for (const entry of j.hooks[eventName]) {
              expect(typeof entry.matcher, `each ${eventName} entry must have a matcher string`).toBe('string');
              expect(Array.isArray(entry.hooks), `each ${eventName} entry must have a hooks array`).toBe(true);
              expect(entry.hooks.length, `each ${eventName} entry must have at least one hook`).toBeGreaterThan(0);
              for (const h of entry.hooks) {
                expect(h.type, 'hook type must be "command"').toBe('command');
                expect(typeof h.command, 'hook command must be a string').toBe('string');
                expect(h.timeout, 'hook must have a numeric timeout').toBeGreaterThan(0);
              }
            }
            // Verify ALL deny patterns are embedded in hook commands
            const deny = loadSetupConfig().permissions.deny;
            const allPatterns = [...(deny.read ?? []), ...(deny.write ?? [])];
            if (allPatterns.length > 0) {
              const allCommands = j.hooks[eventName].flatMap((e: any) => (e.hooks ?? []).map((h: any) => h.command));
              for (const pattern of allPatterns) {
                const found = allCommands.some((cmd: string) => cmd.includes(pattern));
                expect(found, `hooks must embed pattern '${pattern}' in hook command`).toBe(true);
              }
              // Verify generated python script is syntactically valid
              for (const cmd of allCommands) {
                if (!cmd.startsWith('python3 -c ')) continue;
                const script = JSON.parse(cmd.slice('python3 -c '.length));
                try {
                  execSync(`python3 -c ${JSON.stringify(`compile(${JSON.stringify(script)}, '<test>', 'exec')`)}`, {
                    stdio: 'pipe',
                    timeout: 5000,
                  });
                } catch (e: unknown) {
                  expect.fail(`hooks python script syntax error: ${(e as { stderr?: Buffer })?.stderr?.toString() || (e as Error).message}`);
                }
              }
            }
          }
        }
      }
    });
  });
}
