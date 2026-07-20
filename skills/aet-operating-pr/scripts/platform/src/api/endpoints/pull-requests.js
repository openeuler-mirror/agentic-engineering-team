/**
 * Pull Request相关API端点
 */

const logger = require('../../utils/logger');
const { formatError } = require('../../utils/formatters');
const { ConfigValidator } = require('../../config');

/**
 * Check whether the current client is talking to a GitLab platform.
 */
function isGitLab(client) {
  return client && client.config && client.config.platform === 'gitlab';
}

/**
 * Resolve owner/repo for a client, accounting for both `repo` and `repository` fields.
 */
function ownerRepo(client) {
  const owner = client.config.owner;
  const repo = client.config.repository || client.config.repo;
  return { owner, repo };
}

/**
 * Build the URL-encoded GitLab project path for the current client.
 */
function gitlabProjectPath(client) {
  const { owner, repo } = ownerRepo(client);
  return encodeURIComponent(`${owner}/${repo}`);
}

/**
 * Normalize a GitLab MR payload into the GitHub-style PR shape.
 */
function normalizeGitLabMR(mr) {
  if (!mr || typeof mr !== 'object') {
    return mr;
  }
  const normalized = { ...mr };
  if (mr.iid !== undefined && normalized.number === undefined) {
    normalized.number = parseInt(mr.iid, 10);
  }
  if (mr.description !== undefined && normalized.body === undefined) {
    normalized.body = mr.description;
  }
  if (mr.web_url && !normalized.html_url) {
    normalized.html_url = mr.web_url;
  }
  if (mr.source_branch && !normalized.head) {
    normalized.head = { ref: mr.source_branch };
  }
  if (mr.target_branch && !normalized.base) {
    normalized.base = { ref: mr.target_branch };
  }
  if (mr.state === 'opened') {
    normalized.state = 'open';
  } else if (mr.state === 'merged') {
    normalized.state = 'merged';
  }
  return normalized;
}

/**
 * Map a GitHub-style state filter to a GitLab one.
 */
function mapStateToGitLab(state) {
  if (!state) return 'opened';
  if (state === 'all') return undefined;
  if (state === 'open') return 'opened';
  return state;
}

/**
 * Pull Request API端点
 */
class PullRequestAPI {
  /**
   * 创建PR API端点
   * @param {GitCodeAPIClient} client - API客户端
   */
  constructor(client) {
    this.client = client;
  }

  /**
   * 获取PR列表
   * @param {Object} [params] - 查询参数
   * @param {string} [params.state] - 状态 (open/closed/all)
   * @param {string} [params.head] - 源分支
   * @param {string} [params.base] - 目标分支
   * @param {string} [params.sort] - 排序 (created/updated/popularity)
   * @param {string} [params.direction] - 排序方向 (asc/desc)
   * @param {number} [params.page] - 页码
   * @param {number} [params.per_page] - 每页数量
   * @returns {Promise<Array>} PR列表
   */
  async list(params = {}) {
    try {
      const gitlab = isGitLab(this.client);
      const { owner, repo } = ownerRepo(this.client);

      let endpoint;
      let queryParams;

      if (gitlab) {
        endpoint = `/projects/${gitlabProjectPath(this.client)}/merge_requests`;
        // GitLab MR list filtering uses source_branch / target_branch (note:
        // for cross-project MRs `head` may have been "forkOwner:branch" — strip
        // the project prefix and filter on branch name only).
        const headBranch = typeof params.head === 'string' && params.head.includes(':')
          ? params.head.split(':').pop()
          : params.head;
        queryParams = {
          state: mapStateToGitLab(params.state),
          source_branch: headBranch,
          target_branch: params.base,
          order_by: params.sort === 'created' ? 'created_at' : (params.sort || 'created_at'),
          sort: params.direction || 'desc',
          page: params.page || 1,
          per_page: params.per_page || 30
        };
      } else {
        endpoint = `/repos/${owner}/${repo}/pulls`;
        queryParams = {
          state: params.state || 'open',
          head: params.head,
          base: params.base,
          sort: params.sort || 'created',
          direction: params.direction || 'desc',
          page: params.page || 1,
          per_page: params.per_page || 30
        };
      }

      Object.keys(queryParams).forEach(key => {
        if (queryParams[key] === undefined || queryParams[key] === null) {
          delete queryParams[key];
        }
      });

      logger.debug(`获取PR列表，参数: ${JSON.stringify(queryParams)}`);
      let pullRequests = await this.client.get(endpoint, queryParams);
      const list = Array.isArray(pullRequests) ? pullRequests : [];
      logger.debug(`获取到 ${list.length} 个PR`);
      return gitlab ? list.map(normalizeGitLabMR) : list;
    } catch (error) {
      logger.error('获取PR列表失败:', formatError(error));
      throw error;
    }
  }

