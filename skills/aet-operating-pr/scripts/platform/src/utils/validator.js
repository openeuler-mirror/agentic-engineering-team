/**
 * 数据验证工具
 */

const { ValidationError, FieldFormatError, FieldTypeError, RequiredFieldError } = require('../errors/validation-errors');

/**
 * 验证必填字段
 * @param {Object} data - 待验证的数据对象
 * @param {string[]} requiredFields - 必填字段名数组
 * @throws {RequiredFieldError}
 */
function validateRequiredFields(data, requiredFields) {
  if (!data || typeof data !== 'object') {
    throw new ValidationError('数据必须是对象');
  }

  const missingFields = requiredFields.filter(field => {
    const value = data[field];
    return value === undefined || value === null || value === '';
  });

  if (missingFields.length > 0) {
    throw new RequiredFieldError(missingFields[0]);
  }
}

/**
 * 验证字段类型
 * @param {Object} data - 待验证的数据对象
 * @param {Object} typeRules - 字段类型规则 {字段名: '类型'}
 * @throws {FieldTypeError}
 */
function validateFieldTypes(data, typeRules) {
  if (!data || typeof data !== 'object') {
    throw new ValidationError('数据必须是对象');
  }

  for (const [field, expectedType] of Object.entries(typeRules)) {
    const value = data[field];

    // 允许undefined（可选字段）
    if (value === undefined) {
      continue;
    }

    let isValid = false;

    switch (expectedType) {
      case 'string':
        isValid = typeof value === 'string';
        break;
      case 'number':
        isValid = typeof value === 'number' && !isNaN(value);
        break;
      case 'boolean':
        isValid = typeof value === 'boolean';
        break;
      case 'array':
        isValid = Array.isArray(value);
        break;
      case 'object':
        isValid = typeof value === 'object' && value !== null && !Array.isArray(value);
        break;
      case 'integer':
        isValid = Number.isInteger(value);
        break;
      default:
        throw new ValidationError(`未知类型: ${expectedType}`);
    }

    if (!isValid) {
      throw new FieldTypeError(field, expectedType, value);
    }
  }
}

/**
 * 验证字段格式（正则表达式）
 * @param {Object} data - 待验证的数据对象
 * @param {Object} formatRules - 字段格式规则 {字段名: RegExp}
 * @throws {FieldFormatError}
 */
function validateFieldFormats(data, formatRules) {
  if (!data || typeof data !== 'object') {
    throw new ValidationError('数据必须是对象');
  }

  for (const [field, regex] of Object.entries(formatRules)) {
    const value = data[field];

    // 允许undefined（可选字段）
    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value !== 'string') {
      throw new FieldFormatError(field, '字符串', value);
    }

    if (!regex.test(value)) {
      throw new FieldFormatError(field, `匹配正则: ${regex}`, value);
    }
  }
}

/**
 * 验证字段值在允许的范围内
 * @param {Object} data - 待验证的数据对象
 * @param {Object} enumRules - 枚举规则 {字段名: Array<允许的值>}
 * @throws {ValidationError}
 */
function validateFieldEnums(data, enumRules) {
  if (!data || typeof data !== 'object') {
    throw new ValidationError('数据必须是对象');
  }

  for (const [field, allowedValues] of Object.entries(enumRules)) {
    const value = data[field];

    // 允许undefined（可选字段）
    if (value === undefined || value === null) {
      continue;
    }

    if (!allowedValues.includes(value)) {
      throw new ValidationError(`字段 ${field} 的值必须是: ${allowedValues.join(', ')}`);
    }
  }
}

/**
 * 验证数字范围
 * @param {Object} data - 待验证的数据对象
 * @param {Object} rangeRules - 范围规则 {字段名: {min, max}}
 * @throws {ValidationError}
 */
function validateFieldRanges(data, rangeRules) {
  if (!data || typeof data !== 'object') {
    throw new ValidationError('数据必须是对象');
  }

  for (const [field, range] of Object.entries(rangeRules)) {
    const value = data[field];

    // 允许undefined（可选字段）
    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value !== 'number' || isNaN(value)) {
      throw new FieldTypeError(field, '数字', value);
    }

    if (range.min !== undefined && value < range.min) {
      throw new ValidationError(`字段 ${field} 的值必须 >= ${range.min}`);
    }

    if (range.max !== undefined && value > range.max) {
      throw new ValidationError(`字段 ${field} 的值必须 <= ${range.max}`);
    }
  }
}

/**
 * 综合验证器
 */
class Validator {
  /**
   * 创建验证器
   * @param {Object} schema - 验证模式
   */
  constructor(schema = {}) {
    this.schema = schema;
  }

  /**
   * 验证数据
   * @param {Object} data - 待验证的数据
   * @returns {Object} 验证后的数据（可能包含默认值）
   * @throws {ValidationError}
   */
  validate(data) {
    const result = { ...data };

    // 验证必填字段
    if (this.schema.required) {
      validateRequiredFields(result, this.schema.required);
    }

    // 验证字段类型
    if (this.schema.types) {
      validateFieldTypes(result, this.schema.types);
    }

    // 验证字段格式
    if (this.schema.formats) {
      validateFieldFormats(result, this.schema.formats);
    }

    // 验证枚举值
    if (this.schema.enums) {
      validateFieldEnums(result, this.schema.enums);
    }

    // 验证数字范围
    if (this.schema.ranges) {
      validateFieldRanges(result, this.schema.ranges);
    }

    // 设置默认值
    if (this.schema.defaults) {
      for (const [field, defaultValue] of Object.entries(this.schema.defaults)) {
        if (result[field] === undefined) {
          result[field] = defaultValue;
        }
      }
    }

    return result;
  }
}

module.exports = {
  validateRequiredFields,
  validateFieldTypes,
  validateFieldFormats,
  validateFieldEnums,
  validateFieldRanges,
  Validator
};