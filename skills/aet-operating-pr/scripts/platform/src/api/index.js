/**
 * API模块入口 - PR skill
 */

const { PlatformAPIClient: GitCodeAPIClient } = require('./client');
const { PullRequestAPI } = require('./endpoints');

/**
 * 创建API服务
 * @param {Object} config - 配置对象
 * @returns {Object} API服务对象
 */
function createApiService(config) {
  const client = new GitCodeAPIClient(config);

  return {
    client,
    pullRequests: new PullRequestAPI(client),

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
  PullRequestAPI,
  createApiService
};