const logger = require('../utils/logger');
const constants = require('../constants');

const PLATFORM_TYPES = {
  GITHUB: 'github',
  GITCODE: 'gitcode', 
  GITLAB: 'gitlab'
};

const PLATFORM_CONFIGS = {
  [PLATFORM_TYPES.GITHUB]: {
    name: 'GitHub',
    apiBaseUrl: 'https://api.github.com',
    apiVersion: 'v3',
    defaultHeaders: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Platform-API-CLI'
    }
  },
  [PLATFORM_TYPES.GITCODE]: {
    name: 'GitCode',
    apiBaseUrl: 'https://api.atomgit.com/api/v5',
    apiVersion: 'v5',
    defaultHeaders: {
      'Accept': 'application/json',
      'User-Agent': 'Platform-API-CLI'
    }
  },
  [PLATFORM_TYPES.GITLAB]: {
    name: 'GitLab',
    apiBaseUrl: 'https://gitlab.com/api/v4',
    apiVersion: 'v4',
    defaultHeaders: {
      'Accept': 'application/json',
      'User-Agent': 'Platform-API-CLI'
    }
  }
};

function detectPlatformFromUrl(url) {
  if (!url) return PLATFORM_TYPES.GITCODE;
  
  const urlLower = url.toLowerCase();
  
  if (urlLower.includes('github.com')) {
    return PLATFORM_TYPES.GITHUB;
  } else if (urlLower.includes('gitcode.com') || urlLower.includes('atomgit.com')) {
    return PLATFORM_TYPES.GITCODE;
  } else if (urlLower.includes('gitlab.com')) {
    return PLATFORM_TYPES.GITLAB;
  }
  
  return PLATFORM_TYPES.GITCODE;
}

function getPlatformConfig(platformType, userConfig = {}) {
  const platform = platformType || PLATFORM_TYPES.GITCODE;
  const baseConfig = PLATFORM_CONFIGS[platform];
  
  if (!baseConfig) {
    throw new Error(`Unsupported platform: ${platform}`);
  }
  
  return {
    ...baseConfig,
    token: userConfig.token,
    owner: userConfig.owner,
    repository: userConfig.repository,
    timeout: userConfig.timeout || constants.API.TIMEOUT,
    maxRetries: userConfig.maxRetries || constants.API.MAX_RETRIES,
    retryDelay: userConfig.retryDelay || constants.API.RETRY_DELAY
  };
}

function createPlatformClient(platformType, config = {}) {
  const platformConfig = getPlatformConfig(platformType, config);
  
  logger.info(`Creating ${platformConfig.name} API client`, {
    baseURL: platformConfig.apiBaseUrl,
    hasToken: !!platformConfig.token
  });
  
  const { GitCodeAPIClient } = require('./client');
  
  const clientConfig = {
    apiBaseUrl: platformConfig.apiBaseUrl,
    token: platformConfig.token,
    owner: platformConfig.owner,
    repository: platformConfig.repository,
    timeout: platformConfig.timeout,
    maxRetries: platformConfig.maxRetries,
    retryDelay: platformConfig.retryDelay,
    platform: platformType,
    platformConfig
  };
  
  return new GitCodeAPIClient(clientConfig);
}

function validatePlatformConfig(config) {
  const errors = [];
  
  if (!config.platform) {
    errors.push('Platform type is required');
  }
  
  if (!PLATFORM_CONFIGS[config.platform]) {
    errors.push(`Unsupported platform: ${config.platform}`);
  }
  
  if (!config.token) {
    errors.push('API token is required');
  }
  
  if (!config.owner || !config.repository) {
    errors.push('Repository owner and name are required');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

module.exports = {
  PLATFORM_TYPES,
  PLATFORM_CONFIGS,
  detectPlatformFromUrl,
  getPlatformConfig,
  createPlatformClient,
  validatePlatformConfig
};