  /**
   * 获取单个PR
   * @param {number} prNumber - PR编号
   * @returns {Promise<Object>} PR详情
   */
  async get(prNumber) {
    try {
      if (!prNumber || typeof prNumber !== 'number') {
        throw new Error('PR编号必须为数字');
      }

      const gitlab = isGitLab(this.client);
      const { owner, repo } = ownerRepo(this.client);
      const endpoint = gitlab
        ? `/projects/${gitlabProjectPath(this.client)}/merge_requests/${prNumber}`
        : `/repos/${owner}/${repo}/pulls/${prNumber}`;

      logger.debug(`获取PR #${prNumber}`);
      const pr = await this.client.get(endpoint);
      return gitlab ? normalizeGitLabMR(pr) : pr;
    } catch (error) {
      logger.error(`获取PR #${prNumber}失败:`, formatError(error));
      throw error;
    }
  }

  /**
   * 创建PR
   * @param {Object} prData - PR数据
   * @param {string} prData.title - 标题
   * @param {string} prData.body - 内容
   * @param {string} prData.head - 源分支
   * @param {string} prData.base - 目标分支
   * @param {boolean} [prData.draft] - 是否为草稿
   * @param {Array<string>} [prData.labels] - 标签
   * @param {Array<string>} [prData.assignees] - 指派人
   * @param {string} [prData.milestone] - 里程碑
   * @returns {Promise<Object>} 创建的PR
   */
  async create(prData) {
    try {
      // 验证PR数据
      const validatedData = ConfigValidator.validatePrCreateConfig(prData);

      // 清理空数组和空字符串
      if (validatedData.labels && Array.isArray(validatedData.labels) && validatedData.labels.length === 0) {
        delete validatedData.labels;
      }
      if (validatedData.assignees && validatedData.assignees === '') {
        delete validatedData.assignees;
      }

      const gitlab = isGitLab(this.client);
      const { owner, repo } = ownerRepo(this.client);

      if (gitlab) {
        // Map GitHub-style → GitLab MR create payload
        const headBranch = typeof validatedData.head === 'string' && validatedData.head.includes(':')
          ? validatedData.head.split(':').pop()
          : validatedData.head;

        const gitlabPayload = {
          source_branch: headBranch,
          target_branch: validatedData.base,
          title: validatedData.draft ? `Draft: ${validatedData.title}` : validatedData.title,
          description: validatedData.body || ''
        };
        if (validatedData.labels) {
          gitlabPayload.labels = Array.isArray(validatedData.labels)
            ? validatedData.labels.join(',')
            : validatedData.labels;
        }

        // 确定 source 项目路径 与（跨项目时）target_project_id。
        // fork 工作流：源分支在 fork(source) 项目，MR 目标是 upstream(target) 项目。
        // GitLab 跨项目 MR 规则：POST 到 source 项目的 merge_requests，并带 target_project_id（upstream 数字 ID）。
        const forkOwner = this.client.config.forkOwner;
        const forkRepo = this.client.config.forkRepository || this.client.config.forkRepo || repo;
        let sourceProjectPath;
        if (forkOwner && forkOwner !== owner) {
          sourceProjectPath = encodeURIComponent(`${forkOwner}/${forkRepo}`);
          // 解析上游（目标）项目数字 ID
          const targetPath = encodeURIComponent(`${owner}/${repo}`);
          let targetProject;
          try {
            targetProject = await this.client.get(`/projects/${targetPath}`);
          } catch (e) {
            throw new Error(`无法解析上游项目 ${owner}/${repo}（用于 target_project_id）: ${e.message}`);
          }
          const targetId = targetProject && (targetProject.id != null
            ? targetProject.id
            : (targetProject.data && targetProject.data.id));
          if (targetId == null) {
            throw new Error(`无法获取上游项目 ID: ${owner}/${repo}`);
          }
          gitlabPayload.target_project_id = targetId;
          logger.debug(`GitLab 跨项目 MR: source=${forkOwner}/${forkRepo} → target=${owner}/${repo} (target_project_id=${targetId})`);
        } else {
          // 同项目 MR
          sourceProjectPath = gitlabProjectPath(this.client);
        }

        Object.keys(gitlabPayload).forEach(k => {
          if (gitlabPayload[k] === undefined || gitlabPayload[k] === null || gitlabPayload[k] === '') {
            // Keep description even if empty? GitLab accepts empty string — drop it.
            delete gitlabPayload[k];
          }
        });

        const endpoint = `/projects/${sourceProjectPath}/merge_requests`;
        logger.debug(`创建MR (GitLab): ${gitlabPayload.title}`);
        logger.debug(`发送的数据: ${JSON.stringify(gitlabPayload)}`);
        const mr = await this.client.post(endpoint, gitlabPayload);
        const normalized = normalizeGitLabMR(mr);
        logger.info(`MR创建成功: #${normalized.number} - ${normalized.title}`);
        return normalized;
      }

      // 处理跨仓库PR：如果配置中有forkOwner且不同于owner，且head不包含冒号，自动添加前缀
      const forkOwner = this.client.config.forkOwner;
      if (forkOwner && forkOwner !== owner && validatedData.head && !validatedData.head.includes(':')) {
        const originalHead = validatedData.head;
        validatedData.head = `${forkOwner}:${originalHead}`;
        logger.debug(`跨仓库PR检测，自动转换head参数: "${originalHead}" → "${validatedData.head}"`);
      }

      logger.debug(`创建PR: ${validatedData.title}`);
      logger.debug(`发送的数据: ${JSON.stringify(validatedData)}`);
      const pr = await this.client.post(`/repos/${owner}/${repo}/pulls`, validatedData);
      logger.info(`PR创建成功: #${pr.number} - ${pr.title}`);
      return pr;
    } catch (error) {
      logger.error('创建PR失败:', formatError(error));
      throw error;
    }
  }

