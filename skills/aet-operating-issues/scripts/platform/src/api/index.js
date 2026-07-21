/**
 * API模块入口 - Issue skill
 */

const { PlatformAPIClient: GitCodeAPIClient } = require('./client');
const { IssueAPI } = require('./endpoints');

/**
 * 创建API服务
 * @param {Object} config - 配置对象
 * @returns {Object} API服务对象
 */
function createApiService(config) {
  const client = new GitCodeAPIClient(config);

  return {
    client,
    issues: new IssueAPI(client),

    // 快捷方法
    async checkConnection() {
      return client.checkConnection();
    },

    async getRateLimit() {
      return client.getRateLimit();
    }
  };
}

module.exports = {
  GitCodeAPIClient,
  IssueAPI,
  createApiService
};