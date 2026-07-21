const { PlatformAPIClient: GitCodeAPIClient } = require('./client');
const { ReleaseAPI } = require('./endpoints');

function createApiService(config) {
  const client = new GitCodeAPIClient(config);

  return {
    client,
    releases: new ReleaseAPI(client),

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
  ReleaseAPI,
  createApiService
};