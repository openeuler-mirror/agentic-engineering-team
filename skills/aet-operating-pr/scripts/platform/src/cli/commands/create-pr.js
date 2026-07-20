/**
 * 创建Pull Request命令
 * 
 * 简化版：只处理API调用，PR描述由AI根据skill.md指导生成
 */

const BaseCommand = require('./base');

/**
 * 创建Pull Request命令
 */
class CreatePrCommand extends BaseCommand {
  /**
   * 执行命令
   * @param {Object} options - 命令选项
   * @returns {Promise<void>}
   */
  async execute(options) {
    await this.init();

    try {
      // PR描述应该由AI根据skill.md指导生成并作为参数传入
      const prDescription = options.description || '';
      
      // Add co-authored-by AET attribution to PR description
      const coAuthoredBy = 'co-authored-by AET(Agentic-Engineering-Team)';
      const finalPrDescription = prDescription ? `${prDescription}\n\n${coAuthoredBy}` : coAuthoredBy;
      
      // Validate source branch: should not contain username prefix (e.g., user:branch)
      if (options.sourceBranch && options.sourceBranch.includes(':')) {
        this.error('Invalid source branch format', new Error('Do not include username prefix. Use --source-branch feature/my-feature instead of --source-branch username:feature/my-feature. The script will auto-handle fork configuration.'));
        throw new Error('Invalid source branch format: please use branch name without username prefix');
      }

      // Process head parameter: if forkOwner is configured and different from owner, and head doesn't contain colon, prepend it
      let head = options.sourceBranch;
      const forkOwner = this.configManager.get('forkOwner');
      const owner = this.configManager.get('owner');

      if (forkOwner && forkOwner !== owner && head && !head.includes(':')) {
        const originalHead = head;
        head = `${forkOwner}:${head}`;
        this.info(`Fork configuration detected, auto-converting head parameter: "${originalHead}" → "${head}"`);
      }

      // Prepare PR data
      const prData = {
        title: options.title,
        body: finalPrDescription,
        head: head,
        base: options.targetBranch,
        labels: this.parseCommaSeparated(options.labels),
        draft: options.draft || false
      };

      // 在quiet模式下不显示进度信息
      if (!this.options.quiet) {
        this.info('Creating Pull Request...', {
          title: prData.title,
          head: prData.head,
          base: prData.base,
          body_length: prData.body ? prData.body.length : 0
        });
      }

      // Call API to create PR
      const pr = await this.api.pullRequests.create(prData);

      // Link issue to PR via API (if issue number is provided)
      if (options.issue) {
        try {
          await this.api.pullRequests.linkIssue(pr.number, parseInt(options.issue, 10));
        } catch (linkError) {
          console.warn('[WARN] Failed to link issue:', linkError.message);
        }
      }

      // 在quiet模式下不显示调试信息
      if (!this.options.quiet) {
        this.info('DEBUG: API response received', { 
          pr_response: JSON.stringify(pr, null, 2)
        });
        this.info('PR creation response:', { pr: JSON.stringify(pr) });
      }

      // 在quiet模式下，success方法只输出数据，不输出消息
      this.success(`Pull Request created successfully: #${pr.number || pr.id || 'N/A'} - ${pr.title || 'N/A'}`, pr);

      // 如果不是quiet模式且verbose模式，输出详细信息
      if (!this.options.quiet && this.options.verbose) {
        console.log(this.formatOutput(pr));
      }

      // Return PR info for other scripts
      return pr;
    } catch (error) {
      this.error('Failed to create Pull Request', error);
      throw error;
    }
  }
}

module.exports = CreatePrCommand;