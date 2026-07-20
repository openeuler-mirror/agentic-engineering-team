/**
 * Command Line Interface Configuration - PR API
 */

const { Command } = require('commander');
const chalk = require('chalk');
const { version } = require('../../package.json');

// Create main program
const program = new Command();

// Basic configuration
program
  .name('pr-api')
  .description('PR API CLI Tool - Manage GitHub/GitCode/GitLab pull requests')
  .version(version)
  .option('-c, --config <path>', 'Config file path', '.aet/config.json')
  .option('-p, --platform <platform>', 'Platform type (github/gitcode/gitlab) - auto-detected from config if not specified')
  .option('--token <token>', 'API token (overrides config)')
  .option('-o, --owner <owner>', 'Repository owner (overrides config)')
  .option('-r, --repo <repository>', 'Repository name (overrides config)')
  .option('-v, --verbose', 'Verbose output', false)
  .option('-d, --debug', 'Debug mode', false)
  .option('-s, --silent', 'Silent mode', false)
  .option('-q, --quiet', 'Quiet mode (minimal output)', true)
  .option('--no-quiet', 'Disable quiet mode (show all output)')
  .option('--no-color', 'Disable colored output', false)
  .option('--output <format>', 'Output format (text/json/table/concise)', 'concise')
  .option('--log-level <level>', 'Log level (error/warn/info/debug/verbose)', 'info')
  .option('--dry-run', 'Dry run mode (no API calls)', false);

