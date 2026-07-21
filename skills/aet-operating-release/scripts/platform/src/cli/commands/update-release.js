/**
 * Update Release Command
 */

const BaseCommand = require('./base');

class UpdateReleaseCommand extends BaseCommand {
  async execute(releaseId, options) {
    await this.init();

    try {
      const id = parseInt(releaseId, 10);
      if (isNaN(id)) {
        throw new Error('Release ID must be a number');
      }

      const updateData = {};
      
      if (options.name) {
        updateData.name = options.name;
      }
      
      if (options.body) {
        updateData.body = options.body;
      }

      if (options.tag) {
        updateData.tag_name = options.tag;
      }

      if (options.target) {
        updateData.target_commitish = options.target;
      }

      if (options.draft !== undefined) {
        updateData.draft = options.draft === 'true' || options.draft === true;
      }

      if (options.prerelease !== undefined) {
        updateData.prerelease = options.prerelease === 'true' || options.prerelease === true;
      }

      if (Object.keys(updateData).length === 0) {
        this.warn('No update data provided, Release remains unchanged');
        const release = await this.api.releases.get(id);
        console.log(this.formatOutput(release));
        return release;
      }

      if (!this.options.quiet) {
        this.info(`Updating Release #${id}...`, updateData);
      }

      const release = await this.api.releases.update(id, updateData);

      this.success(`Release #${id} updated successfully`, release);

      if (!this.options.quiet && this.options.verbose) {
        console.log(this.formatOutput(release));
      }

      return release;
    } catch (error) {
      this.error(`Failed to update Release`, error);
      throw error;
    }
  }
}

module.exports = UpdateReleaseCommand;