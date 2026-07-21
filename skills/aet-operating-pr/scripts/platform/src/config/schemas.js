/**
 * 配置模式定义
 */

/**
 * GitCode API配置模式
 */
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
    token: /^[a-zA-Z0-9_\-.]+$/,
    owner: /^[a-zA-Z0-9_\-]+$/,
    repository: /^[a-zA-Z0-9_\-\.]+$/,
    forkOwner: /^[a-zA-Z0-9_\-]+$/,
    forkRepo: /^[a-zA-Z0-9_\-\.]+$/
  },
  enums: {
    mode: ['issue', 'pr'],
    platformType: ['gitcode', 'github', 'gitlab']
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
    mode: 'issue',
    platformType: 'gitcode',
    targetBranch: 'main'
  }
};

/**
 * 项目配置模式（对应.aet/config.json）
 */
const PROJECT_CONFIG_SCHEMA = {
  required: ['token', 'owner', 'repository'],
  types: {
    token: 'string',
    owner: 'string',
    repository: 'string',
    mode: 'string',
    platformType: 'string',
    targetBranch: 'string'
  },
  formats: {
    token: /^[a-zA-Z0-9_\-.]+$/,
    owner: /^[a-zA-Z0-9_\-]+$/,
    repository: /^[a-zA-Z0-9_\-\.]+$/
  },
  enums: {
    mode: ['issue', 'pr'],
    platformType: ['gitcode', 'github', 'gitlab']
  },
  defaults: {
    mode: 'issue',
    platformType: 'gitcode',
    targetBranch: 'main'
  }
};

/**
 * CLI配置模式
 */
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

/**
 * Issue创建配置模式
 */
const ISSUE_CREATE_SCHEMA = {
  required: ['title'],
  types: {
    repo: 'string',
    title: 'string',
    body: 'string',
    assignee: 'string',
    milestone: 'number',
    labels: 'string',
    security_hole: 'string',
    template_path: 'string',
    issue_type: 'string',
    issue_severity: 'string',
    custom_fields: 'array'
  }
};

/**
 * PR创建配置模式
 */
const PR_CREATE_SCHEMA = {
  required: ['title', 'head', 'base'],
  types: {
    title: 'string',
    body: 'string',
    head: 'string',
    base: 'string',
    labels: 'array',
    assignees: 'string', // GitCode API expects comma-separated string
    milestone: 'string',
    draft: 'boolean'
  },
  defaults: {
    labels: [],
    assignees: '', // Empty string instead of empty array
    draft: false
  }
};

module.exports = {
  GITCODE_API_SCHEMA,
  PROJECT_CONFIG_SCHEMA,
  CLI_CONFIG_SCHEMA,
  ISSUE_CREATE_SCHEMA,
  PR_CREATE_SCHEMA
};
