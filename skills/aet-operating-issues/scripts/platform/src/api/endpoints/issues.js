/**
 * Issue相关API端点
 */

const logger = require('../../utils/logger');
const { formatError } = require('../../utils/formatters');
const { ConfigValidator } = require('../../config');

/**
 * Check whether the current client is talking to a GitLab platform.
 * @param {Object} client
 * @returns {boolean}
 */
function isGitLab(client) {
  return client && client.config && client.config.platform === 'gitlab';
}

/**
 * Build the URL-encoded GitLab project path (owner%2Frepo).
 * @param {Object} client
 * @returns {string}
 */
function gitlabProjectPath(client) {
  const { owner, repo } = client.config;
  return encodeURIComponent(`${owner}/${repo}`);
}

/**
 * Normalize a GitLab issue payload into the GitHub/GitCode-style shape the
 * rest of the CLI expects (number, body, html_url, open/closed).
 * @param {Object} issue
 * @returns {Object}
 */
function normalizeGitLabIssue(issue) {
  if (!issue || typeof issue !== 'object') {
    return issue;
  }
  const normalized = { ...issue };
  if (issue.iid !== undefined && normalized.number === undefined) {
    normalized.number = parseInt(issue.iid, 10);
  }
  if (issue.description !== undefined && normalized.body === undefined) {
    normalized.body = issue.description;
  }
  if (issue.web_url && !normalized.html_url) {
    normalized.html_url = issue.web_url;
  }
  if (issue.state === 'opened') {
    normalized.state = 'open';
  }
  return normalized;
}

/**
 * Issue API端点
 */
class IssueAPI {
  /**
   * 创建Issue API端点
   * @param {GitCodeAPIClient} client - API客户端
   */
  constructor(client) {
    this.client = client;
  }

  /**
   * Resolve a GitLab username to its numeric user id.
   * GitLab assignment fields (assignee_id/assignee_ids) require numeric ids,
   * not usernames. Uses GET /users?username=<name>.
   * @param {string} username
   * @returns {Promise<number|null>} numeric id, or null if not found
   * @private
   */
  async _resolveGitLabUserId(username) {
    try {
      logger.debug(`解析 GitLab 用户 ID: ${username}`);
      const users = await this.client.get('/users', { username });
      if (Array.isArray(users) && users.length > 0 && users[0] && users[0].id != null) {
        logger.debug(`用户 "${username}" → id=${users[0].id}`);
        return users[0].id;
      }
      logger.warn(`GitLab 未返回用户 "${username}" 的匹配结果`);
      return null;
    } catch (error) {
      logger.warn(`GitLab 用户查询失败 "${username}": ${error.message}`);
      return null;
    }
  }

  /**
   * 获取Issue列表
   * @param {Object} [params] - 查询参数
   * @param {string} [params.state] - 状态 (open/closed/all)
   * @param {string} [params.labels] - 标签（逗号分隔）
   * @param {string} [params.sort] - 排序 (created/updated/comments)
   * @param {string} [params.direction] - 排序方向 (asc/desc)
   * @param {number} [params.page] - 页码
   * @param {number} [params.per_page] - 每页数量
   * @returns {Promise<Array>} Issue列表
   */
  async list(params = {}) {
    try {
      const gitlab = isGitLab(this.client);

      let endpoint;
      let queryParams;

      if (gitlab) {
        // GitLab: /projects/{encoded}/issues with state=opened, order_by/sort
        endpoint = `/projects/${gitlabProjectPath(this.client)}/issues`;

        const gitlabState = params.state === 'open'
          ? 'opened'
          : (params.state || 'opened');

        queryParams = {
          state: gitlabState === 'all' ? undefined : gitlabState,
          labels: params.labels,
          order_by: params.sort === 'created' ? 'created_at' : (params.sort || 'created_at'),
          sort: params.direction || 'desc',
          page: params.page || 1,
          per_page: params.per_page || 30
        };
      } else {
        endpoint = `/repos/${this.client.config.owner}/${this.client.config.repo}/issues`;
        queryParams = {
          state: params.state || 'open',
          labels: params.labels,
          sort: params.sort || 'created',
          direction: params.direction || 'desc',
          page: params.page || 1,
          per_page: params.per_page || 30
        };
      }

      // 移除undefined参数
      Object.keys(queryParams).forEach(key => {
        if (queryParams[key] === undefined || queryParams[key] === null) {
          delete queryParams[key];
        }
      });

      logger.debug(`获取Issue列表，参数: ${JSON.stringify(queryParams)}`);
      let response = await this.client.get(endpoint, queryParams);

      // Some GitLab variants may wrap issues in {opened, closed, all, issues}
      if (gitlab && response && !Array.isArray(response) && Array.isArray(response.issues)) {
        response = response.issues;
      }

      const issues = Array.isArray(response) ? response : [];
      logger.debug(`获取到 ${issues.length} 个Issue`);

      if (gitlab) {
        return issues.map(normalizeGitLabIssue);
      }
      return issues;
    } catch (error) {
      logger.error('获取Issue列表失败:', formatError(error));
      throw error;
    }
  }