  /**
   * Link Issue to PR
   * Note: The API endpoint returns 400 "Request body parsing error" - may need investigation
   */
  async linkIssue(prNumber, issueNumber) {
    try {
      if (isGitLab(this.client)) {
        // Not supported via GitLab MR API directly; the conventional way is to
        // include "Closes #<iid>" in the description.
        logger.warn(`linkIssue 在 GitLab 平台上未实现，请在 MR 描述中使用 "Closes #${issueNumber}" 关联 Issue`);
        return null;
      }

      const { owner, repo } = ownerRepo(this.client);
      const url = `/repos/${owner}/${repo}/pulls/${prNumber}/issues`;
      const data = JSON.stringify([issueNumber]);
      const result = await this.client.post(url, data);
      logger.info(`Issue #${issueNumber} linked to PR #${prNumber}`);
      return result;
    } catch (error) {
      logger.warn(`Failed to link issue #${issueNumber} to PR #${prNumber}:`, error.message);
      return null;
    }
  }

  /**
   * 更新PR
   * @param {number} prNumber - PR编号
   * @param {Object} updateData - 更新数据
   * @param {string} [updateData.title] - 标题
   * @param {string} [updateData.body] - 内容
   * @param {string} [updateData.state] - 状态 (open/closed)
   * @param {string} [updateData.base] - 目标分支
   * @param {Array<string>} [updateData.labels] - 标签
   * @param {Array<string>} [updateData.assignees] - 指派人
   * @param {string} [updateData.milestone] - 里程碑
   * @returns {Promise<Object>} 更新后的PR
   */
  async update(prNumber, updateData) {
    try {
      if (!prNumber || typeof prNumber !== 'number') {
        throw new Error('PR编号必须为数字');
      }

      const gitlab = isGitLab(this.client);
      const { owner, repo } = ownerRepo(this.client);

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

      if (gitlab) {
        // body → description, base → target_branch, state → state_event
        if (patchData.body !== undefined) {
          patchData.description = patchData.body;
          delete patchData.body;
        }
        if (patchData.base !== undefined) {
          patchData.target_branch = patchData.base;
          delete patchData.base;
        }
        if (patchData.state === 'close') {
          patchData.state_event = 'close';
          delete patchData.state;
        } else if (patchData.state === 'reopen') {
          patchData.state_event = 'reopen';
          delete patchData.state;
        }
        if (Array.isArray(patchData.labels)) {
          patchData.labels = patchData.labels.join(',');
        }
        delete patchData.assignees;
      } else {
        // AtomGit API要求至少提供一个字段（除了state）
        const hasOtherFields = Object.keys(patchData).some(key => key !== 'state');
        if (!hasOtherFields && patchData.state) {
          const currentPr = await this.get(prNumber);
          patchData.title = currentPr.title;
          logger.debug(`添加标题字段以满足AtomGit API要求: "${currentPr.title}"`);
        }
      }

      const endpoint = gitlab
        ? `/projects/${gitlabProjectPath(this.client)}/merge_requests/${prNumber}`
        : `/repos/${owner}/${repo}/pulls/${prNumber}`;
      const httpMethod = gitlab ? 'put' : 'patch';

      logger.debug(`更新PR #${prNumber}`, { originalData: updateData, patchData, httpMethod, endpoint });
      const pr = await this.client[httpMethod](endpoint, patchData);
      const result = gitlab ? normalizeGitLabMR(pr) : pr;
      logger.info(`PR更新成功: #${result.number}`);
      return result;
    } catch (error) {
      logger.error(`更新PR #${prNumber}失败:`, formatError(error));
      throw error;
    }
  }

