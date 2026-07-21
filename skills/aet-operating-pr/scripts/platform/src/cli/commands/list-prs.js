/**
 * 列出Pull Requests命令
 */

const BaseCommand = require('./base');

/**
 * 列出Pull Requests命令
 */
class ListPrsCommand extends BaseCommand {
  /**
   * 执行命令
   * @param {Object} options - 命令选项
   * @returns {Promise<void>}
   */
  async execute(options) {
    await this.init();

    try {
      // Prepare query parameters
      const queryParams = {
        state: options.state || 'open'
      };

      if (options.head) {
        queryParams.head = options.head;
      }

      if (options.base) {
        queryParams.base = options.base;
      }

      if (options.sort) {
        queryParams.sort = options.sort;
      }

      if (options.direction) {
        queryParams.direction = options.direction;
      }

      if (options.labels) {
        queryParams.labels = options.labels;
      }

      if (options.assignee) {
        queryParams.assignee = options.assignee;
      }

      // 在quiet模式下不显示进度信息
      if (!this.options.quiet) {
        this.info('Fetching Pull Request list...', queryParams);
      }

      // Call API to list PRs
      const prs = await this.api.pullRequests.list(queryParams);

      if (prs.length === 0) {
        // 在quiet模式下，空列表也不输出信息
        if (!this.options.quiet) {
          this.info('No Pull Requests found matching criteria');
        }
        return [];
      }

      // 在quiet模式下，success方法只输出数据，不输出消息
      this.success(`Found ${prs.length} Pull Requests`, prs);

      // 如果不是quiet模式且success方法没有输出数据，则单独输出
      if (!this.options.quiet && !this.options.format) {
        const output = this.formatOutput(prs, {
          format: this.options.format || 'table'
        });
        console.log(output);
      }

      return prs;
    } catch (error) {
      this.error('Failed to list Pull Requests', error);
      throw error;
    }
  }
}

module.exports = ListPrsCommand;