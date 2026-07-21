/**
 * 列出Issues命令
 */

const BaseCommand = require('./base');

/**
 * 列出Issues命令
 */
class ListIssuesCommand extends BaseCommand {
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
        state: options.state || 'all'
      };

      if (options.labels) {
        queryParams.labels = options.labels;
      }

      if (options.assignee) {
        queryParams.assignee = options.assignee;
      }

      // 在quiet模式下不显示进度信息
      if (!this.options.quiet) {
        this.info('Fetching Issue list...', queryParams);
      }

      // Call API to list Issues
      const issues = await this.api.issues.list(queryParams);

      if (issues.length === 0) {
        // 在quiet模式下，空列表也不输出信息
        if (!this.options.quiet) {
          this.info('No Issues found matching criteria');
        }
        return [];
      }

      // 在quiet模式下，success方法只输出数据，不输出消息
      this.success(`Found ${issues.length} Issues`, issues);

      // 如果不是quiet模式且success方法没有输出数据，则单独输出
      if (!this.options.quiet && !this.options.format) {
        const output = this.formatOutput(issues, {
          format: this.options.format || 'table'
        });
        console.log(output);
      }

      return issues;
    } catch (error) {
      this.error('Failed to list Issues', error);
      throw error;
    }
  }
}

module.exports = ListIssuesCommand;