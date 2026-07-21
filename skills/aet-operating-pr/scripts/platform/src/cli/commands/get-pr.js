/**
 * Get a single PR's details.
 */

const BaseCommand = require('./base');

class GetPrCommand extends BaseCommand {
  async execute(prNumber, options = {}) {
    await this.init();

    try {
      if (!this.options.quiet) {
        this.info(`Fetching PR #${prNumber}...`);
      }

      const pr = await this.api.pullRequests.get(Number(prNumber));
      this.success(`PR #${prNumber} fetched`, pr);

      if (!this.options.quiet && !this.options.format) {
        const output = this.formatOutput(pr, { format: this.options.format || 'concise' });
        console.log(output);
      }

      return pr;
    } catch (error) {
      this.error(`Failed to get PR #${prNumber}`, error);
      throw error;
    }
  }
}

module.exports = GetPrCommand;
