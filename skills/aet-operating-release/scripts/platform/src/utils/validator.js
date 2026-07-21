const { ValidationError, FieldFormatError, FieldTypeError, RequiredFieldError } = require('../errors/validation-errors');

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

function validateFieldTypes(data, typeRules) {
  if (!data || typeof data !== 'object') {
    throw new ValidationError('数据必须是对象');
  }

  for (const [field, expectedType] of Object.entries(typeRules)) {
    const value = data[field];

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

function validateFieldFormats(data, formatRules) {
  if (!data || typeof data !== 'object') {
    throw new ValidationError('数据必须是对象');
  }

  for (const [field, regex] of Object.entries(formatRules)) {
    const value = data[field];

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

function validateFieldEnums(data, enumRules) {
  if (!data || typeof data !== 'object') {
    throw new ValidationError('数据必须是对象');
  }

  for (const [field, allowedValues] of Object.entries(enumRules)) {
    const value = data[field];

    if (value === undefined || value === null) {
      continue;
    }

    if (!allowedValues.includes(value)) {
      throw new ValidationError(`字段 ${field} 的值必须是: ${allowedValues.join(', ')}`);
    }
  }
}

function validateFieldRanges(data, rangeRules) {
  if (!data || typeof data !== 'object') {
    throw new ValidationError('数据必须是对象');
  }

  for (const [field, range] of Object.entries(rangeRules)) {
    const value = data[field];

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

class Validator {
  constructor(schema = {}) {
    this.schema = schema;
  }

  validate(data) {
    const result = { ...data };

    if (this.schema.required) {
      validateRequiredFields(result, this.schema.required);
    }

    if (this.schema.types) {
      validateFieldTypes(result, this.schema.types);
    }

    if (this.schema.formats) {
      validateFieldFormats(result, this.schema.formats);
    }

    if (this.schema.enums) {
      validateFieldEnums(result, this.schema.enums);
    }

    if (this.schema.ranges) {
      validateFieldRanges(result, this.schema.ranges);
    }

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