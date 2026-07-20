/**
 * Get comments on a PR.
 *
 * Returned fields: id (numeric, usable with delete-comment), body, user, created_at
 */

const BaseCommand = require('./base');

class GetPrCommentsCommand extends BaseCommand {
  async execute(prNumber, options = {}) {
    await this.init();

    try {
      if (!this.options.quiet) {
        this.info(`Fetching comments for PR #${prNumber}...`);
      }

      const comments = await this.api.pullRequests.getComments(Number(prNumber));
      this.success(`PR #${prNumber}: ${comments.length} comment(s)`, comments);

      if (!this.options.quiet && !this.options.format) {
        const output = this.formatOutput(comments, { format: this.options.format || 'concise' });
        console.log(output);
      }

      return comments;
    } catch (error) {
      this.error(`Failed to get comments for PR #${prNumber}`, error);
      throw error;
    }
  }
}

module.exports = GetPrCommentsCommand;
