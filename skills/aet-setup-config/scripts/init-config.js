#!/usr/bin/env node

/**
 * AET (Agentic Engineering Team) Project Initialization Script
 * Creates .aet/config.json with repository information (upstream/fork)
 * Note: Token and platform type are configured in global config (~/.aet/config.json)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {
    upstreamOwner: null,
    upstreamRepo: null,
    forkOwner: null,
    platform: 'gitlab',
    mode: 'issue',
    localMainBranch: 'main',
    upstreamBranch: 'main'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--upstream-owner' && i + 1 < args.length) {
      params.upstreamOwner = args[++i];
    } else if (arg === '--upstream-repo' && i + 1 < args.length) {
      params.upstreamRepo = args[++i];
    } else if (arg === '--fork-owner' && i + 1 < args.length) {
      params.forkOwner = args[++i];
    } else if (arg === '--platform' && i + 1 < args.length) {
      params.platform = args[++i];
    } else if (arg === '--mode' && i + 1 < args.length) {
      params.mode = args[++i];
    } else if (arg === '--local-main-branch' && i + 1 < args.length) {
      params.localMainBranch = args[++i];
    } else if (arg === '--upstream-branch' && i + 1 < args.length) {
      params.upstreamBranch = args[++i];
    } else if (arg === '--help') {
      printHelp();
      process.exit(0);
    }
  }

  // Validate required parameters
  if (!params.upstreamOwner || !params.upstreamRepo) {
    console.error('Error: Missing required parameters');
    printHelp();
    process.exit(1);
  }

  return params;
}

function printHelp() {
  console.log(`
AET (Agentic Engineering Team) Project Initialization Script

Note: Token is NOT configured here.
      Tokens for each platform are stored in global config (~/.aet/config.json)
      Run: bash scripts/init-global-config.sh to configure tokens

Usage:
  node init-config.js [options]

Required Options:
  --upstream-owner OWNER    Upstream repository owner (user or organization)
  --upstream-repo REPO      Upstream repository name

Optional Options:
  --platform PLATFORM       Platform type: gitcode, github, gitlab (default: gitlab)
                            Determines which token to use from global config
  --fork-owner OWNER        Fork repository owner (for fork workflow)
  --mode MODE               Feature management mode: issue or pr (default: issue)
  --local-main-branch BRANCH   Local repository default branch (default: main)
  --upstream-branch BRANCH     Upstream repository default branch (default: main)
  --help                    Show this help message

Example:
  node init-config.js \\
    --upstream-owner myorg \\
    --upstream-repo myrepo \\
    --platform gitcode \\
    --fork-owner myusername \\
    --local-main-branch main \\
    --upstream-branch main

  # GitHub project
  node init-config.js \\
    --upstream-owner myorg \\
    --upstream-repo myrepo \\
    --platform github
`);
}

function loadDefaultTemplate() {
  const templatePath = path.join(__dirname, 'project-config-template.json');
  try {
    const templateContent = fs.readFileSync(templatePath, 'utf8');
    return JSON.parse(templateContent);
  } catch (error) {
    console.error(`Warning: Could not load project config template: ${error.message}`);
    console.error('Using minimal fallback configuration');
    return {
      version: "1.0",
      codePlatform: {}
    };
  }
}

function createConfig(params) {
  // Load the project config template (only contains project-specific config)
  const config = loadDefaultTemplate();

  // Override codePlatform section with user-provided values
  config.codePlatform.mode = params.mode;

  // Set platform type (determines which token to use from global config)
  config.codePlatform.platform.type = params.platform;

  // Update codebaseSync section
  config.codePlatform.codebaseSync = {
    enabled: false,
    autoSyncOnClaim: false,
    autoSyncOnCreate: false,
    localMainBranch: params.localMainBranch,
    upstreamBranch: params.upstreamBranch,
    syncStrategy: 'merge',
    requireCleanWorkingDir: false
  };

  // Update upstream info
  config.codePlatform.upstream = {
    owner: params.upstreamOwner,
    repository: params.upstreamRepo
  };

  // Update fork info if provided
  if (params.forkOwner) {
    config.codePlatform.fork = {
      owner: params.forkOwner,
      repository: params.upstreamRepo
    };
  }

  return config;
}

function updateGitignore() {
  const gitignorePath = path.join(process.cwd(), '.gitignore');

  try {
    // Check if .gitignore exists
    if (!fs.existsSync(gitignorePath)) {
      // Create .gitignore with .aet entry
      const content = `# Agent development configuration
.aet/
`;
      fs.writeFileSync(gitignorePath, content, 'utf8');
      console.log(`Created .gitignore file with .aet/ entry: ${gitignorePath}`);
      return true;
    }

    // Read existing .gitignore content
    const content = fs.readFileSync(gitignorePath, 'utf8');

    // Check if .aet already exists in .gitignore
    const lines = content.split('\n');
    let hasAgentdev = false;

    for (const line of lines) {
      const trimmed = line.trim();
      // Check for .aet or .aet/ (with or without trailing slash)
      if (trimmed === '.aet' || trimmed === '.aet/') {
        hasAgentdev = true;
        break;
      }
    }

    if (!hasAgentdev) {
      // Add .aet to .gitignore
      const updatedContent = content.trim() + `\n\n# Agent development configuration\n.aet/\n`;
      fs.writeFileSync(gitignorePath, updatedContent, 'utf8');
      console.log(`Added .aet/ to .gitignore: ${gitignorePath}`);
      return true;
    } else {
      console.log(`.aet/ already exists in .gitignore`);
      return false;
    }
  } catch (error) {
    console.error(`Warning: Could not update .gitignore: ${error.message}`);
    console.error('Please manually add .aet/ to .gitignore to prevent accidental commits');
    return false;
  }
}

function main() {
  try {
    const params = parseArgs();

    // Create .aet directory in current working directory
    const aetDir = path.join(process.cwd(), '.aet');
    if (!fs.existsSync(aetDir)) {
      fs.mkdirSync(aetDir, { recursive: true });
      console.log(`Created directory: ${aetDir}`);
    }

    // Create features subdirectory
    const featuresDir = path.join(aetDir, 'features');
    if (!fs.existsSync(featuresDir)) {
      fs.mkdirSync(featuresDir, { recursive: true });
      console.log(`Created directory: ${featuresDir}`);
    }

    // Create project-analysis subdirectory
    const projectAnalyzerDir = path.join(aetDir, 'project-analysis');
    if (!fs.existsSync(projectAnalyzerDir)) {
      fs.mkdirSync(projectAnalyzerDir, { recursive: true });
      console.log(`Created directory: ${projectAnalyzerDir}`);
    }

    // Create config file
    const configFile = path.join(aetDir, 'config.json');
    const config = createConfig(params);
    const configJson = JSON.stringify(config, null, 2);

    fs.writeFileSync(configFile, configJson, 'utf8');
    console.log(`Configuration file created: ${configFile}`);

    // Update .gitignore to include .aet
    updateGitignore();

    // Configuration reminder
    console.log('\n📋 Configuration Notes:');
    console.log(`- Platform: ${params.platform} (token from global config ~/.aet/config.json)`);
    console.log('- Project config (.aet/config.json) contains repository info and platform type');
    console.log('- .aet/ has been added to .gitignore automatically');

    // Verify file was created
    if (fs.existsSync(configFile)) {
      console.log('\n✅ Project initialization completed successfully!');
    } else {
      console.error('\n❌ Error: Configuration file was not created');
      process.exit(1);
    }
  } catch (error) {
    console.error(`\n❌ Error during initialization: ${error.message}`);
    process.exit(1);
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { createConfig, parseArgs, updateGitignore, loadDefaultTemplate };