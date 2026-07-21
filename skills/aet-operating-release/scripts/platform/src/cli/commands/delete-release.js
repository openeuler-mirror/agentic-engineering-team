const BaseCommand = require('./base');

class DeleteReleaseCommand extends BaseCommand {
  async execute(releaseId, tag, options) {
    await this.init();

    try {
      if (!tag) {
        if (releaseId) {
          if (!this.options.quiet) {
            this.warn('AtomGit uses Tag as Release identifier. Please provide --tag instead of --id');
          }
          tag = releaseId;
        } else {
          throw new Error('Tag is required. Use --tag <tag>');
        }
      }

      if (!this.options.quiet) {
        this.info(`Deleting Release/Tag: ${tag}...`);
        this.info('Note: AtomGit Release is bound to Tag. Deleting Tag will also delete Release.');
      }

      const result = await this.api.releases.deleteTag(tag);

      this.success(`Release/Tag ${tag} deleted successfully from remote`);
      
      if (!this.options.quiet) {
        this.info('To delete local tag, run:');
        console.log(`  git tag -d ${tag}`);
      }

      return result;
    } catch (error) {
      this.error(`Failed to delete Release/Tag`, error);
      throw error;
    }
  }
}

module.exports = DeleteReleaseCommand;