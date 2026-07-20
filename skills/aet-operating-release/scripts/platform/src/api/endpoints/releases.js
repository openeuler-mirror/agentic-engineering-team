const logger = require('../../utils/logger');
const { formatError } = require('../../utils/formatters');

class ReleaseAPI {
  constructor(client) {
    this.client = client;
  }

  async list(params = {}) {
    try {
      const queryParams = {
        page: params.page || 1,
        per_page: params.per_page || 30
      };

      Object.keys(queryParams).forEach(key => {
        if (queryParams[key] === undefined || queryParams[key] === null) {
          delete queryParams[key];
        }
      });

      logger.debug(`获取Release列表，参数: ${JSON.stringify(queryParams)}`);
      const releases = await this.client.get(`/repos/${this.client.config.owner}/${this.client.config.repo}/releases`, queryParams);
      logger.debug(`获取到 ${Array.isArray(releases) ? releases.length : 0} 个Release`);
      return releases || [];
    } catch (error) {
      logger.error('获取Release列表失败:', formatError(error));
      throw error;
    }
  }

  async get(releaseId) {
    try {
      if (!releaseId) {
        throw new Error('Release ID不能为空');
      }

      logger.debug(`获取Release #${releaseId}`);
      const response = await this.client.get(`/repos/${this.client.config.owner}/${this.client.config.repo}/releases/${releaseId}`);
      logger.debug(`API响应: ${JSON.stringify(response)}`);
      
      if (response && response.error_code) {
        logger.error(`API错误响应: ${JSON.stringify(response)}`);
        throw new Error(`API错误: ${response.error_message || '未知错误'} (code: ${response.error_code})`);
      }
      
      return response;
    } catch (error) {
      logger.error(`获取Release #${releaseId}失败:`, formatError(error));
      throw error;
    }
  }

  async getByTag(tag) {
    try {
      if (!tag || typeof tag !== 'string') {
        throw new Error('Tag不能为空');
      }

      logger.debug(`获取Release by tag: ${tag}`);
      const response = await this.client.get(`/repos/${this.client.config.owner}/${this.client.config.repo}/releases/tags/${tag}`);
      logger.debug(`API响应: ${JSON.stringify(response)}`);
      
      if (response && response.error_code) {
        logger.error(`API错误响应: ${JSON.stringify(response)}`);
        throw new Error(`API错误: ${response.error_message || '未知错误'} (code: ${response.error_code})`);
      }
      
      return response;
    } catch (error) {
      logger.error(`获取Release by tag ${tag}失败:`, formatError(error));
      throw error;
    }
  }

  async getLatest() {
    try {
      logger.debug('获取最新Release');
      const response = await this.client.get(`/repos/${this.client.config.owner}/${this.client.config.repo}/releases/latest`);
      logger.debug(`API响应: ${JSON.stringify(response)}`);
      
      if (response && response.error_code) {
        logger.error(`API错误响应: ${JSON.stringify(response)}`);
        throw new Error(`API错误: ${response.error_message || '未知错误'} (code: ${response.error_code})`);
      }
      
      return response;
    } catch (error) {
      logger.error('获取最新Release失败:', formatError(error));
      throw error;
    }
  }

  async create(releaseData) {
    try {
      if (!releaseData || typeof releaseData !== 'object') {
        throw new Error('Release数据不能为空');
      }

      if (!releaseData.tag_name) {
        throw new Error('tag_name是必填字段');
      }

      const payload = { ...releaseData };

      if (!payload.repo) {
        payload.repo = this.client.config.repo;
      }

      Object.keys(payload).forEach(key => {
        const value = payload[key];
        if (value === undefined || value === null || value === '') {
          delete payload[key];
        }
      });

      logger.debug(`创建Release: ${payload.tag_name}`);
      logger.debug(`发送的数据: ${JSON.stringify(payload)}`);
      const response = await this.client.post(`/repos/${this.client.config.owner}/${this.client.config.repo}/releases`, payload);
      logger.debug(`API响应: ${JSON.stringify(response)}`);
      
      if (response && response.error_code) {
        logger.error(`API错误响应: ${JSON.stringify(response)}`);
        throw new Error(`API错误: ${response.error_message || '未知错误'} (code: ${response.error_code})`);
      }
      
      const releaseId = response.id || response.release_id;
      logger.info(`Release创建成功: #${releaseId} - ${response.tag_name || response.name || 'Untitled'}`);
      return response;
    } catch (error) {
      logger.error('创建Release失败:', formatError(error));
      throw error;
    }
  }

