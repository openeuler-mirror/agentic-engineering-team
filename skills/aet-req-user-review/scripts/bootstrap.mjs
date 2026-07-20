#!/usr/bin/env node
/**
 * Bootstrap script - Auto-installs dependencies on first run
 *
 * Usage: node bootstrap.mjs <command> [args...]
 * Commands: prepare-revision, finalize-revision
 *
 * Options:
 *   --source <path>        Source file path(s), used for session identification
 *   --max-size <bytes>     Max file size limit (default: 10MB)
 *   --ttl <hours>          Session TTL (default: 24 hours)
 *
 * Requires: Node.js >= 18.0.0
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const nodeModulesDir = join(__dirname, 'node_modules');

// Check if dependencies are installed
if (!existsSync(nodeModulesDir)) {
  const pkgPath = join(__dirname, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  const deps = pkg.dependencies || {};

  if (Object.keys(deps).length > 0) {
    console.log('⏳ 首次运行，自动安装依赖...');
    console.log(`   依赖: ${Object.keys(deps).join(', ')}\n`);

    try {
      execSync('npm install --no-audit --no-fund --silent', {
        cwd: __dirname,
        stdio: 'inherit',
      });
      console.log('\n✅ 依赖安装完成，继续执行...\n');
    } catch (error) {
      console.error('❌ 依赖安装失败，请手动执行: npm install');
      process.exit(1);
    }
  }
}

// Get command and arguments
const args = process.argv.slice(2);
const command = args[0];

if (!command) {
  console.error('Usage: node bootstrap.mjs <command> [args...]');
  console.error('');
  console.error('Commands:');
  console.error('  prepare-revision --source <path> [--source <path2> ...]');
  console.error('  finalize-revision --source <path> [--source <path2> ...]');
  console.error('');
  console.error('Options:');
  console.error('  --source <path>        Source file path(s), used for session identification');
  console.error('  --max-size <bytes>     Max file size limit (default: 10MB)');
  console.error('  --ttl <hours>          Session TTL (default: 24 hours)');
  console.error('');
  console.error('Requires: Node.js >= 18.0.0');
  process.exit(1);
}

// Map command to script
const scriptMap = {
  'prepare-revision': './prepare-revision.mjs',
  'finalize-revision': './finalize-revision.mjs',
};

const scriptPath = scriptMap[command];
if (!scriptPath) {
  console.error(`Unknown command: ${command}`);
  console.error('Available commands: prepare-revision, finalize-revision');
  process.exit(1);
}

// Pass remaining arguments to the script
const scriptArgs = args.slice(1);
process.argv = [process.argv[0], join(__dirname, scriptPath), ...scriptArgs];

// Dynamically import and execute the script
await import(scriptPath);