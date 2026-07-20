/**
 * 更新Issue命令
 */

const BaseCommand = require('./base');

/**
 * 更新Issue命令
 */
class UpdateIssueCommand extends BaseCommand {
  /**
   * 执行命令
   * @param {string} issueNumber - Issue编号
   * @param {Object} options - 命令选项
   * @returns {Promise<void>}
   */
  async execute(issueNumber, options) {
    await this.init();

    try {
      const number = parseInt(issueNumber, 10);
      if (isNaN(number)) {
        throw new Error('Issue number must be a number');
      }

      // Prepare update data
      const updateData = {};
      if (options.title) updateData.title = options.title;
      if (options.description) updateData.body = options.description;
      if (options.state) updateData.state = options.state;
      if (options.labels) updateData.labels = this.parseCommaSeparated(options.labels).join(',');
      
      // 处理可选的assignee参数
      if (options.assignee !== undefined) {
        // 允许空字符串来清除assignee
        updateData.assignee = options.assignee === '' ? null : options.assignee;
        if (!this.options.quiet) {
          if (updateData.assignee === null) {
            this.info('Clearing assignee');
          } else {
            this.info(`Setting assignee: ${options.assignee}`);
          }
        }
      }

      if (Object.keys(updateData).length === 0) {
        this.warn('No update data provided, Issue remains unchanged');
        const issue = await this.api.issues.get(number);
        console.log(this.formatOutput(issue));
        return issue;
      }

      // 在quiet模式下不显示进度信息
      if (!this.options.quiet) {
        this.info(`Updating Issue #${number}...`, updateData);
      }

      // Call API to update Issue
      const issue = await this.api.issues.update(number, updateData);

      // 在quiet模式下，success方法只输出数据，不输出消息
      this.success(`Issue #${number} updated successfully`, issue);

      // 如果不是quiet模式且verbose模式，输出详细信息
      if (!this.options.quiet && this.options.verbose) {
        console.log(this.formatOutput(issue));
      }

      return issue;
    } catch (error) {
      this.error(`Failed to update Issue #${issueNumber}`, error);
      throw error;
    }
  }
}

module.exports = UpdateIssueCommand;