  /**
   * 合并PR
   * @param {number} prNumber - PR编号
   * @param {Object} [mergeData] - 合并参数
   * @param {string} [mergeData.commit_title] - 合并提交标题
   * @param {string} [mergeData.commit_message] - 合并提交信息
   * @param {string} [mergeData.merge_method] - 合并方法 (merge/squash/rebase)
   * @returns {Promise<Object>} 合并结果
   */
  async merge(prNumber, mergeData = {}) {
    try {
      if (!prNumber || typeof prNumber !== 'number') {
        throw new Error('PR编号必须为数字');
      }

      const gitlab = isGitLab(this.client);
      const { owner, repo } = ownerRepo(this.client);

      if (gitlab) {
        // GitLab: PUT /projects/:id/merge_requests/:iid/merge
        const gitlabParams = {};
        if (mergeData.commit_message) {
          gitlabParams.merge_commit_message = mergeData.commit_message;
        }
        if (mergeData.merge_method === 'squash') {
          gitlabParams.squash = true;
          if (mergeData.commit_message) {
            gitlabParams.squash_commit_message = mergeData.commit_message;
          }
        }
        // merge_method 'rebase' on GitLab requires preconditions; pass it through if supplied.

        const endpoint = `/projects/${gitlabProjectPath(this.client)}/merge_requests/${prNumber}/merge`;
        logger.debug(`合并MR #${prNumber} (GitLab)`);
        const result = await this.client.put(endpoint, gitlabParams);
        logger.info(`MR #${prNumber} 合并成功`);
        return result;
      }

      const mergeParams = {
        commit_title: mergeData.commit_title || `Merge pull request #${prNumber}`,
        commit_message: mergeData.commit_message || '',
        merge_method: mergeData.merge_method || 'merge',
        ...mergeData
      };

      logger.debug(`合并PR #${prNumber}`);
      const result = await this.client.put(`/repos/${owner}/${repo}/pulls/${prNumber}/merge`, mergeParams);
      logger.info(`PR #${prNumber} 合并成功`);
      return result;
    } catch (error) {
      logger.error(`合并PR #${prNumber}失败:`, formatError(error));
      throw error;
    }
  }

  /**
   * 关闭PR
   * @param {number} prNumber - PR编号
   * @returns {Promise<Object>} 关闭后的PR
   */
  async close(prNumber) {
    return this.update(prNumber, { state: 'closed' });
  }

  /**
   * 重新打开PR
   * @param {number} prNumber - PR编号
   * @returns {Promise<Object>} 重新打开后的PR
   */
  async reopen(prNumber) {
    return this.update(prNumber, { state: 'open' });
  }

