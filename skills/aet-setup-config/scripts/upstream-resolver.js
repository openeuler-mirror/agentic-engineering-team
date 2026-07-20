#!/usr/bin/env node

/**
 * Upstream Repository Resolver
 *
 * Queries GitHub / GitCode / GitLab API to:
 *   1. Detect whether the current repo is a fork
 *   2. Resolve the upstream (parent) repository owner/repo
 *   3. List branches of the upstream repository
 *
 * Token is read from global config (~/.aet/config.json) based on platform type.
 * For GitLab, the API base URL is also read from global config
 * (codePlatform.platforms.gitlab.apiBaseUrl) so self-hosted instances work.
 *
 * Usage:
 *   node upstream-resolver.js --platform PLATFORM --owner OWNER --repo REPO
 *   node upstream-resolver.js --token TOKEN --platform PLATFORM --owner OWNER --repo REPO  (legacy)
 */

import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ==================== Global Config Reading ====================

function getGlobalConfigPath() {
  const homeDir = os.homedir();
  if (process.platform === 'win32') {
    return path.join(process.env.USERPROFILE || process.env.APPDATA || homeDir, '.aet', 'config.json');
  }
  return path.join(homeDir, '.aet', 'config.json');
}

function loadGlobalConfig() {
  const globalConfigPath = getGlobalConfigPath();
  if (!fs.existsSync(globalConfigPath)) {
    return null;
  }
  try {
    const content = fs.readFileSync(globalConfigPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error loading global config: ${error.message}`);
    return null;
  }
}

function resolveEnvVar(value) {
  if (typeof value !== 'string') {
    return value;
  }
  const envVarPattern = /\$\{([^}]+)\}/g;
  let resolvedValue = value;
  let match;
  while ((match = envVarPattern.exec(value)) !== null) {
    const envVarName = match[1];
    const envVarValue = process.env[envVarName];
    if (envVarValue !== undefined) {
      resolvedValue = resolvedValue.replace(match[0], envVarValue);
    }
    // 环境变量未设置时，保留原值（不输出警告）
  }
  return resolvedValue;
}

function getPlatformToken(platform) {
  const globalConfig = loadGlobalConfig();
  if (!globalConfig || !globalConfig.codePlatform?.platforms) {
    return null;
  }
  const platformConfig = globalConfig.codePlatform.platforms[platform];
  if (!platformConfig || !platformConfig.token) {
    return null;
  }
  return resolveEnvVar(platformConfig.token);
}

function getPlatformApiBaseUrl(platform) {
  const globalConfig = loadGlobalConfig();
  if (!globalConfig || !globalConfig.codePlatform?.platforms) {
    return null;
  }
  const platformConfig = globalConfig.codePlatform.platforms[platform];
  if (!platformConfig || !platformConfig.apiBaseUrl) {
    return null;
  }
  return resolveEnvVar(platformConfig.apiBaseUrl);
}

// ==================== Argument Parsing ====================

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {
    token: null,
    platform: 'gitlab',
    owner: null,
    repo: null
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--token' && i + 1 < args.length) {
      params.token = args[++i];
    } else if (arg === '--platform' && i + 1 < args.length) {
      params.platform = args[++i];
    } else if (arg === '--owner' && i + 1 < args.length) {
      params.owner = args[++i];
    } else if (arg === '--repo' && i + 1 < args.length) {
      params.repo = args[++i];
    } else if (arg === '--help') {
      printHelp();
      process.exit(0);
    }
  }

  if (!params.owner || !params.repo) {
    console.error('Error: Missing required parameters (--owner, --repo)');
    printHelp();
    process.exit(1);
  }

  // If token not provided via argument, read from global config
  if (!params.token) {
    params.token = getPlatformToken(params.platform);
    if (!params.token) {
      console.error(`Error: Token not found for platform '${params.platform}' in global config (~/.aet/config.json)`);
      console.error(`Please configure token in global config or pass via --token argument`);
      process.exit(1);
    }
  }

  return params;
}

function printHelp() {
  console.log(`
Upstream Repository Resolver

Token is automatically read from global config (~/.aet/config.json) based on platform type.

Usage:
  node upstream-resolver.js [options]

Required Options:
  --owner OWNER        Fork repository owner
  --repo REPO          Fork repository name

Optional Options:
  --platform PLATFORM  Platform type: gitcode, github, gitlab (default: gitlab)
                       Token is read from global config platforms[PLATFORM].token
                       For gitlab, the API base URL is read from
                       platforms.gitlab.apiBaseUrl (default: https://gitlab.com/api/v4)
  --token TOKEN        Personal access token (optional, overrides global config)
  --help               Show this help message

Output (JSON):
  {
    "is_fork": true,
    "fork_owner": "myuser",
    "fork_repo": "myrepo",
    "upstream_owner": "upstream-org",
    "upstream_repo": "myrepo",
    "default_branch": "main",
    "upstream_default_branch": "main",
    "branches": ["main", "develop", "release-v1"]
  }

Example:
  # Token read from global config (~/.aet/config.json platforms.gitcode.token)
  node upstream-resolver.js --platform gitcode --owner myuser --repo myrepo

  # Override token via argument
  node upstream-resolver.js --token gcode_xxx --platform gitcode --owner myuser --repo myrepo
`);
}

// ==================== HTTP Helpers ====================

function httpRequest(url, headers) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const transport = parsedUrl.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'AET-Upstream-Resolver',
        'Accept': 'application/json',
        ...headers
      },
      rejectUnauthorized: false
    };

    const req = transport.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, body, headers: res.headers });
      });
    });

    req.on('error', (err) => reject(err));
    req.setTimeout(15000, () => {
      req.destroy(new Error('Request timeout'));
    });
    req.end();
  });
}

// ==================== Platform Adapters ====================

function getApiConfig(platform, token) {
  if (platform === 'github') {
    return {
      baseUrl: 'https://api.github.com',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    };
  }
  if (platform === 'gitlab') {
    // Self-hosted GitLab uses a custom host; read it from global config.
    // Falls back to public gitlab.com. Expected format: {host}/api/v4
    const baseUrl = getPlatformApiBaseUrl('gitlab') || 'https://gitlab.com/api/v4';
    return {
      baseUrl,
      headers: {
        'PRIVATE-TOKEN': token,
        'Accept': 'application/json'
      }
    };
  }
  // gitcode (default)
  return {
    baseUrl: 'https://api.gitcode.com/api/v5',
    headers: {
      'PRIVATE-TOKEN': token,
      'Accept': 'application/json'
    }
  };
}

// ==================== Repo Info ====================

async function getRepoInfo(platform, token, owner, repo) {
  const config = getApiConfig(platform, token);
  const url = platform === 'gitlab'
    ? `${config.baseUrl}/projects/${encodeURIComponent(`${owner}/${repo}`)}`
    : `${config.baseUrl}/repos/${owner}/${repo}`;

  const res = await httpRequest(url, config.headers);

  if (res.status === 401) {
    throw new Error('Token 无效（401），请检查 Token 是否正确');
  }
  if (res.status === 403) {
    throw new Error('Token 权限不足（403）');
  }
  if (res.status === 404) {
    const bodyLower = (res.body || '').toLowerCase();
    if (bodyLower.includes('token')) {
      throw new Error('Token 无效（404, token not found），请确保使用正确平台的 Token');
    }
    throw new Error(`仓库不存在或无权访问: ${owner}/${repo}`);
  }
  if (res.status !== 200) {
    throw new Error(`API 错误（${res.status}）: ${(res.body || '').substring(0, 200)}`);
  }

  const data = JSON.parse(res.body);

  if (platform === 'github') {
    return parseGitHubRepoInfo(data, owner, repo);
  }
  if (platform === 'gitlab') {
    return parseGitLabRepoInfo(data, owner, repo);
  }
  return parseGitCodeRepoInfo(data, owner, repo);
}

function parseGitHubRepoInfo(data, owner, repo) {
  const isFork = data.fork === true;
  const parentData = data.parent;

  const result = {
    is_fork: isFork,
    fork_owner: owner,
    fork_repo: repo,
    upstream_owner: owner,
    upstream_repo: repo,
    default_branch: data.default_branch || 'main',
    upstream_default_branch: data.default_branch || 'main'
  };

  if (isFork && parentData) {
    const fullName = parentData.full_name || '';
    const parts = fullName.split('/');
    if (parts.length === 2) {
      result.upstream_owner = parts[0];
      result.upstream_repo = parts[1];
    }
    result.upstream_default_branch = parentData.default_branch || 'main';
  }

  return result;
}

function parseGitCodeRepoInfo(data, owner, repo) {
  const forkedFrom = data.forked_from_project || data.parent;
  const isFork = forkedFrom != null;

  const result = {
    is_fork: isFork,
    fork_owner: owner,
    fork_repo: repo,
    upstream_owner: owner,
    upstream_repo: repo,
    default_branch: data.default_branch || 'main',
    upstream_default_branch: data.default_branch || 'main'
  };

  if (isFork && typeof forkedFrom === 'object') {
    const parentFull = forkedFrom.path_with_namespace || forkedFrom.full_name || '';
    const parts = parentFull.split('/');
    if (parts.length === 2) {
      result.upstream_owner = parts[0];
      result.upstream_repo = parts[1];
    }
    result.upstream_default_branch = forkedFrom.default_branch || 'main';
  }

  return result;
}

function parseGitLabRepoInfo(data, owner, repo) {
  // GitLab project GET returns `forked_from_project` when the project is a fork.
  const forkedFrom = data.forked_from_project;
  const isFork = forkedFrom != null;

  const result = {
    is_fork: isFork,
    fork_owner: owner,
    fork_repo: repo,
    upstream_owner: owner,
    upstream_repo: repo,
    default_branch: data.default_branch || 'main',
    upstream_default_branch: data.default_branch || 'main'
  };

  if (isFork && typeof forkedFrom === 'object') {
    // path_with_namespace may contain subgroups, e.g. "group/subgroup/project".
    // Treat the last segment as repo and the rest (preserving slashes) as owner.
    const parentFull = forkedFrom.path_with_namespace || '';
    const idx = parentFull.lastIndexOf('/');
    if (idx > 0) {
      result.upstream_owner = parentFull.substring(0, idx);
      result.upstream_repo = parentFull.substring(idx + 1);
    }
    result.upstream_default_branch = forkedFrom.default_branch || 'main';
  }

  return result;
}

// ==================== Branch Listing ====================

async function listBranches(platform, token, owner, repo) {
  const config = getApiConfig(platform, token);
  const branches = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const url = platform === 'gitlab'
      ? `${config.baseUrl}/projects/${encodeURIComponent(`${owner}/${repo}`)}/repository/branches?per_page=${perPage}&page=${page}`
      : `${config.baseUrl}/repos/${owner}/${repo}/branches?per_page=${perPage}&page=${page}`;
    const res = await httpRequest(url, config.headers);

    if (res.status !== 200) {
      if (branches.length === 0) {
        throw new Error(`获取分支列表失败（${res.status}）: ${(res.body || '').substring(0, 200)}`);
      }
      break;
    }

    const data = JSON.parse(res.body);
    if (!Array.isArray(data) || data.length === 0) {
      break;
    }

    for (const branch of data) {
      branches.push(branch.name);
    }

    if (data.length < perPage) {
      break;
    }
    page++;
  }

  return branches;
}

// ==================== Main ====================

async function main() {
  try {
    const params = parseArgs();

    // Step 1: Get repo info (fork detection + upstream resolution)
    const repoInfo = await getRepoInfo(params.platform, params.token, params.owner, params.repo);

    // Step 2: List branches of the upstream repository
    const upstreamOwner = repoInfo.upstream_owner;
    const upstreamRepo = repoInfo.upstream_repo;
    let branches;
    try {
      branches = await listBranches(params.platform, params.token, upstreamOwner, upstreamRepo);
    } catch (branchErr) {
      // If listing upstream branches fails (e.g. no permission), try fork branches
      branches = [];
      try {
        branches = await listBranches(params.platform, params.token, params.owner, params.repo);
      } catch (_) {
        // ignore
      }
    }

    const output = {
      ...repoInfo,
      branches
    };

    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    const errorOutput = {
      error: true,
      message: error.message
    };
    console.log(JSON.stringify(errorOutput, null, 2));
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { getRepoInfo, listBranches, getApiConfig };
