/**
 * ST for context.ts — end-to-end byte-level comparison against the original
 * aet.js formatProjectAnalysis() reference implementation.
 *
 * Strategy:
 *   1. Create a temp project root with .aet/project-analysis/ fixture.
 *   2. Run `node scripts/aet-design-env.mjs context project-analysis` with cwd=tmp root.
 *   3. In parallel, inline-evaluate the aet.js formatProjectAnalysis function on the
 *      same root (via a small node -e harness that imports the plugin module
 *      function and prints the result).
 *   4. Assert byte-identical stdout.
 *
 * Since aet.js is an ESM module using @opencode-ai/plugin which we cannot import
 * in isolation, we instead inline the reference implementation verbatim (copied
 * from .opencode/plugins/aet.js lines 22-193) into a separate reference script
 * and compare against that. This guards against any drift in our context.ts.
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = resolve(__dirname, '..', '..', '..', '..');
const ENTRY = join(SKILL_DIR, 'scripts', 'aet-design-env.mjs');

let totalPassed = 0;
let totalFailed = 0;

function assert(cond, msg) {
  if (cond) { totalPassed++; console.log(`  PASS: ${msg}`); }
  else { totalFailed++; console.error(`  FAIL: ${msg}`); }
}

/** Reference implementation copied verbatim from aet.js (lines 22-193). */
function makeReferenceScript() {
  return `
import path from 'node:path';
import fs from 'fs';

function ensureStringPath(input) {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object' && input.path) return input.path;
  return null;
}
function extractFrontmatter(content) {
  if (!content || typeof content !== 'string') return '';
  try { const match = content.match(/^---\\n([\\s\\S]*?)\\n---/); return match ? match[1] : ''; }
  catch (err) { return ''; }
}
function readMarkdownFile(filePath) {
  if (!filePath) return null;
  try { if (!fs.existsSync(filePath)) return null; return fs.readFileSync(filePath, 'utf-8'); }
  catch (err) { return null; }
}
function readMarkdownMetadata(filePath) {
  const content = readMarkdownFile(filePath);
  if (!content) return null;
  const metadata = extractFrontmatter(content);
  return metadata || null;
}
function extractDescriptionFromFrontmatter(frontmatter) {
  if (!frontmatter || typeof frontmatter !== 'string') return null;
  const match = frontmatter.match(/^description:\\s*(?:["'](.+?)["']|(.+))$/m);
  return match ? (match[1] || match[2]).trim() : null;
}
function findCaseInsensitiveFile(dirPath, filename) {
  if (!dirPath || !filename) return null;
  try {
    if (!fs.existsSync(dirPath)) return null;
    const lowerTarget = filename.toLowerCase();
    const files = fs.readdirSync(dirPath);
    const match = files.find(f => f.toLowerCase() === lowerTarget);
    return match ? path.join(dirPath, match) : null;
  } catch (err) { return null; }
}
function getMarkdownFiles(dirPath) {
  if (!dirPath) return [];
  try {
    if (!fs.existsSync(dirPath)) return [];
    const files = fs.readdirSync(dirPath);
    return files.filter(f => f && f.toLowerCase().endsWith('.md')).map(f => path.join(dirPath, f));
  } catch (err) { return []; }
}
function formatProjectAnalysis(projectRoot) {
  try {
    const root = ensureStringPath(projectRoot);
    if (!root) return null;
    const analysisDir = path.join(root, '.aet', 'project-analysis');
    if (!fs.existsSync(analysisDir)) return null;
    const architecturePath = findCaseInsensitiveFile(analysisDir, 'Architecture.md');
    const modulesPath = findCaseInsensitiveFile(analysisDir, 'Modules.md');
    const componentsDir = path.join(analysisDir, 'components');
    const principlesDir = path.join(analysisDir, 'principles');
    let output = '<project-analysis>\\n';
    const architectureContent = architecturePath ? readMarkdownFile(architecturePath) : null;
    if (architectureContent) {
      output += '\\n<architecture>\\n';
      output += '<path>' + architecturePath + '</path>\\n';
      output += '<content>' + architectureContent + '</content>\\n';
      output += '</architecture>\\n';
    }
    const modulesContent = modulesPath ? readMarkdownFile(modulesPath) : null;
    if (modulesContent) {
      output += '\\n<modules>\\n';
      output += '<path>' + modulesPath + '</path>\\n';
      output += '<content>' + modulesContent + '</content>\\n';
      output += '</modules>\\n';
    }
    const componentFiles = getMarkdownFiles(componentsDir);
    const validComponents = [];
    for (const filePath of componentFiles) {
      const metadata = readMarkdownMetadata(filePath);
      if (metadata && metadata.trim().length > 0) {
        const description = extractDescriptionFromFrontmatter(metadata);
        validComponents.push({ filePath, description });
      }
    }
    if (validComponents.length > 0) {
      output += '\\n<components>\\n';
      for (const item of validComponents) {
        if (item.description) {
          output += '<item>\\n';
          output += '<path>' + item.filePath + '</path>\\n';
          output += '<description>' + item.description + '</description>\\n';
          output += '</item>\\n';
        }
      }
      output += '</components>\\n';
    }
    const principleFiles = getMarkdownFiles(principlesDir);
    const validPrinciples = [];
    for (const filePath of principleFiles) {
      const metadata = readMarkdownMetadata(filePath);
      if (metadata && metadata.trim().length > 0) {
        const description = extractDescriptionFromFrontmatter(metadata);
        validPrinciples.push({ filePath, description });
      }
    }
    if (validPrinciples.length > 0) {
      output += '\\n<principles>\\n';
      for (const item of validPrinciples) {
        if (item.description) {
          output += '<item>\\n';
          output += '<path>' + item.filePath + '</path>\\n';
          output += '<description>' + item.description + '</description>\\n';
          output += '</item>\\n';
        }
      }
      output += '</principles>\\n';
    }
    output += '</project-analysis>';
    return output;
  } catch (err) { return null; }
}

const root = process.argv[2];
const result = formatProjectAnalysis(root);
process.stdout.write(result === null ? '' : result);
`;
}

