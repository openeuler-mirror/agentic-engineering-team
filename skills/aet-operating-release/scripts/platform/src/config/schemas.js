const GITCODE_API_SCHEMA = {
  required: ['token', 'owner', 'repository'],
  types: {
    token: 'string',
    owner: 'string',
    repository: 'string',
    forkOwner: 'string',
    forkRepo: 'string',
    apiBaseUrl: 'string',
    timeout: 'number',
    maxRetries: 'number',
    retryDelay: 'number',
    retryMultiplier: 'number',
    rateLimitWindow: 'number',
    rateLimitMaxRequests: 'number',
    mode: 'string',
    platformType: 'string',
    targetBranch: 'string'
  },
  formats: {
    apiBaseUrl: /^https?:\/\/.+/,
    token: /^[a-zA-Z0-9_\-]+$/,
    owner: /^[a-zA-Z0-9_\-]+$/,
    repository: /^[a-zA-Z0-9_\-\.]+$/,
    forkOwner: /^[a-zA-Z0-9_\-]+$/,
    forkRepo: /^[a-zA-Z0-9_\-\.]+$/
  },
  enums: {
    mode: ['release', 'issue', 'pr'],
    platformType: ['gitcode', 'github']
  },
  ranges: {
    timeout: { min: 1000, max: 60000 },
    maxRetries: { min: 0, max: 10 },
    retryDelay: { min: 100, max: 10000 },
    retryMultiplier: { min: 1, max: 5 },
    rateLimitWindow: { min: 1000, max: 3600000 },
    rateLimitMaxRequests: { min: 1, max: 1000 }
  },
  defaults: {
    apiBaseUrl: 'https://api.atomgit.com/api/v5',
    timeout: 30000,
    maxRetries: 3,
    retryDelay: 1000,
    retryMultiplier: 2,
    rateLimitWindow: 60000,
    rateLimitMaxRequests: 60,
    mode: 'release',
    platformType: 'gitcode',
    targetBranch: 'main'
  }
};

const CLI_CONFIG_SCHEMA = {
  types: {
    verbose: 'boolean',
    debug: 'boolean',
    silent: 'boolean',
    output: 'string',
    format: 'string'
  },
  enums: {
    format: ['json', 'text', 'table', 'concise']
  },
  defaults: {
    verbose: false,
    debug: false,
    silent: false,
    output: 'concise',
    format: 'concise'
  }
};

const RELEASE_CREATE_SCHEMA = {
  required: ['tag_name'],
  types: {
    tag_name: 'string',
    target_commitish: 'string',
    name: 'string',
    body: 'string',
    draft: 'boolean',
    prerelease: 'boolean'
  },
  defaults: {
    draft: false,
    prerelease: false
  }
};

const RELEASE_UPDATE_SCHEMA = {
  types: {
    tag_name: 'string',
    target_commitish: 'string',
    name: 'string',
    body: 'string',
    draft: 'boolean',
    prerelease: 'boolean'
  }
};

module.exports = {
  GITCODE_API_SCHEMA,
  CLI_CONFIG_SCHEMA,
  RELEASE_CREATE_SCHEMA,
  RELEASE_UPDATE_SCHEMA
};