  /**
   * 获取单个Issue
   * @param {number} issueNumber - Issue编号
   * @returns {Promise<Object>} Issue详情
   */
  async get(issueNumber) {
    try {
      if (!issueNumber || typeof issueNumber !== 'number') {
        throw new Error('Issue编号必须为数字');
      }

      const gitlab = isGitLab(this.client);
      const endpoint = gitlab
        ? `/projects/${gitlabProjectPath(this.client)}/issues/${issueNumber}`
        : `/repos/${this.client.config.owner}/${this.client.config.repo}/issues/${issueNumber}`;

      logger.debug(`获取Issue #${issueNumber}`);
      let response = await this.client.get(endpoint);
      logger.debug(`API响应: ${JSON.stringify(response)}`);

      // 检查API错误响应
      if (response && response.error_code) {
        logger.error(`API错误响应: ${JSON.stringify(response)}`);
        throw new Error(`API错误: ${response.error_message || '未知错误'} (code: ${response.error_code})`);
      }

      if (gitlab) {
        response = normalizeGitLabIssue(response);
      }

      // 处理不同的API响应格式
      let issue;
      if (response && typeof response === 'object') {
        // GitCode API返回的number可能是字符串，需要转换为数字
        const issueNumberResp = response.number || response.id || response.iid || response.issue_id;
        issue = {
          number: issueNumberResp ? parseInt(issueNumberResp, 10) : undefined,
          title: response.title || response.name || 'Untitled',
          ...response
        };
      } else {
        issue = response;
      }

      if (!issue.number || !issue.title) {
        logger.warn(`Issue响应缺少必要字段: number=${issue.number}, title=${issue.title}`);
      }

      return issue;
    } catch (error) {
      logger.error(`获取Issue #${issueNumber}失败:`, formatError(error));
      throw error;
    }
  }

