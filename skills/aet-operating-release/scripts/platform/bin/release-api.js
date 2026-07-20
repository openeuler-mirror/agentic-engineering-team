#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');

let dependenciesChecked = false;
let installationInProgress = false;

async function checkAndInstallDependencies() {
  if (dependenciesChecked || installationInProgress) {
    return;
  }

  const platformDir = path.join(__dirname, '..');
  const packageJsonPath = path.join(platformDir, 'package.json');
  
  if (!fs.existsSync(packageJsonPath)) {
    console.error('Error: package.json not found in', platformDir);
    console.error('Please ensure the platform API scripts are properly installed.');
    process.exit(1);
  }
  
  try {
    require.resolve('commander', { paths: [platformDir] });
    dependenciesChecked = true;
    return;
  } catch (error) {
  }
  
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

function installDependencies(platformDir) {
  return new Promise((resolve, reject) => {
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

async function main() {
  try {
    await checkAndInstallDependencies();
    
    const mainEntry = path.join(__dirname, '..', 'src', 'index.js');
    if (fs.existsSync(mainEntry)) {
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