  /**
   * 获取PR文件列表
   * @param {number} prNumber - PR编号
   * @param {Object} [params] - 查询参数
   * @returns {Promise<Array>} 文件列表
   */
  async getFiles(prNumber, params = {}) {
    try {
      if (!prNumber || typeof prNumber !== 'number') {
        throw new Error('PR编号必须为数字');
      }

      const gitlab = isGitLab(this.client);
      const { owner, repo } = ownerRepo(this.client);

      if (gitlab) {
        // GitLab returns { changes: [{ old_path, new_path, diff, new_file, deleted_file, ... }] }
        const endpoint = `/projects/${gitlabProjectPath(this.client)}/merge_requests/${prNumber}/changes`;
        logger.debug(`获取MR #${prNumber}的changes`);
        const response = await this.client.get(endpoint);
        const changes = response && Array.isArray(response.changes) ? response.changes : [];
        // Normalize to GitHub-style file objects.
        return changes.map(ch => ({
          filename: ch.new_path || ch.old_path,
          previous_filename: ch.renamed_file ? ch.old_path : undefined,
          status: ch.new_file ? 'added' :
                  ch.deleted_file ? 'removed' :
                  ch.renamed_file ? 'renamed' : 'modified',
          patch: ch.diff,
          additions: undefined,
          deletions: undefined,
          changes: undefined,
          ...ch
        }));
      }

      const queryParams = {
        page: params.page || 1,
        per_page: params.per_page || 100
      };
      logger.debug(`获取PR #${prNumber}的文件列表`);
      const files = await this.client.get(`/repos/${owner}/${repo}/pulls/${prNumber}/files`, queryParams);
      return files || [];
    } catch (error) {
      logger.error(`获取PR #${prNumber}文件列表失败:`, formatError(error));
      throw error;
    }
  }

  /**
   * 获取PR评论
   * @param {number} prNumber - PR编号
   * @param {Object} [params] - 查询参数
   * @returns {Promise<Array>} 评论列表
   */
  async getComments(prNumber, params = {}) {
    try {
      if (!prNumber || typeof prNumber !== 'number') {
        throw new Error('PR编号必须为数字');
      }

      const gitlab = isGitLab(this.client);
      const { owner, repo } = ownerRepo(this.client);

      const queryParams = {
        page: params.page || 1,
        per_page: params.per_page || 30
      };

      const endpoint = gitlab
        ? `/projects/${gitlabProjectPath(this.client)}/merge_requests/${prNumber}/notes`
        : `/repos/${owner}/${repo}/pulls/${prNumber}/comments`;

      logger.debug(`获取PR #${prNumber}的评论`);
      const comments = await this.client.get(endpoint, queryParams);
      if (!Array.isArray(comments)) {
        return [];
      }
      if (gitlab) {
        // GitLab notes use `body` already; ensure id is numeric.
        return comments.map(c => ({
          ...c,
          body: c.body !== undefined ? c.body : c.note
        }));
      }
      return comments;
    } catch (error) {
      logger.error(`获取PR #${prNumber}评论失败:`, formatError(error));
      throw error;
    }
  }

  /**
   * Add a PR comment.
   *
   * AtomGit response quirk: `id` is a hex content reference (e.g. eb267d6a87b0d1a7...),
   * NOT a database ID. The numeric `note_id` (e.g. 171406556) is what's needed for
   * follow-up DELETE/edit. To avoid downstream foot-guns, we additionally expose
   * `numericId` (alias of `note_id`) as a stable downstream contract. Subsequent
   * deleteComment / editComment must use numericId, **not** id.
   *
   * GitLab returns notes with a numeric `id` directly — `numericId` is set from that.
   *
   * @param {number} prNumber - PR number
   * @param {string} body - Comment body
   * @returns {Promise<Object>} The created comment
   */
  async addComment(prNumber, body) {
    try {
      if (!prNumber || typeof prNumber !== 'number') {
        throw new Error('PR编号必须为数字');
      }

      if (!body || typeof body !== 'string') {
        throw new Error('评论内容不能为空');
      }

      const gitlab = isGitLab(this.client);
      const { owner, repo } = ownerRepo(this.client);
      logger.debug(`Adding comment to PR #${prNumber}`);

      let comment;
      if (gitlab) {
        const endpoint = `/projects/${gitlabProjectPath(this.client)}/merge_requests/${prNumber}/notes`;
        comment = await this.client.post(endpoint, { body });
        comment.numericId = (typeof comment.id === 'number') ? comment.id : null;
        // GitLab note delete requires the MR iid; thread it through.
        comment.prNumber = prNumber;
      } else {
        comment = await this.client.post(
          `/repos/${owner}/${repo}/pulls/${prNumber}/comments`,
          { body }
        );
        // Normalize: expose numeric id as `numericId` (note_id is AtomGit's GitLab-style field name).
        comment.numericId =
          (typeof comment.note_id === 'number') ? comment.note_id
          : (typeof comment.id === 'number')    ? comment.id
          : null;
      }

      if (comment.numericId == null) {
        logger.warn('addComment response has no numericId (neither note_id nor numeric id present); follow-up delete/edit will fail');
      }

      logger.info(`Comment added successfully; numericId=${comment.numericId}`);
      return comment;
    } catch (error) {
      logger.error(`Failed to add comment to PR #${prNumber}:`, formatError(error));
      throw error;
    }
  }

