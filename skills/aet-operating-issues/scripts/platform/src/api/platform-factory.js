/**
 * Platform Factory - Creates API clients for different platforms
 */

const logger = require('../utils/logger');
const constants = require('../constants');

/**
 * Platform types supported
 */
const PLATFORM_TYPES = {
  GITHUB: 'github',
  GITCODE: 'gitcode', 
  GITLAB: 'gitlab'
};

/**
 * Platform configuration mapping
 */
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

/**
 * Detect platform from repository URL
 * @param {string} url - Repository URL
 * @returns {string} Platform type
 */
function detectPlatformFromUrl(url) {
  if (!url) return PLATFORM_TYPES.GITCODE; // Default
  
  const urlLower = url.toLowerCase();
  
  if (urlLower.includes('github.com')) {
    return PLATFORM_TYPES.GITHUB;
  } else if (urlLower.includes('gitcode.com') || urlLower.includes('atomgit.com')) {
    return PLATFORM_TYPES.GITCODE;
  } else if (urlLower.includes('gitlab.com')) {
    return PLATFORM_TYPES.GITLAB;
  }
  
  return PLATFORM_TYPES.GITCODE; // Default
}

/**
 * Get platform configuration
 * @param {string} platformType - Platform type
 * @param {Object} userConfig - User configuration
 * @returns {Object} Platform configuration
 */
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

/**
 * Create API client for specific platform
 * @param {string} platformType - Platform type
 * @param {Object} config - Configuration
 * @returns {Object} API client instance
 */
function createPlatformClient(platformType, config = {}) {
  const platformConfig = getPlatformConfig(platformType, config);
  
  logger.info(`Creating ${platformConfig.name} API client`, {
    baseURL: platformConfig.apiBaseUrl,
    hasToken: !!platformConfig.token
  });
  
  // For now, we'll use the existing GitCode client as base
  // In a full implementation, we would create platform-specific clients
  const { GitCodeAPIClient } = require('./client');
  
  // Adapt configuration for the client
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

/**
 * Validate platform configuration
 * @param {Object} config - Platform configuration
 * @returns {Object} Validation result
 */
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