  /**
   * 创建Issue
   * @param {Object} issueData - Issue数据
   * @param {string} [issueData.repo] - 仓库名（GitCode API必填，默认取配置repo）
   * @param {string} issueData.title - 标题
   * @param {string} issueData.body - 内容
   * @param {string} [issueData.labels] - 标签（逗号分隔）
   * @param {string} [issueData.assignee] - 指派人
   * @param {number} [issueData.milestone] - 里程碑ID
   * @param {string} [issueData.security_hole] - 安全漏洞标记
   * @param {string} [issueData.template_path] - 模板路径
   * @param {string} [issueData.issue_type] - Issue类型
   * @param {string} [issueData.issue_severity] - 严重程度
   * @param {Array<{field_name: string, field_values: string[]}>} [issueData.custom_fields] - 自定义字段
   * @returns {Promise<Object>} 创建的Issue
   */
  async create(issueData) {
    try {
      // 验证Issue数据
      const validatedData = ConfigValidator.validateIssueCreateConfig(issueData);

      const payload = { ...validatedData };

      if (!payload.repo) {
        payload.repo = this.client.config.repo;
      }

      if (Array.isArray(payload.assignees) && payload.assignees.length > 0 && !payload.assignee) {
        payload.assignee = payload.assignees[0];
      }
      delete payload.assignees;

      Object.keys(payload).forEach(key => {
        const value = payload[key];
        if (value === undefined || value === null || value === '') {
          delete payload[key];
          return;
        }
        if (Array.isArray(value) && value.length === 0) {
          delete payload[key];
        }
      });

      const gitlab = isGitLab(this.client);
      let endpoint;

      if (gitlab) {
        endpoint = `/projects/${gitlabProjectPath(this.client)}/issues`;
        // GitLab uses `description`, not `body`. Repo is in the path.
        if (payload.body) {
          payload.description = payload.body;
          delete payload.body;
        }
        delete payload.repo;
        // GitLab assigns by numeric user id, not username.
        if (payload.assignee) {
          const userId = await this._resolveGitLabUserId(payload.assignee);
          if (userId != null) {
            payload.assignee_ids = [userId];
          } else {
            logger.warn(`无法解析 GitLab 用户 "${payload.assignee}" 的 ID，将创建未指派的 Issue`);
          }
          delete payload.assignee;
        }
      } else {
        endpoint = `/repos/${this.client.config.owner}/${this.client.config.repo}/issues`;
      }

      logger.debug(`创建Issue: ${payload.title}`);
      logger.debug(`发送的数据: ${JSON.stringify(payload)}`);
      logger.debug(`API端点: ${endpoint}`);
      let response = await this.client.post(endpoint, payload);
      logger.debug(`API响应: ${JSON.stringify(response)}`);

      // 检查API错误响应
      if (response && response.error_code) {
        logger.error(`API错误响应: ${JSON.stringify(response)}`);
        throw new Error(`API错误: ${response.error_message || '未知错误'} (code: ${response.error_code})`);
      }

      if (gitlab) {
        response = normalizeGitLabIssue(response);
      }

      // 处理不同的API响应格式
      let issue;
      if (response && typeof response === 'object') {
        // GitCode API返回的number可能是字符串，需要转换为数字
        const issueNumber = response.number || response.id || response.iid || response.issue_id;
        issue = {
          number: issueNumber ? parseInt(issueNumber, 10) : undefined,
          title: response.title || response.name || 'Untitled',
          ...response
        };
      } else {
        issue = response;
      }

      if (!issue.number || !issue.title) {
        logger.warn(`Issue响应缺少必要字段: number=${issue.number}, title=${issue.title}`);
      }

      logger.info(`Issue创建成功: #${issue.number} - ${issue.title}`);
      return issue;
    } catch (error) {
      logger.error('创建Issue失败:', formatError(error));
      throw error;
    }
  }

