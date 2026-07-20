/**
 * List Releases Command
 */

const BaseCommand = require('./base');

class ListReleasesCommand extends BaseCommand {
  async execute(options) {
    await this.init();

    try {
      const queryParams = {};

      if (options.page) {
        queryParams.page = parseInt(options.page, 10);
      }

      if (options.perPage || options['per-page']) {
        queryParams.per_page = parseInt(options.perPage || options['per-page'], 10);
      }

      if (!this.options.quiet) {
        this.info('Fetching Release list...', queryParams);
      }

      const releases = await this.api.releases.list(queryParams);

      if (releases.length === 0) {
        if (!this.options.quiet) {
          this.info('No Releases found');
        }
        return [];
      }

      this.success(`Found ${releases.length} Releases`, releases);

      if (!this.options.quiet && !this.options.format) {
        const output = this.formatOutput(releases, {
          format: this.options.format || 'table'
        });
        console.log(output);
      }

      return releases;
    } catch (error) {
      this.error('Failed to list Releases', error);
      throw error;
    }
  }
}

module.exports = ListReleasesCommand;