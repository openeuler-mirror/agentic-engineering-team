/**
 * Command Line Interface Configuration - Multi-platform support
 */

const { Command } = require('commander');
const chalk = require('chalk');
const { version } = require('../../package.json');

const program = new Command();

program
  .name('release-api')
  .description('Release API CLI Tool - Manage GitHub/GitCode/GitLab releases')
  .version(version)
  .option('-c, --config <path>', 'Config file path', '.aet/config.json')
  .option('-p, --platform <platform>', 'Platform type (github/gitcode/gitlab)', 'gitcode')
  .option('--token <token>', 'API token (overrides config)')
  .option('-o, --owner <owner>', 'Repository owner (overrides config)')
  .option('-r, --repo <repository>', 'Repository name (overrides config)')
  .option('-v, --verbose', 'Verbose output', false)
  .option('--format <format>', 'Output format (text/json/table/concise)', 'concise');

program
  .command('create-release')
  .description('Create a new Release')
  .requiredOption('-t, --tag <tag>', 'Release tag name')
  .option('-n, --name <name>', 'Release name')
  .option('-b, --body <body>', 'Release description/body')
  .option('--target <target>', 'Target commitish')
  .option('--draft', 'Mark as draft', false)
  .option('--prerelease', 'Mark as prerelease', false)
  .option('--format <format>', 'Output format (text/json/table/concise)', 'concise')
  .action(async (options) => {
    try {
      const { CreateReleaseCommand } = require('./commands');
      const mergedOptions = { ...program.opts(), ...options };
      const command = new CreateReleaseCommand(mergedOptions);
      await command.execute(options);
    } catch (error) {
      console.error(chalk.red('✗ Creation failed:'), error.message);
      if (program.opts().verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

program
  .command('list-releases')
  .description('List all Releases')
  .option('--page <page>', 'Page number', '1')
  .option('--per-page <perPage>', 'Results per page', '30')
  .option('--format <format>', 'Output format (text/json/table/concise)', 'concise')
  .action(async (options) => {
    try {
      const { ListReleasesCommand } = require('./commands');
      const mergedOptions = { ...program.opts(), ...options };
      const command = new ListReleasesCommand(mergedOptions);
      await command.execute(options);
    } catch (error) {
      console.error(chalk.red('✗ List failed:'), error.message);
      if (program.opts().verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

program
  .command('get-release [id]')
  .description('Get a single Release')
  .option('--id <id>', 'Release ID (alternative to positional argument)')
  .option('--tag <tag>', 'Release tag name')
  .option('--format <format>', 'Output format (text/json/table/concise)', 'concise')
  .action(async (id, options) => {
    try {
      const { GetReleaseCommand } = require('./commands');
      const mergedOptions = { ...program.opts(), ...options };
      const command = new GetReleaseCommand(mergedOptions);
      
      const releaseId = options.id || id;
      if (!releaseId && !options.tag) {
        console.error(chalk.red('✗ Error:'), 'Release ID or tag name is required. Use --id <id>, --tag <tag>, or provide as positional argument.');
        process.exit(1);
      }
      
      await command.execute(releaseId, options);
    } catch (error) {
      console.error(chalk.red('✗ Fetch failed:'), error.message);
      if (program.opts().verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

program
  .command('latest-release')
  .description('Get the latest Release')
  .option('--format <format>', 'Output format (text/json/table/concise)', 'concise')
  .action(async (options) => {
    try {
      const { LatestReleaseCommand } = require('./commands');
      const mergedOptions = { ...program.opts(), ...options };
      const command = new LatestReleaseCommand(mergedOptions);
      await command.execute(options);
    } catch (error) {
      console.error(chalk.red('✗ Fetch failed:'), error.message);
      if (program.opts().verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

program
  .command('update-release [id]')
  .description('Update an existing Release')
  .option('--id <id>', 'Release ID (alternative to positional argument)')
  .option('-n, --name <name>', 'New release name')
  .option('-b, --body <body>', 'New release description/body')
  .option('-t, --tag <tag>', 'New tag name')
  .option('--target <target>', 'New target commitish')
  .option('--draft <draft>', 'Mark as draft (true/false)')
  .option('--prerelease <prerelease>', 'Mark as prerelease (true/false)')
  .option('--format <format>', 'Output format (text/json/table/concise)', 'concise')
  .action(async (id, options) => {
    try {
      const { UpdateReleaseCommand } = require('./commands');
      const mergedOptions = { ...program.opts(), ...options };
      const command = new UpdateReleaseCommand(mergedOptions);
      
      const releaseId = options.id || id;
      if (!releaseId) {
        console.error(chalk.red('✗ Error:'), 'Release ID is required. Use --id <id> or provide as positional argument.');
        process.exit(1);
      }
      
      await command.execute(releaseId, options);
    } catch (error) {
      console.error(chalk.red('✗ Update failed:'), error.message);
      if (program.opts().verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

program
  .command('delete-release [tag]')
  .description('Delete a Release/Tag (AtomGit Release is bound to Tag)')
  .option('--tag <tag>', 'Release tag (alternative to positional argument)')
  .action(async (tag, options) => {
    try {
      const { DeleteReleaseCommand } = require('./commands');
      const mergedOptions = { ...program.opts(), ...options };
      const command = new DeleteReleaseCommand(mergedOptions);
      
      const releaseTag = options.tag || tag;
      if (!releaseTag) {
        console.error(chalk.red('✗ Error:'), 'Tag is required. Use --tag <tag> or provide as positional argument.');
        process.exit(1);
      }
      
      await command.execute(null, releaseTag, options);
    } catch (error) {
      console.error(chalk.red('✗ Delete failed:'), error.message);
      if (program.opts().verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

program
  .command('upload-url [tag]')
  .description('Get upload URL for Release assets')
  .option('--tag <tag>', 'Release tag (alternative to positional argument)')
  .action(async (tag, options) => {
    try {
      const { UploadUrlCommand } = require('./commands');
      const mergedOptions = { ...program.opts(), ...options };
      const command = new UploadUrlCommand(mergedOptions);
      
      const releaseTag = options.tag || tag;
      if (!releaseTag) {
        console.error(chalk.red('✗ Error:'), 'Tag is required. Use --tag <tag> or provide as positional argument.');
        process.exit(1);
      }
      
      await command.execute(releaseTag, options);
    } catch (error) {
      console.error(chalk.red('✗ Failed to get upload URL:'), error.message);
      if (program.opts().verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

program
  .command('download-asset [releaseId] [fileName]')
  .description('Download a Release asset')
  .option('--id <releaseId>', 'Release ID (alternative to positional argument)')
  .option('--file <fileName>', 'File name (alternative to positional argument)')
  .action(async (releaseId, fileName, options) => {
    try {
      const { DownloadAssetCommand } = require('./commands');
      const mergedOptions = { ...program.opts(), ...options };
      const command = new DownloadAssetCommand(mergedOptions);
      
      const id = options.id || releaseId;
      const file = options.file || fileName;
      
      if (!id) {
        console.error(chalk.red('✗ Error:'), 'Release ID is required.');
        process.exit(1);
      }
      
      if (!file) {
        console.error(chalk.red('✗ Error:'), 'File name is required.');
        process.exit(1);
      }
      
      await command.execute(id, file, options);
    } catch (error) {
      console.error(chalk.red('✗ Download failed:'), error.message);
      if (program.opts().verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

program.on('--help', () => {
  console.log('');
  console.log(chalk.cyan('Examples:'));
  console.log('  $ release-api create-release --tag v1.0.0 --name "Version 1.0.0"');
  console.log('  $ release-api list-releases --format json');
  console.log('  $ release-api get-release --tag v1.0.0');
  console.log('  $ release-api latest-release');
  console.log('  $ release-api update-release 123 --name "New Name"');
  console.log('  $ release-api delete-release v1.0.0');
  console.log('  $ release-api delete-release --tag v1.0.0');
  console.log('  $ release-api upload-url v1.0.0');
  console.log('  $ release-api download-asset 123 asset.zip');
  console.log('');
  console.log(chalk.cyan('Configuration:'));
  console.log('  Config file location: .aet/config.json');
  console.log('  Required fields: token, owner, repo');
  console.log('  Optional fields: platformType');
});

module.exports = { program };