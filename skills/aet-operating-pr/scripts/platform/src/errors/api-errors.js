/**
 * API相关错误
 */

const GitCodeError = require('./gitcode-error');

/**
 * API错误基类
 */
class ApiError extends GitCodeError {
  constructor(message, metadata = {}) {
    super(message, metadata);
    this.name = 'ApiError';
  }
}

/**
 * 认证错误
 */
class AuthenticationError extends ApiError {
  constructor(message = '认证失败，请检查API Token', metadata = {}) {
    super(message, metadata);
    this.name = 'AuthenticationError';
  }
}

/**
 * 验证错误
 */
class ValidationError extends ApiError {
  constructor(message = '请求参数错误', metadata = {}) {
    super(message, metadata);
    this.name = 'ValidationError';
  }
}

/**
 * 未找到错误
 */
class NotFoundError extends ApiError {
  constructor(message = '请求的资源不存在', metadata = {}) {
    super(message, metadata);
    this.name = 'NotFoundError';
  }
}

/**
 * 频率限制错误
 */
class RateLimitError extends ApiError {
  constructor(message = 'API调用频率超限，请稍后重试', metadata = {}) {
    super(message, metadata);
    this.name = 'RateLimitError';
  }
}

/**
 * 服务器错误
 */
class ServerError extends ApiError {
  constructor(message = 'GitCode服务器内部错误', metadata = {}) {
    super(message, metadata);
    this.name = 'ServerError';
  }
}

module.exports = {
  ApiError,
  AuthenticationError,
  ValidationError,
  NotFoundError,
  RateLimitError,
  ServerError
};