/**
 * Latest Release Command
 */

const BaseCommand = require('./base');

class LatestReleaseCommand extends BaseCommand {
  async execute(options) {
    await this.init();

    try {
      if (!this.options.quiet) {
        this.info('Fetching latest Release...');
      }

      const release = await this.api.releases.getLatest();

      this.success(`Latest Release: ${release.tag_name} - ${release.name || 'Untitled'}`, release);

      if (release.body) {
        const chalk = require('chalk');
        console.log(chalk.bold('\n--- Release Body ---'));
        console.log(release.body);
      }

      return release;
    } catch (error) {
      this.error('Failed to fetch latest Release', error);
      if (!this.options.quiet) {
        throw error;
      }
      process.exit(1);
    }
  }
}

module.exports = LatestReleaseCommand;