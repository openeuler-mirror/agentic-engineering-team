const axios = require('axios');
const logger = require('../utils/logger');
const { withRetry } = require('../utils/retry');
const { formatApiResponse, formatError } = require('../utils/formatters');
const {
  ApiError,
  AuthenticationError,
  ValidationError,
  NotFoundError,
  RateLimitError,
  ServerError
} = require('../errors/api-errors');
const {
  NetworkError,
  ConnectionTimeoutError,
  DNSResolutionError,
  SSLCertificateError
} = require('../errors/network-error');
const constants = require('../constants');
const { PLATFORM_TYPES } = require('./platform-factory');

class PlatformAPIClient {
  constructor(config) {
    this.config = {
      baseURL: config.apiBaseUrl || constants.API.BASE_URL,
      token: config.token,
      platform: config.platform || PLATFORM_TYPES.GITCODE,
      platformConfig: config.platformConfig || {},
      timeout: config.timeout || constants.API.TIMEOUT,
      maxRetries: config.maxRetries || constants.API.MAX_RETRIES,
      retryDelay: config.retryDelay || constants.API.RETRY_DELAY,
      retryMultiplier: config.retryMultiplier || constants.API.RETRY_MULTIPLIER,
      ...config
    };

    if (this.config.repository && !this.config.repo) {
      this.config.repo = this.config.repository;
    }
    if (this.config.repo && !this.config.repository) {
      this.config.repository = this.config.repo;
    }

    if (!this.config.token) {
      logger.warn(`API Token not set for ${this.config.platform}, some features may not work`);
    }

    this.client = this._createHttpClient();
    this._setupInterceptors();
    
    const shouldLogClientCreation = this.config.debug || this.config.verbose || 
                                   (process.env.LOG_LEVEL && ['debug', 'verbose'].includes(process.env.LOG_LEVEL));
    if (shouldLogClientCreation) {
      logger.info(`Created ${this.config.platform} API client`, {
        baseURL: this.config.baseURL,
        platform: this.config.platform
      });
    }
  }

  _createHttpClient() {
    const platformHeaders = this.config.platformConfig.defaultHeaders || {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'Platform-API-CLI'
    };

    const headers = {
      ...platformHeaders,
      ...this.config.headers
    };

    if (this.config.token) {
      if (this.config.platform === PLATFORM_TYPES.GITHUB) {
        headers['Authorization'] = `token ${this.config.token}`;
      } else {
        headers['Authorization'] = `Bearer ${this.config.token}`;
      }
    }

    return axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers,
      validateStatus: (status) => status < 500
    });
  }

  _setupInterceptors() {
    this.client.interceptors.request.use(
      (config) => {
        logger.debug(`API请求: ${config.method.toUpperCase()} ${config.url}`);
        if (config.data && typeof config.data === 'object') {
          logger.debug(`请求数据: ${JSON.stringify(config.data).substring(0, 200)}...`);
        }
        return config;
      },
      (error) => {
        logger.error('请求拦截器错误:', formatError(error));
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        logger.debug(`API响应: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        return Promise.reject(this._handleApiError(error));
      }
    );
  }

  _handleApiError(error) {
    logger.debug('处理API错误:', formatError(error));

    if (!error.response) {
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return new ConnectionTimeoutError(this.config.timeout, { originalError: error });
      }
      if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
        return new DNSResolutionError(error.hostname || this.config.baseURL, { originalError: error });
      }
      if (error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || error.code === 'CERT_HAS_EXPIRED') {
        return new SSLCertificateError('SSL证书验证失败', { originalError: error });
      }
      return new NetworkError('网络连接失败，请检查网络设置', { originalError: error });
    }

    const { status, data, headers } = error.response;
    const metadata = { status, data, headers, originalError: error.message };

    switch (status) {
      case constants.HTTP_STATUS.BAD_REQUEST:
        return new ValidationError('请求参数错误', metadata);
      case constants.HTTP_STATUS.UNAUTHORIZED:
        return new AuthenticationError('认证失败，请检查API Token', metadata);
      case constants.HTTP_STATUS.FORBIDDEN:
        return new ApiError('权限不足，无法访问该资源', metadata);
      case constants.HTTP_STATUS.NOT_FOUND:
        return new NotFoundError('请求的资源不存在', metadata);
      case constants.HTTP_STATUS.CONFLICT:
        return new ApiError('资源冲突，可能已存在相同资源', metadata);
      case constants.HTTP_STATUS.TOO_MANY_REQUESTS:
        const retryAfter = headers['retry-after'] || headers['x-ratelimit-reset'];
        return new RateLimitError('API调用频率超限，请稍后重试', {
          ...metadata,
          retryAfter
        });
      case constants.HTTP_STATUS.INTERNAL_SERVER_ERROR:
        return new ServerError('服务器内部错误', metadata);
      case constants.HTTP_STATUS.SERVICE_UNAVAILABLE:
        return new ServerError('服务暂时不可用', metadata);
      default:
        return new ApiError(`API错误: ${status}`, metadata);
    }
  }

  async request(method, endpoint, data = null, options = {}) {
    const config = {
      method,
      url: endpoint,
      ...options
    };

    if (data) {
      config.data = data;
    }

    try {
      const retryConfig = {
        maxRetries: this.config.maxRetries,
        initialDelay: this.config.retryDelay,
        maxDelay: this.config.retryDelay * Math.pow(this.config.retryMultiplier, this.config.maxRetries)
      };

      const response = await withRetry(
        () => this.client.request(config),
        retryConfig
      );

      logger.debug('API Response:', {
        status: response.status,
        statusText: response.statusText,
        data: response.data ? JSON.stringify(response.data).substring(0, 500) : 'No data',
        headers: response.headers ? Object.keys(response.headers) : 'No headers',
        config: {
          url: response.config?.url,
          method: response.config?.method,
          data: response.config?.data ? JSON.stringify(response.config.data).substring(0, 200) : 'No data'
        }
      });

      return formatApiResponse(response);
    } catch (error) {
      throw error;
    }
  }

  async get(endpoint, params = null, options = {}) {
    const config = { ...options };
    if (params) {
      config.params = params;
    }
    return this.request('GET', endpoint, null, config);
  }

  async post(endpoint, data = null, options = {}) {
    return this.request('POST', endpoint, data, options);
  }

  async put(endpoint, data = null, options = {}) {
    return this.request('PUT', endpoint, data, options);
  }

  async patch(endpoint, data = null, options = {}) {
    return this.request('PATCH', endpoint, data, options);
  }

  async delete(endpoint, data = null, options = {}) {
    return this.request('DELETE', endpoint, data, options);
  }

  async checkConnection() {
    try {
      await this.get('/user');
      return true;
    } catch (error) {
      logger.debug('API连接检查失败:', formatError(error));
      return false;
    }
  }

  async getRateLimit() {
    try {
      const response = await this.client.get('/rate_limit');
      return {
        limit: response.headers['x-ratelimit-limit'],
        remaining: response.headers['x-ratelimit-remaining'],
        reset: response.headers['x-ratelimit-reset']
      };
    } catch (error) {
      logger.debug('获取速率限制信息失败:', formatError(error));
      return null;
    }
  }
}

module.exports = { PlatformAPIClient, GitCodeAPIClient: PlatformAPIClient };