/**
 * 更新Pull Request命令
 */

const BaseCommand = require('./base');

/**
 * 更新Pull Request命令
 */
class UpdatePrCommand extends BaseCommand {
  /**
   * 执行命令
   * @param {string} prNumber - PR编号
   * @param {Object} options - 命令选项
   * @returns {Promise<void>}
   */
  async execute(prNumber, options) {
    await this.init();

    try {
      const number = parseInt(prNumber, 10);
      if (isNaN(number)) {
        throw new Error('PR number must be a number');
      }

      // Prepare update data
      const updateData = {};
      if (options.title) updateData.title = options.title;
      
      // Add co-authored-by AET attribution to PR description if updating
      if (options.description) {
        const coAuthoredBy = 'co-authored-by AET(Agentic-Engineering-Team)';
        // Check if description already contains co-authored-by to avoid duplication
        if (options.description.toLowerCase().includes('co-authored-by')) {
          updateData.body = options.description;
        } else {
          updateData.body = `${options.description}\n\n${coAuthoredBy}`;
        }
      }
      
      if (options.state) updateData.state = options.state;
      if (options.labels) updateData.labels = this.parseCommaSeparated(options.labels);
      if (options.targetBranch) updateData.base = options.targetBranch;
      
      // 自动从配置获取fork.owner作为指派用户
      const forkOwner = this.configManager.get('forkOwner');
      if (forkOwner) {
        updateData.assignees = [forkOwner];
        if (!this.options.quiet) {
          this.info(`Using default assignee from config: ${forkOwner}`);
        }
      }

      if (Object.keys(updateData).length === 0) {
        this.warn('No update data provided, PR remains unchanged');
        const pr = await this.api.pullRequests.get(number);
        console.log(this.formatOutput(pr));
        return pr;
      }

      // 在quiet模式下不显示进度信息
      if (!this.options.quiet) {
        this.info(`Updating PR #${number}...`, updateData);
      }

      // Call API to update PR
      const pr = await this.api.pullRequests.update(number, updateData);

      // 在quiet模式下，success方法只输出数据，不输出消息
      this.success(`PR #${number} updated successfully`, pr);

      // 如果不是quiet模式且verbose模式，输出详细信息
      if (!this.options.quiet && this.options.verbose) {
        console.log(this.formatOutput(pr));
      }

      return pr;
    } catch (error) {
      this.error(`Failed to update PR #${prNumber}`, error);
      throw error;
    }
  }
}

module.exports = UpdatePrCommand;