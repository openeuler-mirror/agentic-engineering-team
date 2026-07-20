/**
 * Delete a PR comment by numeric id.
 *
 * AtomGit endpoint: DELETE /repos/{owner}/{repo}/pulls/comments/{id}
 * (Note: the URL does NOT include the PR number — comment id is repo-global.)
 *
 * `commentId` must be numeric (i.e. add-comment.numericId or get-pr-comments.id).
 */

const BaseCommand = require('./base');

class DeleteCommentCommand extends BaseCommand {
  async execute(commentId, options = {}) {
    await this.init();

    try {
      const id = Number(commentId);
      if (!Number.isFinite(id)) {
        throw new Error(`commentId must be numeric, got: "${commentId}"`);
      }

      if (!this.options.quiet) {
        this.info(`Deleting comment #${id}...`);
      }

      // GitLab note delete requires the MR iid; AtomGit ignores the second arg.
      let prNumberArg;
      const pr = options.pr !== undefined ? options.pr : this.options.pr;
      if (pr !== undefined && pr !== null && pr !== '') {
        const n = Number(pr);
        if (!Number.isFinite(n)) {
          throw new Error(`--pr must be numeric, got: "${pr}"`);
        }
        prNumberArg = n;
      }

      await this.api.pullRequests.deleteComment(id, prNumberArg);
      this.success(`Comment #${id} deleted`, { id });

      if (!this.options.quiet && !this.options.format) {
        console.log(`✅ Comment #${id} deleted`);
      }

      return { id };
    } catch (error) {
      this.error(`Failed to delete comment #${commentId}`, error);
      throw error;
    }
  }
}

module.exports = DeleteCommentCommand;
