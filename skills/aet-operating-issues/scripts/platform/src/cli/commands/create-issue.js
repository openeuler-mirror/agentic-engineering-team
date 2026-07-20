/**
 * 创建Issue命令
 */

const BaseCommand = require('./base');
const CodebaseSyncService = require('../../modules/codebase-sync');

/**
 * 创建Issue命令
 */
class CreateIssueCommand extends BaseCommand {
  /**
   * 执行命令
   * @param {Object} options - 命令选项
   * @returns {Promise<void>}
   */
  async execute(options) {
    await this.init();

    try {
      const syncService = new CodebaseSyncService(this.configManager.get());
      
      if (syncService.shouldSyncOnCreate()) {
        if (!this.options.quiet) {
          this.info('Syncing with upstream main branch...');
        }
        
        const syncResult = await syncService.syncUpstreamMain();
        
        if (!syncResult.success && !syncResult.skipped) {
          this.warn(`Codebase sync failed: ${syncResult.error}. Proceeding anyway.`);
        } else if (syncResult.success && !syncResult.skipped) {
          if (!this.options.quiet) {
            this.info('Codebase synced successfully.');
          }
        }
      }

      // Prepare Issue data
      const issueData = {
        title: options.title,
        body: options.description || 'No description', // AtomGit API requires body
      };

      // 注意：create-issue不再设置assignee
      // 如果需要指派用户，请使用claim-issue命令

      // 在quiet模式下不显示进度信息
      if (!this.options.quiet) {
        this.info('Creating Issue...', { title: issueData.title });
      }

      // Call API to create Issue
      const issue = await this.api.issues.create(issueData);

      // 在quiet模式下，success方法只输出数据，不输出消息
      this.success(`Issue created successfully: #${issue.number} - ${issue.title}`, issue);

      // 如果不是quiet模式且verbose模式，输出详细信息
      if (!this.options.quiet && this.options.verbose) {
        console.log(this.formatOutput(issue));
      }

      // Return Issue info for other scripts
      return issue;
    } catch (error) {
      this.error('Failed to create Issue', error);
      throw error;
    }
  }
}

module.exports = CreateIssueCommand;