  /**
   * Delete a PR comment.
   *
   * AtomGit endpoint: `DELETE /repos/{owner}/{repo}/pulls/comments/{commentId}`
   * (Note: the URL does NOT include the PR number — comment id is repo-global.)
   *
   * GitLab endpoint: `DELETE /projects/:id/merge_requests/:iid/notes/:note_id`
   * (Note id is scoped to the MR — caller MUST supply prNumber.)
   *
   * @param {number} commentId - Comment numeric id
   * @param {number} [prNumber] - PR/MR number (required for GitLab)
   * @returns {Promise<void>}
   */
  async deleteComment(commentId, prNumber) {
    try {
      if (!commentId || typeof commentId !== 'number') {
        throw new Error('commentId must be numeric (use addComment.numericId or getComments.id)');
      }

      const gitlab = isGitLab(this.client);
      const { owner, repo } = ownerRepo(this.client);

      let url;
      if (gitlab) {
        if (!prNumber || typeof prNumber !== 'number') {
          throw new Error('GitLab 平台删除评论需要 prNumber（MR iid）参数');
        }
        url = `/projects/${gitlabProjectPath(this.client)}/merge_requests/${prNumber}/notes/${commentId}`;
      } else {
        url = `/repos/${owner}/${repo}/pulls/comments/${commentId}`;
      }

      logger.debug(`Deleting comment #${commentId}`);
      await this.client.delete(url);
      logger.info(`Comment #${commentId} deleted`);
    } catch (error) {
      logger.error(`Failed to delete comment #${commentId}:`, formatError(error));
      throw error;
    }
  }

  /**
   * 获取PR审查状态
   * @param {number} prNumber - PR编号
   * @returns {Promise<Object>} 审查状态
   */
  async getReviewStatus(prNumber) {
    try {
      if (!prNumber || typeof prNumber !== 'number') {
        throw new Error('PR编号必须为数字');
      }

      const gitlab = isGitLab(this.client);
      const { owner, repo } = ownerRepo(this.client);

      if (gitlab) {
        // GitLab approval state ≠ GitHub reviews. Map approvals → APPROVED count.
        const endpoint = `/projects/${gitlabProjectPath(this.client)}/merge_requests/${prNumber}/approvals`;
        logger.debug(`获取MR #${prNumber}的approvals (GitLab)`);
        const approvals = await this.client.get(endpoint);
        const approvedBy = approvals && Array.isArray(approvals.approved_by) ? approvals.approved_by : [];
        const reviews = approvedBy.map(a => ({ state: 'APPROVED', user: a.user || a }));
        return {
          total: reviews.length,
          approved: reviews.length,
          changes_requested: 0,
          commented: 0,
          reviews,
          gitlab_approvals: approvals
        };
      }

      logger.debug(`获取PR #${prNumber}的审查状态`);
      const reviews = await this.client.get(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`);
      return {
        total: reviews.length,
        approved: reviews.filter(r => r.state === 'APPROVED').length,
        changes_requested: reviews.filter(r => r.state === 'CHANGES_REQUESTED').length,
        commented: reviews.filter(r => r.state === 'COMMENTED').length,
        reviews: reviews
      };
    } catch (error) {
      logger.error(`获取PR #${prNumber}审查状态失败:`, formatError(error));
      throw error;
    }
  }
}

module.exports = PullRequestAPI;
