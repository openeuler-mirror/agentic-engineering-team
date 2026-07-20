const GitCodeError = require('./gitcode-error');

class NetworkError extends GitCodeError {
  constructor(message = '网络连接失败，请检查网络设置', metadata = {}) {
    super(message, metadata);
    this.name = 'NetworkError';
  }
}

class ConnectionTimeoutError extends NetworkError {
  constructor(timeoutMs, metadata = {}) {
    super(`连接超时 (${timeoutMs}ms)`, { timeoutMs, ...metadata });
    this.name = 'ConnectionTimeoutError';
  }
}

class DNSResolutionError extends NetworkError {
  constructor(hostname, metadata = {}) {
    super(`DNS解析失败: ${hostname}`, { hostname, ...metadata });
    this.name = 'DNSResolutionError';
  }
}

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