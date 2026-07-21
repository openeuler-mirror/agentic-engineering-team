const { Validator } = require('../utils/validator');
const { ConfigValidationError } = require('../errors/config-errors');
const schemas = require('./schemas');

class ConfigValidator {
  static validateConfig(config) {
    try {
      const flatConfig = this._extractFlatConfig(config);
      const validator = new Validator(schemas.GITCODE_API_SCHEMA);
      return validator.validate(flatConfig);
    } catch (error) {
      throw new ConfigValidationError([error.message]);
    }
  }

  static validateCliConfig(config) {
    try {
      const validator = new Validator(schemas.CLI_CONFIG_SCHEMA);
      return validator.validate(config);
    } catch (error) {
      throw new ConfigValidationError([error.message]);
    }
  }

  static validateReleaseCreateConfig(data) {
    try {
      const validator = new Validator(schemas.RELEASE_CREATE_SCHEMA);
      return validator.validate(data);
    } catch (error) {
      throw new ConfigValidationError([error.message]);
    }
  }

  static validateReleaseUpdateConfig(data) {
    try {
      const validator = new Validator(schemas.RELEASE_UPDATE_SCHEMA);
      return validator.validate(data);
    } catch (error) {
      throw new ConfigValidationError([error.message]);
    }
  }

  static _extractFlatConfig(config) {
    if (!config || typeof config !== 'object') {
      return {};
    }
    return config;
  }

  static mergeAndValidateConfigs(...configs) {
    const merged = configs.reduce((result, config) => {
      if (!config || typeof config !== 'object') {
        return result;
      }

      for (const [key, value] of Object.entries(config)) {
        if (value !== undefined && value !== null) {
          if (typeof value === 'object' && !Array.isArray(value) &&
              result[key] && typeof result[key] === 'object') {
            result[key] = { ...result[key], ...value };
          } else {
            result[key] = value;
          }
        }
      }

      return result;
    }, {});

    const flatConfig = this._extractFlatConfig(merged);
    const validated = this.validateConfig(flatConfig);
    
    return merged;
  }

  static isConfigComplete(config) {
    if (!config || typeof config !== 'object') {
      return false;
    }

    const flatConfig = this._extractFlatConfig(config);
    const required = schemas.GITCODE_API_SCHEMA.required || [];
    return required.every(field => {
      const value = flatConfig[field];
      return value !== undefined && value !== null && value !== '';
    });
  }

  static getMissingFields(config) {
    if (!config || typeof config !== 'object') {
      return schemas.GITCODE_API_SCHEMA.required || [];
    }

    const flatConfig = this._extractFlatConfig(config);
    const required = schemas.GITCODE_API_SCHEMA.required || [];
    return required.filter(field => {
      const value = flatConfig[field];
      return value === undefined || value === null || value === '';
    });
  }
}

module.exports = ConfigValidator;