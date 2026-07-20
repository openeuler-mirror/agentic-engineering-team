const BaseCommand = require('./base');

class UploadUrlCommand extends BaseCommand {
  async execute(tag, options) {
    await this.init();

    try {
      if (!tag) {
        this.error('Tag is required');
        throw new Error('Tag is required');
      }

      if (!this.options.quiet) {
        this.info(`Getting upload URL for Release ${tag}...`);
      }

      const result = await this.api.releases.getUploadUrl(tag);

      this.success(`Upload URL retrieved for ${tag}`, result);

      return result;
    } catch (error) {
      this.error(`Failed to get upload URL`, error);
      throw error;
    }
  }
}

module.exports = UploadUrlCommand;