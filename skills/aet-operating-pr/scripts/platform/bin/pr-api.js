#!/usr/bin/env node

/**
 * PR API CLI Tool - Manage GitHub/GitCode/GitLab pull requests
 */

const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');

/**
 * Walk up from `startDir` looking for `relativePath`. Sync, no deps.
 */
function findConfigFileSync(startDir, relativePath) {
  let currentDir = path.resolve(startDir);
  const rootDir = path.parse(currentDir).root;
  while (true) {
    const candidate = path.join(currentDir, relativePath);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    if (currentDir === rootDir) return null;
    const parent = path.dirname(currentDir);
    if (parent === currentDir) return null;
    currentDir = parent;
  }
}

/**
 * Detect GitLab platform from project/global config and, if found, set
 * NODE_TLS_REJECT_UNAUTHORIZED=0 so axios accepts the self-signed certs
 * that self-hosted GitLab installs typically present.
 *
 * MUST run before any module that may create HTTPS agents is required.
 */
function configureForGitLab() {
  try {
    const projectConfigPath = findConfigFileSync(process.cwd(), '.aet/config.json');
    if (projectConfigPath) {
      const config = JSON.parse(fs.readFileSync(projectConfigPath, 'utf-8'));
      if (config.codePlatform &&
          config.codePlatform.platform &&
          config.codePlatform.platform.type === 'gitlab') {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        return;
      }
      return;
    }

    const os = require('os');
    const globalConfigPath = path.join(os.homedir(), '.aet', 'config.json');
    if (fs.existsSync(globalConfigPath)) {
      const globalConfig = JSON.parse(fs.readFileSync(globalConfigPath, 'utf-8'));
      if (globalConfig.codePlatform &&
          globalConfig.codePlatform.platforms &&
          globalConfig.codePlatform.platforms.gitlab) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      }
    }
  } catch (_error) {
    // Silently ignore — SSL handling falls back to client-level https.Agent.
  }
}

configureForGitLab();

// Cache for dependency installation status
let dependenciesChecked = false;
let installationInProgress = false;

/**
 * Check if dependencies are installed and install them if missing
 */
async function checkAndInstallDependencies() {
  // If already checked or installation in progress, return
  if (dependenciesChecked || installationInProgress) {
    return;
  }

  const platformDir = path.join(__dirname, '..');
  const packageJsonPath = path.join(platformDir, 'package.json');
  
  // Check if package.json exists
  if (!fs.existsSync(packageJsonPath)) {
    console.error('Error: package.json not found in', platformDir);
    console.error('Please ensure the platform API scripts are properly installed.');
    process.exit(1);
  }
  
  // Check if dependencies are installed by trying to require a key dependency
  try {
    // Try to require commander - a key dependency
    require.resolve('commander', { paths: [platformDir] });
    dependenciesChecked = true;
    return;
  } catch (error) {
    // Dependencies not installed, continue to installation
  }
  
  // Dependencies missing, attempt to install
  installationInProgress = true;
  console.log('📦 Dependencies not found. Installing...');
  
  try {
    await installDependencies(platformDir);
    dependenciesChecked = true;
    installationInProgress = false;
    console.log('✅ Dependencies installed successfully.');
  } catch (error) {
    installationInProgress = false;
    handleInstallationError(error, platformDir);
  }
}

/**
 * Install dependencies using npm
 */
function installDependencies(platformDir) {
  return new Promise((resolve, reject) => {
    // Determine npm command based on platform
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    
    console.log('   Running npm install...');
    
    const installCmd = `${npmCmd} install --no-audit --no-fund --loglevel=error`;
    
    exec(installCmd, { cwd: platformDir, timeout: 5 * 60 * 1000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`npm install failed: ${error.message}`));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Handle installation errors with user-friendly messages
 */
function handleInstallationError(error, platformDir) {
  console.error('\n❌ Failed to install dependencies:');
  
  if (error.code === 'ENOENT' && error.path && error.path.includes('npm')) {
    console.error('   npm is not installed or not in PATH.');
    console.error('   Please install Node.js and npm first:');
    console.error('   - Download from https://nodejs.org/');
    console.error('   - Or use package manager:');
    console.error('     macOS: brew install node');
    console.error('     Ubuntu: sudo apt install nodejs npm');
    console.error('     Windows: Use Node.js installer');
  } else if (error.code === 'EACCES') {
    console.error('   Permission denied when installing dependencies.');
    console.error('   You may need to run with elevated privileges or fix permissions:');
    console.error(`   sudo npm install --prefix ${platformDir}`);
    console.error('   Or fix directory permissions:');
    console.error(`   sudo chown -R $(whoami) ${platformDir}`);
  } else if (error.message.includes('timed out')) {
    console.error('   Installation timed out. Network may be slow.');
    console.error('   Try installing manually:');
    console.error(`   cd ${platformDir} && npm install`);
  } else {
    console.error(`   ${error.message}`);
    console.error('   Try installing manually:');
    console.error(`   cd ${platformDir} && npm install`);
    
    if (error.stderr) {
      console.error('\n   npm error output:');
      console.error('   ' + error.stderr.split('\n').join('\n   '));
    }
  }
  
  console.error('\n💡 After installing dependencies, run the command again.');
  process.exit(1);
}

/**
 * Main execution
 */
async function main() {
  try {
    // Check and install dependencies before loading main module
    await checkAndInstallDependencies();
    
    // Check if running in scripts/platform directory
    const mainEntry = path.join(__dirname, '..', 'src', 'index.js');
    if (fs.existsSync(mainEntry)) {
      // Load main module and call main function
      const { main } = require(mainEntry);
      await main().catch((error) => {
        console.error('Fatal error:', error.message);
        if (process.env.NODE_ENV === 'development') {
          console.error(error.stack);
        }
        process.exit(1);
      });
    } else {
      console.error('Error: Main entry file not found, ensure project structure is complete');
      process.exit(1);
    }
  } catch (error) {
    console.error('Unexpected error:', error.message);
    if (process.env.NODE_ENV === 'development') {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run main function
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error.message);
    if (process.env.NODE_ENV === 'development') {
      console.error(error.stack);
    }
    process.exit(1);
  });
}

module.exports = { main };