const REFERENCE_SCRIPT = makeReferenceScript();

/**
 * Normalize a context output string for byte-comparison:
 *   - strip trailing whitespace (actual uses console.log which appends \n;
 *     reference uses process.stdout.write without trailing \n)
 *   - collapse the macOS /var → /private/var symlink so paths emitted from
 *     process.cwd() (realpath-resolved) match those from a raw mkdtemp path.
 */
function normalize(s) {
  if (s == null) return '';
  return String(s)
    .replace(/\/private\/var\//g, '/var/')
    .replace(/\s+$/, '');
}

function runContextCwd(projectRoot) {
  // Default mode: project root derived from process.cwd() (= projectRoot).
  try {
    return execFileSync('node', [ENTRY, 'context', 'project-analysis'], {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    const e = err;
    return (e.stdout ?? '') + '[STDERR]' + (e.stderr ?? '');
  }
}

function runContextArg(projectRoot) {
  // Path-arg mode: pass the project root via `--root`. Run from a
  // DIFFERENT cwd (the system tmpdir) to prove the override works.
  try {
    return execFileSync('node', [ENTRY, 'context', 'project-analysis', '--root', projectRoot], {
      cwd: tmpdir(),
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    const e = err;
    return (e.stdout ?? '') + '[STDERR]' + (e.stderr ?? '');
  }
}

function runReference(projectRoot) {
  const refFile = join(projectRoot, '_reference.mjs');
  writeFileSync(refFile, REFERENCE_SCRIPT);
  try {
    return execFileSync('node', [refFile, projectRoot], {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    const e = err;
    return (e.stdout ?? '') + '[STDERR]' + (e.stderr ?? '');
  }
}

function makeProject(name, setup) {
  const root = mkdtempSync(join(tmpdir(), `aet-ctx-st-${name}-`));
  setup(root);
  return root;
}

const cases = [
  {
    name: 'empty-folder',
    setup: (root) => {
      mkdirSync(join(root, '.aet', 'project-analysis'), { recursive: true });
    },
  },
  {
    name: 'architecture-only-lowercase',
    setup: (root) => {
      const dir = join(root, '.aet', 'project-analysis');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'architecture.md'), '# Arch\n\nDetail.\n');
    },
  },
  {
    name: 'modules-only',
    setup: (root) => {
      const dir = join(root, '.aet', 'project-analysis');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'Modules.md'), '# Modules\n');
    },
  },
  {
    name: 'full-all-four',
    setup: (root) => {
      const dir = join(root, '.aet', 'project-analysis');
      const compDir = join(dir, 'components');
      const prinDir = join(dir, 'principles');
      mkdirSync(compDir, { recursive: true });
      mkdirSync(prinDir, { recursive: true });
      writeFileSync(join(dir, 'Architecture.md'), '# Architecture\n');
      writeFileSync(join(dir, 'Modules.md'), '# Modules\n');
      writeFileSync(join(compDir, 'a.md'), '---\ndescription: Component A\n---\nbody');
      writeFileSync(join(compDir, 'b.md'), '---\nid: b-no-desc\n---\nbody'); // skipped
      writeFileSync(join(prinDir, 'p1.md'), '---\ndescription: "Principle One"\n---\n');
      writeFileSync(join(prinDir, 'p2.md'), 'no frontmatter'); // skipped
    },
  },
  {
    name: 'components-skip-without-desc',
    setup: (root) => {
      const dir = join(root, '.aet', 'project-analysis');
      const compDir = join(dir, 'components');
      mkdirSync(compDir, { recursive: true });
      writeFileSync(join(compDir, 'a.md'), '---\ndescription: A\n---\n');
      writeFileSync(join(compDir, 'b.md'), '---\nid: b\n---\n');
      writeFileSync(join(compDir, 'c.md'), 'plain body');
    },
  },
  {
    name: 'quoted-description',
    setup: (root) => {
      const dir = join(root, '.aet', 'project-analysis');
      const compDir = join(dir, 'components');
      mkdirSync(compDir, { recursive: true });
      writeFileSync(join(compDir, 'a.md'), '---\ndescription: \'single quoted desc\'\n---\n');
      writeFileSync(join(compDir, 'b.md'), '---\ndescription: "double quoted"\n---\n');
    },
  },
];

for (const c of cases) {
  console.log(`\n[ST] context: ${c.name}`);
  const root = makeProject(c.name, c.setup);
  try {
    const expected = normalize(runReference(root));

    // Mode 1: cwd-based (default).
    const actualCwd = normalize(runContextCwd(root));
    if (actualCwd === expected) {
      assert(true, `cwd mode byte-identical`);
    } else {
      assert(false, `cwd mode byte-identical`);
      console.error('  --- EXPECTED ---'); console.error(JSON.stringify(expected));
      console.error('  --- ACTUAL (cwd) ---'); console.error(JSON.stringify(actualCwd));
    }

    // Mode 2: path-arg override (run from tmpdir cwd, pass root as arg).
    const actualArg = normalize(runContextArg(root));
    if (actualArg === expected) {
      assert(true, `path-arg mode byte-identical`);
    } else {
      assert(false, `path-arg mode byte-identical`);
      console.error('  --- EXPECTED ---'); console.error(JSON.stringify(expected));
      console.error('  --- ACTUAL (arg) ---'); console.error(JSON.stringify(actualArg));
    }

    // Content sanity check.
    if (c.name !== 'empty-folder') {
      assert(actualCwd.length > 0, 'produced non-empty output');
    } else {
      assert(actualCwd === '<project-analysis>\n</project-analysis>', 'empty folder yields minimal envelope');
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

console.log(`\nST context: ${totalPassed} passed, ${totalFailed} failed`);
if (totalFailed > 0) process.exit(1);