  /**
   * 更新Issue
   * @param {number} issueNumber - Issue编号
   * @param {Object} updateData - 更新数据
   * @param {string} [updateData.title] - 标题
   * @param {string} [updateData.body] - 内容
   * @param {string} [updateData.state] - 状态 (open/closed)
   * @param {Array<string>} [updateData.labels] - 标签
   * @param {Array<string>} [updateData.assignees] - 指派人
   * @param {string} [updateData.milestone] - 里程碑
   * @returns {Promise<Object>} 更新后的Issue
   */
  async update(issueNumber, updateData) {
    try {
      if (!issueNumber || typeof issueNumber !== 'number') {
        throw new Error('Issue编号必须为数字');
      }

      const gitlab = isGitLab(this.client);

      // 处理AtomGit API的特殊字段映射
      // AtomGit使用state字段，但值必须是'close'或'reopen'，而不是'closed'或'open'
      const patchData = { ...updateData };
      if (patchData.state) {
        if (patchData.state === 'closed') {
          patchData.state = 'close';
        } else if (patchData.state === 'open') {
          patchData.state = 'reopen';
        }
      }

      // 归一化 labels 和 assignee 字段
      if (Array.isArray(patchData.labels)) {
        const normalizedLabels = patchData.labels.map(String).map(s => s.trim()).filter(Boolean);
        // GitLab accepts a comma-separated string OR an array — string is the
        // safer cross-version choice. AtomGit needs a string too.
        patchData.labels = normalizedLabels.join(',');
      }
      if (Array.isArray(patchData.assignees) && patchData.assignees.length > 0 && !patchData.assignee) {
        patchData.assignee = patchData.assignees[0];
      }
      delete patchData.assignees;

      // GitLab adaptation: body→description, state→state_event, assignee→assignee_ids
      if (gitlab) {
        if (patchData.body !== undefined) {
          patchData.description = patchData.body;
          delete patchData.body;
        }
        if (patchData.state === 'close') {
          patchData.state_event = 'close';
          delete patchData.state;
        } else if (patchData.state === 'reopen') {
          patchData.state_event = 'reopen';
          delete patchData.state;
        }
        // GitLab assigns by numeric user id, not username. Resolve username → id.
        if (patchData.assignee !== undefined) {
          const username = patchData.assignee;
          delete patchData.assignee;
          if (username === '' || username === null) {
            // Clear assignees (GitLab uses [0] / empty to unassign).
            patchData.assignee_ids = [0];
          } else {
            const userId = await this._resolveGitLabUserId(username);
            if (userId != null) {
              patchData.assignee_ids = [userId];
            } else {
              throw new Error(`无法在 GitLab 上找到用户 "${username}" 的数字 ID，无法指派。请确认该用户名在平台存在且 Token 有读取权限。`);
            }
          }
        }
      }

      // 移除空值字段
      Object.keys(patchData).forEach(key => {
        const value = patchData[key];
        if (value === undefined || value === null || value === '') {
          delete patchData[key];
          return;
        }
        if (Array.isArray(value) && value.length === 0) {
          delete patchData[key];
        }
      });

      // AtomGit API要求至少提供一个字段（除了state）
      // 如果只有state字段，需要获取当前issue的标题来满足API要求。
      // GitLab 没有这个限制，跳过。
      if (!gitlab) {
        const hasOtherFields = Object.keys(patchData).some(key => key !== 'state');
        if (!hasOtherFields && patchData.state) {
          try {
            const currentIssue = await this.get(issueNumber);
            patchData.title = currentIssue.title;
            logger.debug(`添加标题字段以满足AtomGit API要求: "${currentIssue.title}"`);
          } catch (error) {
            patchData.title = `Issue #${issueNumber}`;
            logger.warn(`无法获取Issue #${issueNumber}的标题，使用虚拟标题: "${patchData.title}"`);
          }
        }
      }

      const endpoint = gitlab
        ? `/projects/${gitlabProjectPath(this.client)}/issues/${issueNumber}`
        : `/repos/${this.client.config.owner}/${this.client.config.repo}/issues/${issueNumber}`;
      // GitLab uses PUT for issue updates; GitHub/AtomGit use PATCH.
      const httpMethod = gitlab ? 'put' : 'patch';

      logger.debug(`更新Issue #${issueNumber}`, { originalData: updateData, patchData, httpMethod, endpoint });
      let response = await this.client[httpMethod](endpoint, patchData);
      logger.debug(`API响应: ${JSON.stringify(response)}`);

      // 检查API错误响应
      if (response && response.error_code) {
        logger.error(`API错误响应: ${JSON.stringify(response)}`);
        throw new Error(`API错误: ${response.error_message || '未知错误'} (code: ${response.error_code})`);
      }

      if (gitlab) {
        response = normalizeGitLabIssue(response);
      }

      // 处理不同的API响应格式
      let issue;
      if (response && typeof response === 'object') {
        // GitCode API返回的number可能是字符串，需要转换为数字
        const issueNumberResp = response.number || response.id || response.iid || response.issue_id;
        issue = {
          number: issueNumberResp ? parseInt(issueNumberResp, 10) : undefined,
          title: response.title || response.name || 'Untitled',
          ...response
        };
      } else {
        issue = response;
      }

      if (!issue.number || !issue.title) {
        logger.warn(`Issue响应缺少必要字段: number=${issue.number}, title=${issue.title}`);
      }

      logger.info(`Issue更新成功: #${issue.number}`);
      return issue;
    } catch (error) {
      logger.error(`更新Issue #${issueNumber}失败:`, formatError(error));
      throw error;
    }
  }

  /**
   * 关闭Issue
   * @param {number} issueNumber - Issue编号
   * @returns {Promise<Object>} 关闭后的Issue
   */
  async close(issueNumber) {
    return this.update(issueNumber, { state: 'closed' });
  }

