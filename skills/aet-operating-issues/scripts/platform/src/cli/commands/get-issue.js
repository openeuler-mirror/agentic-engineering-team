/**
 * 获取单个Issue命令
 */

const BaseCommand = require('./base');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');

/**
 * 获取单个Issue命令
 */
class GetIssueCommand extends BaseCommand {
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

      // 在quiet模式下不显示进度信息
      if (!this.options.quiet) {
        this.info(`Fetching Issue #${number}...`);
      }
      
      const issue = await this.api.issues.get(number);
      
      // 在quiet模式下，success方法只输出数据，不输出消息
      // 传递format选项给success方法
      this.success(`Fetch successful: #${issue.number} - ${issue.title}`, issue);

      // 如果有输出文件选项，保存为markdown
      if (options.outputFile) {
        await this.saveAsMarkdown(issue, options.outputFile);
      }

      // 始终展示issue内容（body），即使在quiet模式下
      if (issue.body) {
        console.log(chalk.bold('\n--- Issue Content ---'));
        console.log(issue.body);
      }

      return issue;
    } catch (error) {
      this.error(`Failed to fetch Issue #${issueNumber}`, error);
      // 在quiet模式下，不重新抛出错误，避免重复输出
      if (!this.options.quiet) {
        throw error;
      }
      process.exit(1);
    }
  }

  /**
   * 将Issue保存为Markdown文件
   * @param {Object} issue - Issue对象
   * @param {string} filePath - 文件路径
   * @returns {Promise<void>}
   */
  async saveAsMarkdown(issue, filePath) {
    try {
      const markdown = this.formatAsMarkdown(issue);

      // 确保目录存在
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 写入文件
      fs.writeFileSync(filePath, markdown, 'utf8');
      this.success(`Issue content saved to: ${filePath}`);
    } catch (error) {
      this.error(`Failed to save markdown file: ${filePath}`, error);
      throw error;
    }
  }

  /**
   * 将Issue格式化为Markdown
   * @param {Object} issue - Issue对象
   * @returns {string} Markdown内容
   */
  formatAsMarkdown(issue) {
    // 格式化标签
    const labels = issue.labels ? issue.labels.map(l => l.name).join(', ') : '';

    // 格式化assignee
    const assignee = issue.assignee ? issue.assignee.login : '';

    // 获取issue创建者
    const createdBy = issue.user ? issue.user.login : '';

    // 获取仓库信息
    const repoName = issue.repository ? issue.repository.full_name : '';

    // 构建markdown内容
    return `# ${issue.title}

**Issue Number**: #${issue.number}
**Status**: ${issue.state}
**Created**: ${issue.created_at}
**Updated**: ${issue.updated_at}
**Labels**: ${labels}
**Assignee**: ${assignee}

## Issue Description

${issue.body || ''}

## Metadata

- **Issue ID**: ${issue.id}
- **Repository**: ${repoName}
- **Created By**: ${createdBy}
- **Platform URL**: ${issue.html_url}
`;
  }
}

module.exports = GetIssueCommand;
