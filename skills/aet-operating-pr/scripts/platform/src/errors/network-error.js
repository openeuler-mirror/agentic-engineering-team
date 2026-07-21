/**
 * 网络相关错误
 */

const GitCodeError = require('./gitcode-error');

/**
 * 网络错误
 */
class NetworkError extends GitCodeError {
  constructor(message = '网络连接失败，请检查网络设置', metadata = {}) {
    super(message, metadata);
    this.name = 'NetworkError';
  }
}

/**
 * 连接超时错误
 */
class ConnectionTimeoutError extends NetworkError {
  constructor(timeoutMs, metadata = {}) {
    super(`连接超时 (${timeoutMs}ms)`, { timeoutMs, ...metadata });
    this.name = 'ConnectionTimeoutError';
  }
}

/**
 * DNS解析错误
 */
class DNSResolutionError extends NetworkError {
  constructor(hostname, metadata = {}) {
    super(`DNS解析失败: ${hostname}`, { hostname, ...metadata });
    this.name = 'DNSResolutionError';
  }
}

/**
 * SSL证书错误
 */
class SSLCertificateError extends NetworkError {
  constructor(message = 'SSL证书验证失败', metadata = {}) {
    super(message, metadata);
    this.name = 'SSLCertificateError';
  }
}

module.exports = {
  NetworkError,
  ConnectionTimeoutError,
  DNSResolutionError,
  SSLCertificateError
};