const GitCodeError = require('./gitcode-error');

class ApiError extends GitCodeError {
  constructor(message, metadata = {}) {
    super(message, metadata);
    this.name = 'ApiError';
  }
}

class AuthenticationError extends ApiError {
  constructor(message = '认证失败，请检查API Token', metadata = {}) {
    super(message, metadata);
    this.name = 'AuthenticationError';
  }
}

class ValidationError extends ApiError {
  constructor(message = '请求参数错误', metadata = {}) {
    super(message, metadata);
    this.name = 'ValidationError';
  }
}

class NotFoundError extends ApiError {
  constructor(message = '请求的资源不存在', metadata = {}) {
    super(message, metadata);
    this.name = 'NotFoundError';
  }
}

class RateLimitError extends ApiError {
  constructor(message = 'API调用频率超限，请稍后重试', metadata = {}) {
    super(message, metadata);
    this.name = 'RateLimitError';
  }
}

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