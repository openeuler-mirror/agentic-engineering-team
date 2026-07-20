/**
 * Command Line Interface Configuration - Multi-platform support
 */

const { Command } = require('commander');
const chalk = require('chalk');
const { version } = require('../../package.json');

// Create main program
const program = new Command();

// Basic configuration
program
  .name('issue-api')
  .description('Issue API CLI Tool - Manage GitHub/GitCode/GitLab issues')
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

// Create Issue command
program
  .command('create-issue')
  .description('Create a new Issue (does not automatically assign)')
  .requiredOption('-t, --title <title>', 'Issue title')
  .option('-d, --description <description>', 'Issue description (use heredoc for multi-line: --description "$(cat <<\'EOF\'\nmulti-line\ndescription\nEOF\n)")')
  .option('--format <format>', 'Output format (text/json/table/concise)', 'concise')
  .action(async (options) => {
    try {
      const { CreateIssueCommand } = require('./commands');
      // 合并全局选项和子命令选项
      const mergedOptions = { ...program.opts(), ...options };
      const command = new CreateIssueCommand(mergedOptions);
      await command.execute(options);
    } catch (error) {
      console.error(chalk.red('✗ Creation failed:'), error.message);
      if (program.opts().verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// Get single Issue command
program
  .command('get-issue [issueNumber]')
  .description('Get Issue details')
  .option('--id <issueNumber>', 'Issue number (alternative to positional argument)')
  .option('--format <format>', 'Output format (text/json/table/concise)', 'concise')
  .option('--output-file <path>', 'Save issue content to markdown file')
  .action(async (issueNumber, options) => {
    try {
      const { GetIssueCommand } = require('./commands');
      // 合并全局选项和子命令选项
      const mergedOptions = { ...program.opts(), ...options };
      const command = new GetIssueCommand(mergedOptions);
      
      // 支持--id选项和位置参数
      const finalIssueNumber = options.id || issueNumber;
      if (!finalIssueNumber) {
        console.error(chalk.red('✗ Error:'), 'Issue number is required. Use --id <number> or provide as positional argument.');
        process.exit(1);
      }
      
      await command.execute(finalIssueNumber, options);
    } catch (error) {
      console.error(chalk.red('✗ Fetch failed:'), error.message);
      if (program.opts().verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// Claim Issue command - specifically for assigning issues
program
  .command('claim-issue [issueNumber]')
  .description('Claim an Issue by assigning it to fork.owner from config')
  .option('--id <issueNumber>', 'Issue number (alternative to positional argument)')
  .option('--format <format>', 'Output format (text/json/table/concise)', 'concise')
  .action(async (issueNumber, options) => {
    try {
      const { ClaimIssueCommand } = require('./commands');
      // 合并全局选项和子命令选项
      const mergedOptions = { ...program.opts(), ...options };
      const command = new ClaimIssueCommand(mergedOptions);
      
      // 支持--id选项和位置参数
      const finalIssueNumber = options.id || issueNumber;
      if (!finalIssueNumber) {
        console.error(chalk.red('✗ Error:'), 'Issue number is required. Use --id <number> or provide as positional argument.');
        process.exit(1);
      }
      
      await command.execute(finalIssueNumber, options);
    } catch (error) {
      console.error(chalk.red('✗ Claim failed:'), error.message);
      if (program.opts().verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// Update Issue command
program
  .command('update-issue [issueNumber]')
  .description('Update an existing Issue (does not automatically assign)')
  .option('--id <issueNumber>', 'Issue number (alternative to positional argument)')
  .option('-t, --title <title>', 'New title')
  .option('-d, --description <description>', 'New description (use heredoc for multi-line: --description "$(cat <<\'EOF\'\nmulti-line\ndescription\nEOF\n)")')
  .option('-s, --state <state>', 'State (open/closed)')
  .option('-l, --labels <labels>', 'New label list, comma separated')
  .option('-a, --assignee <assignee>', 'Assignee username (optional, use empty string to clear assignee)')
  .option('--format <format>', 'Output format (text/json/table/concise)', 'concise')
  .action(async (issueNumber, options) => {
    try {
      const { UpdateIssueCommand } = require('./commands');
      // 合并全局选项和子命令选项
      const mergedOptions = { ...program.opts(), ...options };
      const command = new UpdateIssueCommand(mergedOptions);
      
      // 支持--id选项和位置参数
      const finalIssueNumber = options.id || issueNumber;
      if (!finalIssueNumber) {
        console.error(chalk.red('✗ Error:'), 'Issue number is required. Use --id <number> or provide as positional argument.');
        process.exit(1);
      }
      
      await command.execute(finalIssueNumber, options);
    } catch (error) {
      console.error(chalk.red('✗ Update failed:'), error.message);
      if (program.opts().verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// List Issues command
program
  .command('list-issues')
  .description('List all Issues')
  .option('--state <state>', 'Filter by state (all/open/closed)', 'all')
  .option('--labels <labels>', 'Filter by labels, comma separated')
  .option('--assignee <assignee>', 'Filter by assignee')
  .option('--format <format>', 'Output format (text/json/table/concise)', 'concise')
  .action(async (options) => {
    try {
      const { ListIssuesCommand } = require('./commands');
      const command = new ListIssuesCommand({ ...program.opts(), ...options });
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
  console.log('  $ issue-api create-issue --title "New Feature" --description "Description"');
  console.log('  $ issue-api update-issue 123 --state closed');
  console.log('  $ issue-api update-issue --id 123 --state closed');
  console.log('  $ issue-api get-issue --id 456 --format json');
  console.log('  $ issue-api list-issues --state open --format json');
  console.log('');
  console.log(chalk.cyan('Configuration:'));
  console.log('  Config file location: .aet/config.json');
  console.log('  Required fields: token, owner, repo');
  console.log('  Optional fields: mode, platformType, targetBranch');
});

module.exports = { program };
