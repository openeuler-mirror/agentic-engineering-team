/**
 * Add a comment to a PR.
 *
 * AtomGit response quirk: `id` is a hex content reference, not a database ID.
 * The numeric `note_id` is what you need for delete/edit. This endpoint exposes
 * it as `numericId` (a stable alias). Downstream tools that want to self-clean
 * up comments (e.g. when re-running review) should use numericId.
 */

const fs = require('fs');
const BaseCommand = require('./base');

class AddCommentCommand extends BaseCommand {
  async execute(prNumber, options) {
    await this.init();

    try {
      // Comment body can come from --body string or --body-file <path> (preferred for long markdown)
      let body = options.body;
      if (!body && options.bodyFile) {
        body = fs.readFileSync(options.bodyFile, 'utf8');
      }
      if (!body || !body.trim()) {
        throw new Error('Comment body cannot be empty (use --body <text> or --body-file <path>)');
      }

      if (!this.options.quiet) {
        this.info(`Adding comment to PR #${prNumber} (${body.length} chars)...`);
      }

      const comment = await this.api.pullRequests.addComment(Number(prNumber), body);
      this.success(`Comment added; numericId=${comment.numericId}`, comment);

      return comment;
    } catch (error) {
      this.error(`Failed to add comment to PR #${prNumber}`, error);
      throw error;
    }
  }
}

module.exports = AddCommentCommand;
