/**
 * Get the file list of a PR (including patch metadata).
 *
 * Per-file fields returned: filename, additions, deletions, sha,
 *   patch{ diff, new_file, renamed_file, deleted_file, too_large, added_lines, removed_lines },
 *   source_branch, target_branch, source_project, target_project
 */

const BaseCommand = require('./base');

class GetPrFilesCommand extends BaseCommand {
  async execute(prNumber, options = {}) {
    await this.init();

    try {
      if (!this.options.quiet) {
        this.info(`Fetching files for PR #${prNumber}...`);
      }

      const files = await this.api.pullRequests.getFiles(Number(prNumber));
      this.success(`PR #${prNumber}: ${files.length} file(s)`, files);

      if (!this.options.quiet && !this.options.format) {
        const output = this.formatOutput(files, { format: this.options.format || 'concise' });
        console.log(output);
      }

      return files;
    } catch (error) {
      this.error(`Failed to get files for PR #${prNumber}`, error);
      throw error;
    }
  }
}

module.exports = GetPrFilesCommand;
