const GitCodeError = require('./gitcode-error');

class ValidationError extends GitCodeError {
  constructor(message = '数据验证失败', errors = [], metadata = {}) {
    super(message, { errors, ...metadata });
    this.name = 'ValidationError';
  }
}

class RequiredFieldError extends ValidationError {
  constructor(fieldName, metadata = {}) {
    super(`必填字段缺失: ${fieldName}`, [fieldName], metadata);
    this.name = 'RequiredFieldError';
  }
}

class FieldFormatError extends ValidationError {
  constructor(fieldName, expectedFormat, actualValue, metadata = {}) {
    super(`字段格式错误: ${fieldName} (期望: ${expectedFormat}, 实际: ${actualValue})`,
          [fieldName], metadata);
    this.name = 'FieldFormatError';
  }
}

class FieldTypeError extends ValidationError {
  constructor(fieldName, expectedType, actualValue, metadata = {}) {
    super(`字段类型错误: ${fieldName} (期望类型: ${expectedType}, 实际值: ${actualValue})`,
          [fieldName], metadata);
    this.name = 'FieldTypeError';
  }
}

module.exports = {
  ValidationError,
  RequiredFieldError,
  FieldFormatError,
  FieldTypeError
};