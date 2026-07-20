/**
 * Get Release Command
 */

const BaseCommand = require('./base');

class GetReleaseCommand extends BaseCommand {
  async execute(releaseId, options) {
    await this.init();

    try {
      let release;

      if (options.tag) {
        if (!this.options.quiet) {
          this.info(`Fetching Release by tag: ${options.tag}...`);
        }
        release = await this.api.releases.getByTag(options.tag);
      } else {
        const id = parseInt(releaseId, 10);
        if (isNaN(id)) {
          throw new Error('Release ID must be a number');
        }

        if (!this.options.quiet) {
          this.info(`Fetching Release #${id}...`);
        }
        release = await this.api.releases.get(id);
      }

      this.success(`Fetch successful: ${release.tag_name} - ${release.name || 'Untitled'}`, release);

      if (release.body) {
        const chalk = require('chalk');
        console.log(chalk.bold('\n--- Release Body ---'));
        console.log(release.body);
      }

      return release;
    } catch (error) {
      this.error(`Failed to fetch Release`, error);
      if (!this.options.quiet) {
        throw error;
      }
      process.exit(1);
    }
  }
}

module.exports = GetReleaseCommand;