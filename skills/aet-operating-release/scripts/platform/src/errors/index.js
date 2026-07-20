const GitCodeError = require('./gitcode-error');
const { ApiError, AuthenticationError, NotFoundError, RateLimitError } = require('./api-errors');
const ConfigError = require('./config-errors');
const ValidationError = require('./validation-errors');
const NetworkError = require('./network-error');

module.exports = {
  GitCodeError,
  ApiError,
  ConfigError,
  ValidationError,
  NetworkError,
  AuthenticationError,
  NotFoundError,
  RateLimitError
};