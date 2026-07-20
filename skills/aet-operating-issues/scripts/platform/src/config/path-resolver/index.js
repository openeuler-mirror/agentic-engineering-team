/**
 * 配置路径解析器模块
 * 导出所有配置路径解析相关的组件
 */

// 主解析器
const ConfigPathResolver = require('./config-path-resolver');

// 搜索策略基类和具体策略
const SearchStrategy = require('./search-strategy');
const UpwardSearchStrategy = require('./strategies/upward-search-strategy');
const HomeDirectoryStrategy = require('./strategies/home-directory-strategy');
const EnvVarStrategy = require('./strategies/env-var-strategy');
const CustomPathStrategy = require('./strategies/custom-path-strategy');
const FixedPathStrategy = require('./strategies/fixed-path-strategy');

// 缓存
const ConfigCache = require('./config-cache');

// 错误类型
const {
  ConfigSearchError,
  PermissionError,
  ConfigNotFoundError,
  ConfigParseError,
  SearchStrategyError,
  CacheError
} = require('./config-path-error');

module.exports = {
  // 主解析器
  ConfigPathResolver,
  
  // 搜索策略
  SearchStrategy,
  UpwardSearchStrategy,
  HomeDirectoryStrategy,
  EnvVarStrategy,
  CustomPathStrategy,
  FixedPathStrategy,
  
  // 缓存
  ConfigCache,
  
  // 错误类型
  ConfigSearchError,
  PermissionError,
  ConfigNotFoundError,
  ConfigParseError,
  SearchStrategyError,
  CacheError,
  
  // 工具函数
  createDefaultResolver(options = {}) {
    return new ConfigPathResolver(options);
  },
  
  createEnvironmentAwareResolver(options = {}) {
    return new ConfigPathResolver({
      ...options,
      strategies: ConfigPathResolver.prototype.getDefaultStrategies(options)
    });
  }
};