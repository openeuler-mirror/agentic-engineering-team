/**
 * GitCode错误基类
 */

class GitCodeError extends Error {
  constructor(message, metadata = {}) {
    super(message);
    this.name = this.constructor.name;
    this.metadata = metadata;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      metadata: this.metadata,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }

  toString() {
    return `${this.name}: ${this.message}`;
  }
}

module.exports = GitCodeError;