  /**
   * 重新打开Issue
   * @param {number} issueNumber - Issue编号
   * @returns {Promise<Object>} 重新打开后的Issue
   */
  async reopen(issueNumber) {
    return this.update(issueNumber, { state: 'open' });
  }

  /**
   * 搜索Issue
   * @param {string} query - 搜索查询
   * @param {Object} [params] - 搜索参数
   * @returns {Promise<Array>} 搜索结果
   */
  async search(query, params = {}) {
    try {
      if (!query || typeof query !== 'string') {
        throw new Error('搜索查询不能为空');
      }

      const gitlab = isGitLab(this.client);

      if (gitlab) {
        // GitLab project-scoped search: /projects/:id/search?scope=issues&search=...
        const searchParams = {
          scope: 'issues',
          search: query,
          ...params
        };
        logger.debug(`搜索Issue (GitLab): ${query}`);
        const items = await this.client.get(
          `/projects/${gitlabProjectPath(this.client)}/search`,
          searchParams
        );
        const list = Array.isArray(items) ? items : [];
        return list.map(normalizeGitLabIssue);
      }

      const searchParams = {
        q: `${query} repo:${this.client.config.owner}/${this.client.config.repo}`,
        ...params
      };

      logger.debug(`搜索Issue: ${query}`);
      const result = await this.client.get('/search/issues', searchParams);
      return result.items || [];
    } catch (error) {
      logger.error(`搜索Issue失败 "${query}":`, formatError(error));
      throw error;
    }
  }

  /**
   * 获取Issue评论
   * @param {number} issueNumber - Issue编号
   * @param {Object} [params] - 查询参数
   * @returns {Promise<Array>} 评论列表
   */
  async getComments(issueNumber, params = {}) {
    try {
      if (!issueNumber || typeof issueNumber !== 'number') {
        throw new Error('Issue编号必须为数字');
      }

      const queryParams = {
        page: params.page || 1,
        per_page: params.per_page || 30
      };

      const gitlab = isGitLab(this.client);
      const endpoint = gitlab
        ? `/projects/${gitlabProjectPath(this.client)}/issues/${issueNumber}/notes`
        : `/repos/${this.client.config.owner}/${this.client.config.repo}/issues/${issueNumber}/comments`;

      logger.debug(`获取Issue #${issueNumber}的评论`);
      const comments = await this.client.get(endpoint, queryParams);
      if (!Array.isArray(comments)) {
        return [];
      }
      if (gitlab) {
        return comments.map(c => (c && c.body === undefined && c.note !== undefined)
          ? { ...c, body: c.note }
          : c);
      }
      return comments;
    } catch (error) {
      logger.error(`获取Issue #${issueNumber}评论失败:`, formatError(error));
      throw error;
    }
  }

  /**
   * 添加Issue评论
   * @param {number} issueNumber - Issue编号
   * @param {string} body - 评论内容
   * @returns {Promise<Object>} 创建的评论
   */
  async addComment(issueNumber, body) {
    try {
      if (!issueNumber || typeof issueNumber !== 'number') {
        throw new Error('Issue编号必须为数字');
      }

      if (!body || typeof body !== 'string') {
        throw new Error('评论内容不能为空');
      }

      const gitlab = isGitLab(this.client);
      logger.debug(`为Issue #${issueNumber}添加评论`);

      let comment;
      if (gitlab) {
        // GitLab notes API: POST /projects/:id/issues/:iid/notes with { body }
        comment = await this.client.post(
          `/projects/${gitlabProjectPath(this.client)}/issues/${issueNumber}/notes`,
          { body }
        );
        if (comment && comment.body === undefined && comment.note !== undefined) {
          comment = { ...comment, body: comment.note };
        }
      } else {
        comment = await this.client.post(
          `/repos/${this.client.config.owner}/${this.client.config.repo}/issues/${issueNumber}/comments`,
          { body }
        );
      }
      logger.info(`评论添加成功`);
      return comment;
    } catch (error) {
      logger.error(`为Issue #${issueNumber}添加评论失败:`, formatError(error));
      throw error;
    }
  }
}

module.exports = IssueAPI;