  async update(releaseId, updateData) {
    try {
      if (!releaseId) {
        throw new Error('Release ID不能为空');
      }

      if (!updateData || typeof updateData !== 'object') {
        throw new Error('更新数据不能为空');
      }

      const payload = { ...updateData };

      Object.keys(payload).forEach(key => {
        const value = payload[key];
        if (value === undefined || value === null || value === '') {
          delete payload[key];
        }
      });

      logger.debug(`更新Release #${releaseId}`, payload);
      const response = await this.client.patch(`/repos/${this.client.config.owner}/${this.client.config.repo}/releases/${releaseId}`, payload);
      logger.debug(`API响应: ${JSON.stringify(response)}`);
      
      if (response && response.error_code) {
        logger.error(`API错误响应: ${JSON.stringify(response)}`);
        throw new Error(`API错误: ${response.error_message || '未知错误'} (code: ${response.error_code})`);
      }
      
      logger.info(`Release更新成功: #${releaseId}`);
      return response;
    } catch (error) {
      logger.error(`更新Release #${releaseId}失败:`, formatError(error));
      throw error;
    }
  }

  async delete(releaseId) {
    try {
      logger.warn('AtomGit API does not support delete-release endpoint. Use delete-tag instead.');
      throw new Error('AtomGit does not support deleting Release directly. Please delete the associated Tag instead using: release-api delete-tag --tag <tag>');
    } catch (error) {
      logger.error(`删除Release失败:`, formatError(error));
      throw error;
    }
  }

  async deleteTag(tag) {
    try {
      if (!tag || typeof tag !== 'string') {
        throw new Error('Tag不能为空');
      }

      logger.debug(`删除Tag: ${tag}`);
      const response = await this.client.delete(`/repos/${this.client.config.owner}/${this.client.config.repo}/tags/${tag}`);
      logger.debug(`API响应: ${JSON.stringify(response)}`);
      
      if (response && response.error_code) {
        logger.error(`API错误响应: ${JSON.stringify(response)}`);
        throw new Error(`API错误: ${response.error_message || '未知错误'} (code: ${response.error_code})`);
      }
      
      logger.info(`Tag ${tag} 删除成功`);
      return response;
    } catch (error) {
      logger.error(`删除Tag ${tag}失败:`, formatError(error));
      throw error;
    }
  }

  async getUploadUrl(tag) {
    try {
      if (!tag || typeof tag !== 'string') {
        throw new Error('Tag不能为空');
      }

      logger.debug(`获取Release ${tag}的附件上传地址`);
      const response = await this.client.get(`/repos/${this.client.config.owner}/${this.client.config.repo}/releases/${tag}/upload_url`);
      logger.debug(`API响应: ${JSON.stringify(response)}`);
      
      if (response && response.error_code) {
        logger.error(`API错误响应: ${JSON.stringify(response)}`);
        throw new Error(`API错误: ${response.error_message || '未知错误'} (code: ${response.error_code})`);
      }
      
      logger.info(`获取附件上传地址成功: ${tag}`);
      return response;
    } catch (error) {
      logger.error(`获取附件上传地址 ${tag}失败:`, formatError(error));
      throw error;
    }
  }

  async downloadAsset(releaseId, fileName) {
    try {
      if (!releaseId) {
        throw new Error('Release ID不能为空');
      }

      if (!fileName || typeof fileName !== 'string') {
        throw new Error('文件名不能为空');
      }

      logger.debug(`下载Release #${releaseId}的附件: ${fileName}`);
      const response = await this.client.get(`/repos/${this.client.config.owner}/${this.client.config.repo}/releases/${releaseId}/attach_files/${fileName}/download`);
      logger.debug(`API响应: ${JSON.stringify(response)}`);
      
      if (response && response.error_code) {
        logger.error(`API错误响应: ${JSON.stringify(response)}`);
        throw new Error(`API错误: ${response.error_message || '未知错误'} (code: ${response.error_code})`);
      }
      
      logger.info(`下载附件成功: ${fileName}`);
      return response;
    } catch (error) {
      logger.error(`下载附件 ${fileName}失败:`, formatError(error));
      throw error;
    }
  }
}

module.exports = ReleaseAPI;