// Create Pull Request command
program
  .command('create-pr')
  .description('Create a Pull Request with template system')
  .requiredOption('--source-branch <branch>', 'Source branch')
  .requiredOption('--target-branch <branch>', 'Target branch')
  .requiredOption('-t, --title <title>', 'PR title')
  .requiredOption('-d, --description <description>', 'PR description (use heredoc for multi-line: --description "$(cat <<\'EOF\'\nmulti-line\ndescription\nEOF\n)")')
  .option('--pr-type <type>', 'PR template type (feature/bugfix/documentation/refactor/generic). Auto-detected if not specified.')
  .option('-l, --labels <labels>', 'Label list, comma separated')
  .option('--format <format>', 'Output format (text/json/table/concise)', 'concise')
  .option('--draft', 'Create as draft PR')
  .option('--non-interactive', 'Skip interactive review and editing')
  .option('--issue <number>', 'Issue number to link to the PR')
  .action(async (options) => {
    try {
      const { CreatePrCommand } = require('./commands');
      const command = new CreatePrCommand({ ...program.opts(), ...options });
      await command.execute(options);
    } catch (error) {
      console.error(chalk.red('✗ Creation failed:'), error.message);
      if (program.opts().verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// Update Pull Request command
program
  .command('update-pr [prNumber]')
  .description('Update Pull Request info')
  .option('--id <prNumber>', 'PR number (alternative to positional argument)')
  .option('-t, --title <title>', 'New PR title')
  .option('-d, --description <description>', 'New PR description (use heredoc for multi-line: --description "$(cat <<\'EOF\'\nmulti-line\ndescription\nEOF\n)")')
  .option('-s, --state <state>', 'PR state (open/closed)')
  .option('-l, --labels <labels>', 'New label list, comma separated')
  .option('--target-branch <branch>', 'New target branch')
  .option('--format <format>', 'Output format (text/json/table/concise)', 'concise')
  .action(async (prNumber, options) => {
    try {
      const { UpdatePrCommand } = require('./commands');
      const command = new UpdatePrCommand({ ...program.opts(), ...options });

      // 支持--id选项和位置参数
      const finalPrNumber = options.id || prNumber;
      if (!finalPrNumber) {
        console.error(chalk.red('✗ Error:'), 'PR number is required. Use --id <number> or provide as positional argument.');
        process.exit(1);
      }

      await command.execute(finalPrNumber, options);
    } catch (error) {
      console.error(chalk.red('✗ Update failed:'), error.message);
      if (program.opts().verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// Get single Pull Request
program
  .command('get-pr <prNumber>')
  .description('Get details for a single Pull Request')
  .option('--format <format>', 'Output format (text/json/table/concise)', 'concise')
  .action(async (prNumber, options) => {
    try {
      const { GetPrCommand } = require('./commands');
      const command = new GetPrCommand({ ...program.opts(), ...options });
      await command.execute(prNumber, options);
    } catch (error) {
      console.error(chalk.red('✗ get-pr failed:'), error.message);
      if (program.opts().verbose) console.error(error.stack);
      process.exit(1);
    }
  });

// Get PR files (with patch metadata for risk-face detection)
program
  .command('get-pr-files <prNumber>')
  .description('Get changed files of a PR with patch metadata (diff/new_file/deleted_file/too_large/...)')
  .option('--format <format>', 'Output format (text/json/table/concise)', 'concise')
  .action(async (prNumber, options) => {
    try {
      const { GetPrFilesCommand } = require('./commands');
      const command = new GetPrFilesCommand({ ...program.opts(), ...options });
      await command.execute(prNumber, options);
    } catch (error) {
      console.error(chalk.red('✗ get-pr-files failed:'), error.message);
      if (program.opts().verbose) console.error(error.stack);
      process.exit(1);
    }
  });

// Get PR comments
program
  .command('get-pr-comments <prNumber>')
  .description('Get all comments on a PR (id is numeric, usable for delete-comment)')
  .option('--format <format>', 'Output format (text/json/table/concise)', 'concise')
  .action(async (prNumber, options) => {
    try {
      const { GetPrCommentsCommand } = require('./commands');
      const command = new GetPrCommentsCommand({ ...program.opts(), ...options });
      await command.execute(prNumber, options);
    } catch (error) {
      console.error(chalk.red('✗ get-pr-comments failed:'), error.message);
      if (program.opts().verbose) console.error(error.stack);
      process.exit(1);
    }
  });

// Add a comment to a PR
program
  .command('add-comment <prNumber>')
  .description('Add a comment to a PR (use --body string or --body-file <path> for long markdown)')
  .option('--body <text>', 'Comment body (inline)')
  .option('--body-file <path>', 'Read comment body from a file (preferred for long markdown)')
  .option('--format <format>', 'Output format (text/json/concise)', 'concise')
  .action(async (prNumber, options) => {
    try {
      const { AddCommentCommand } = require('./commands');
      const command = new AddCommentCommand({ ...program.opts(), ...options });
      await command.execute(prNumber, options);
    } catch (error) {
      console.error(chalk.red('✗ add-comment failed:'), error.message);
      if (program.opts().verbose) console.error(error.stack);
      process.exit(1);
    }
  });

// Delete a PR comment by numeric id
program
  .command('delete-comment <commentId>')
  .description('Delete a PR comment by its numeric id (from add-comment.numericId or get-pr-comments.id)')
  .option('--pr <prNumber>', 'PR/MR number (required for GitLab; ignored for GitHub/GitCode)')
  .option('--format <format>', 'Output format (text/json/concise)', 'concise')
  .action(async (commentId, options) => {
    try {
      const { DeleteCommentCommand } = require('./commands');
      const command = new DeleteCommentCommand({ ...program.opts(), ...options });
      await command.execute(commentId, options);
    } catch (error) {
      console.error(chalk.red('✗ delete-comment failed:'), error.message);
      if (program.opts().verbose) console.error(error.stack);
      process.exit(1);
    }
  });

// List Pull Requests command
program
  .command('list-prs')
  .description('List all Pull Requests')
  .option('--state <state>', 'Filter by state (all/open/closed)', 'open')
  .option('--head <head>', 'Filter by source branch')
  .option('--base <base>', 'Filter by target branch')
  .option('--sort <sort>', 'Sort field (created/updated/popularity)', 'created')
  .option('--direction <direction>', 'Sort direction (asc/desc)', 'desc')
  .option('--labels <labels>', 'Filter by labels, comma separated')
  .option('--assignee <assignee>', 'Filter by assignee')
  .option('--format <format>', 'Output format (text/json/table/concise)', 'concise')
  .action(async (options) => {
    try {
      const { ListPrsCommand } = require('./commands');
      const command = new ListPrsCommand({ ...program.opts(), ...options });
      await command.execute(options);
    } catch (error) {
      console.error(chalk.red('✗ List failed:'), error.message);
      if (program.opts().verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// Add help information
program.on('--help', () => {
  console.log('');
  console.log(chalk.cyan('Examples:'));
  console.log('  $ pr-api create-pr --source-branch feat/new --target-branch main --title "New Feature PR"');
  console.log('  $ pr-api update-pr 123 --title "Updated title"');
  console.log('  $ pr-api list-prs --state open --format json');
  console.log('  $ pr-api get-pr 226');
  console.log('  $ pr-api get-pr-files 226 --format json');
  console.log('  $ pr-api get-pr-comments 226');
  console.log('  $ pr-api add-comment 226 --body-file /tmp/review.md');
  console.log('  $ pr-api delete-comment 171406556');
  console.log('');
  console.log(chalk.cyan('Configuration:'));
  console.log('  Config file location: .aet/config.json');
  console.log('  Required fields: token, owner, repo');
  console.log('  Optional fields: mode, platformType, targetBranch');
});

module.exports = { program };