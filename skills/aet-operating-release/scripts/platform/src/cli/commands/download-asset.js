const BaseCommand = require('./base');

class DownloadAssetCommand extends BaseCommand {
  async execute(releaseId, fileName, options) {
    await this.init();

    try {
      const id = parseInt(releaseId, 10);
      if (isNaN(id)) {
        throw new Error('Release ID must be a number');
      }

      if (!fileName) {
        throw new Error('File name is required');
      }

      if (!this.options.quiet) {
        this.info(`Downloading asset ${fileName} from Release #${id}...`);
      }

      const result = await this.api.releases.downloadAsset(id, fileName);

      this.success(`Asset ${fileName} downloaded successfully`, result);

      return result;
    } catch (error) {
      this.error(`Failed to download asset`, error);
      throw error;
    }
  }
}

module.exports = DownloadAssetCommand;