/**
 * Create Release Command
 */

const BaseCommand = require('./base');

class CreateReleaseCommand extends BaseCommand {
  async execute(options) {
    await this.init();

    try {
      const releaseData = {
        tag_name: options.tag,
      };

      if (options.name) {
        releaseData.name = options.name;
      }

      if (options.body) {
        releaseData.body = options.body;
      }

      if (options.target) {
        releaseData.target_commitish = options.target;
      }

      if (options.draft !== undefined) {
        releaseData.draft = options.draft;
      }

      if (options.prerelease !== undefined) {
        releaseData.prerelease = options.prerelease;
      }

      if (!this.options.quiet) {
        this.info('Creating Release...', { tag: releaseData.tag_name });
      }

      const release = await this.api.releases.create(releaseData);

      this.success(`Release created successfully: ${release.tag_name} - ${release.name || 'Untitled'}`, release);

      if (!this.options.quiet && this.options.verbose) {
        console.log(this.formatOutput(release));
      }

      return release;
    } catch (error) {
      this.error('Failed to create Release', error);
      throw error;
    }
  }
}

module.exports = CreateReleaseCommand;