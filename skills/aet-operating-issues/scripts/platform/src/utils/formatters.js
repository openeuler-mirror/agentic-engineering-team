/**
 * 数据格式化工具
 */

/**
 * 格式化API响应数据
 * @param {Object} response - axios响应对象
 * @returns {Object} 格式化后的数据
 */
function formatApiResponse(response) {
  if (!response) {
    return null;
  }

  // 检查HTTP状态码，如果不是2xx，抛出错误
  const status = response.status;
  if (status < 200 || status >= 300) {
    // 尝试从API响应中获取详细错误信息
    let errorMessage = `HTTP Error ${status}`;
    if (response.data) {
      if (response.data.error_message) {
        errorMessage = response.data.error_message;
      } else if (response.data.message) {
        errorMessage = response.data.message;
      }
    }
    // 创建错误对象，模拟axios错误结构
    const error = new Error(errorMessage);
    error.response = response;
    error.status = status;
    throw error;
  }

  if (!response.data) {
    return null;
  }

  // GitCode API通常返回数据在data字段中
  const data = response.data;

  // 如果data已经是对象，直接返回
  if (typeof data === 'object' && data !== null) {
    return data;
  }

  // 如果是数组，返回数组
  if (Array.isArray(data)) {
    return data;
  }

  // 其他情况返回原始数据
  return data;
}

/**
 * 格式化错误信息
 * @param {Error} error - 错误对象
 * @returns {Object} 格式化后的错误信息
 */
function formatError(error) {
  if (!error) {
    return { message: '未知错误' };
  }

  // 如果是axios错误
  if (error.response) {
    const { status, data, headers } = error.response;
    return {
      message: `API请求失败: ${status}`,
      status,
      data,
      headers,
      originalError: error.message
    };
  }

  // 如果是请求错误（网络错误等）
  if (error.request) {
    return {
      message: '网络请求失败',
      code: error.code,
      originalError: error.message
    };
  }

  // 自定义错误
  if (error.name && error.name.endsWith('Error')) {
    return {
      message: error.message,
      name: error.name,
      metadata: error.metadata || {}
    };
  }

  // 普通错误
  return {
    message: error.message || '未知错误',
    stack: error.stack
  };
}

/**
 * 格式化日期时间
 * @param {Date|string|number} date - 日期
 * @param {string} [format='iso'] - 格式: 'iso', 'local', 'timestamp'
 * @returns {string} 格式化后的日期字符串
 */
function formatDate(date, format = 'iso') {
  if (!date) {
    return '';
  }

  const d = date instanceof Date ? date : new Date(date);

  if (isNaN(d.getTime())) {
    return '无效日期';
  }

  switch (format) {
    case 'iso':
      return d.toISOString();
    case 'local':
      return d.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    case 'timestamp':
      return d.getTime().toString();
    case 'date':
      return d.toLocaleDateString('zh-CN');
    case 'time':
      return d.toLocaleTimeString('zh-CN');
    default:
      return d.toISOString();
  }
}

/**
 * 格式化JSON字符串，处理可能的解析错误
 * @param {string} jsonString - JSON字符串
 * @param {any} [defaultValue=null] - 解析失败时的默认值
 * @returns {any} 解析后的对象或默认值
 */
function safeJsonParse(jsonString, defaultValue = null) {
  if (!jsonString || typeof jsonString !== 'string') {
    return defaultValue;
  }

  try {
    return JSON.parse(jsonString);
  } catch (error) {
    return defaultValue;
  }
}

/**
 * 格式化对象为字符串，用于日志或显示
 * @param {any} obj - 需要格式化的对象
 * @param {number} [depth=2] - 递归深度
 * @returns {string} 格式化后的字符串
 */
function formatObject(obj, depth = 2) {
  if (obj === null || obj === undefined) {
    return String(obj);
  }

  if (typeof obj !== 'object') {
    return String(obj);
  }

  if (obj instanceof Error) {
    return formatError(obj).message;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]';
    if (depth <= 0) return `[Array(${obj.length})]`;

    const items = obj.slice(0, 5).map(item => formatObject(item, depth - 1));
    const suffix = obj.length > 5 ? `, ...(${obj.length - 5} more)` : '';
    return `[${items.join(', ')}${suffix}]`;
  }

  if (depth <= 0) {
    return '{...}';
  }

  const entries = Object.entries(obj)
    .slice(0, 10) // 限制显示条目
    .map(([key, value]) => `${key}: ${formatObject(value, depth - 1)}`);

  const suffix = Object.keys(obj).length > 10 ? `, ...(${Object.keys(obj).length - 10} more)` : '';
  return `{${entries.join(', ')}${suffix}}`;
}

/**
 * 格式化Markdown文本，用于issue/PR描述
 * @param {string} text - 原始文本
 * @param {Object} [options={}] - 格式化选项
 * @returns {string} 格式化后的Markdown
 */
function formatMarkdown(text, options = {}) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  let result = text;

  // 自动转换URL为链接
  if (options.autoLink !== false) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    result = result.replace(urlRegex, '<$1>');
  }

  // 清理多余的空行
  if (options.cleanWhitespace !== false) {
    result = result.replace(/\n\s*\n\s*\n/g, '\n\n');
  }

  return result;
}

/**
 * 截断字符串
 * @param {string} str - 原始字符串
 * @param {number} maxLength - 最大长度
 * @param {string} [suffix='...'] - 截断后缀
 * @returns {string} 截断后的字符串
 */
function truncate(str, maxLength, suffix = '...') {
  if (typeof str !== 'string' || str.length <= maxLength) {
    return str || '';
  }

  if (maxLength <= suffix.length) {
    return suffix;
  }

  return str.substring(0, maxLength - suffix.length) + suffix;
}

module.exports = {
  formatApiResponse,
  formatError,
  formatDate,
  safeJsonParse,
  formatObject,
  formatMarkdown,
  truncate
};