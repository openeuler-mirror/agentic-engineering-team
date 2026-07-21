/**
 * 配置模块入口
 */

const ConfigManager = require('./manager');
const ConfigValidator = require('./validator');
const schemas = require('./schemas');

module.exports = {
  ConfigManager,
  ConfigValidator,
  schemas
};