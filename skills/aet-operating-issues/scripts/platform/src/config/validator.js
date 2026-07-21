/**
 * 配置验证器
 */

const { Validator } = require('../utils/validator');
const { ConfigValidationError } = require('../errors/config-errors');
const schemas = require('./schemas');

/**
 * 配置验证器
 */
class ConfigValidator {
  /**
   * 验证GitCode API配置
   * @param {Object} config - 待验证的配置
   * @returns {Object} 验证后的配置
   * @throws {ConfigValidationError}
   */
  static validateGitCodeApiConfig(config) {
    try {
      // 提取扁平化配置进行验证
      const flatConfig = this._extractFlatConfig(config);
      const validator = new Validator(schemas.GITCODE_API_SCHEMA);
      return validator.validate(flatConfig);
    } catch (error) {
      throw new ConfigValidationError([error.message]);
    }
  }

  /**
   * 验证项目配置（.aet/config.json）
   * @param {Object} config - 待验证的配置
   * @returns {Object} 验证后的配置
   * @throws {ConfigValidationError}
   */
  static validateProjectConfig(config) {
    try {
      const validator = new Validator(schemas.PROJECT_CONFIG_SCHEMA);
      return validator.validate(config);
    } catch (error) {
      throw new ConfigValidationError([error.message]);
    }
  }

  /**
   * 验证CLI配置
   * @param {Object} config - 待验证的配置
   * @returns {Object} 验证后的配置
   * @throws {ConfigValidationError}
   */
  static validateCliConfig(config) {
    try {
      const validator = new Validator(schemas.CLI_CONFIG_SCHEMA);
      return validator.validate(config);
    } catch (error) {
      throw new ConfigValidationError([error.message]);
    }
  }

  /**
   * 验证Issue创建配置
   * @param {Object} config - 待验证的配置
   * @returns {Object} 验证后的配置
   * @throws {ConfigValidationError}
   */
  static validateIssueCreateConfig(config) {
    try {
      const validator = new Validator(schemas.ISSUE_CREATE_SCHEMA);
      return validator.validate(config);
    } catch (error) {
      throw new ConfigValidationError([error.message]);
    }
  }

  /**
   * 验证PR创建配置
   * @param {Object} config - 待验证的配置
   * @returns {Object} 验证后的配置
   * @throws {ConfigValidationError}
   */
  static validatePrCreateConfig(config) {
    try {
      const validator = new Validator(schemas.PR_CREATE_SCHEMA);
      return validator.validate(config);
    } catch (error) {
      throw new ConfigValidationError([error.message]);
    }
  }

  /**
   * 从嵌套配置中提取扁平化配置
   * @param {Object} config - 原始配置
   * @returns {Object} 扁平化配置
   * @private
   */
  static _extractFlatConfig(config) {
    if (!config || typeof config !== 'object') {
      return {};
    }

    // ConfigManager已经将嵌套配置提取为扁平格式
    // 所以这里直接返回配置即可
    return config;
  }

  /**
   * 合并并验证配置
   * @param {Object[]} configs - 多个配置对象
   * @returns {Object} 合并后的配置
   * @throws {ConfigValidationError}
   */
  static mergeAndValidateConfigs(...configs) {
    // 深度合并配置
    const merged = configs.reduce((result, config) => {
      if (!config || typeof config !== 'object') {
        return result;
      }

      for (const [key, value] of Object.entries(config)) {
        if (value !== undefined && value !== null) {
          // 如果是对象且result中已存在，进行深度合并
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

    // 提取扁平化配置用于验证
    const flatConfig = this._extractFlatConfig(merged);
    
    // 验证最终配置
    const validated = this.validateGitCodeApiConfig(flatConfig);
    
    // 返回原始合并配置（保持嵌套结构）
    return merged;
  }

  /**
   * 检查配置是否完整
   * @param {Object} config - 待检查的配置
   * @returns {boolean}
   */
  static isConfigComplete(config) {
    if (!config || typeof config !== 'object') {
      return false;
    }

    // 提取扁平化配置进行检查
    const flatConfig = this._extractFlatConfig(config);
    const required = schemas.GITCODE_API_SCHEMA.required || [];
    return required.every(field => {
      const value = flatConfig[field];
      return value !== undefined && value !== null && value !== '';
    });
  }

  /**
   * 获取配置缺失字段
   * @param {Object} config - 待检查的配置
   * @returns {string[]}
   */
  static getMissingFields(config) {
    if (!config || typeof config !== 'object') {
      return schemas.GITCODE_API_SCHEMA.required || [];
    }

    // 提取扁平化配置进行检查
    const flatConfig = this._extractFlatConfig(config);
    const required = schemas.GITCODE_API_SCHEMA.required || [];
    return required.filter(field => {
      const value = flatConfig[field];
      return value === undefined || value === null || value === '';
    });
  }
}

module.exports = ConfigValidator;