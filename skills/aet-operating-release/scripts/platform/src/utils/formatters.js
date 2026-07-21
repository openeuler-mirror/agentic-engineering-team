function formatApiResponse(response) {
  if (!response) {
    return null;
  }

  const status = response.status;
  if (status < 200 || status >= 300) {
    let errorMessage = `HTTP Error ${status}`;
    if (response.data) {
      if (response.data.error_message) {
        errorMessage = response.data.error_message;
      } else if (response.data.message) {
        errorMessage = response.data.message;
      }
    }
    const error = new Error(errorMessage);
    error.response = response;
    error.status = status;
    throw error;
  }

  if (!response.data) {
    return null;
  }

  const data = response.data;

  if (typeof data === 'object' && data !== null) {
    return data;
  }

  if (Array.isArray(data)) {
    return data;
  }

  return data;
}

function formatError(error) {
  if (!error) {
    return { message: '未知错误' };
  }

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

  if (error.request) {
    return {
      message: '网络请求失败',
      code: error.code,
      originalError: error.message
    };
  }

  if (error.name && error.name.endsWith('Error')) {
    return {
      message: error.message,
      name: error.name,
      metadata: error.metadata || {}
    };
  }

  return {
    message: error.message || '未知错误',
    stack: error.stack
  };
}

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
    .slice(0, 10)
    .map(([key, value]) => `${key}: ${formatObject(value, depth - 1)}`);

  const suffix = Object.keys(obj).length > 10 ? `, ...(${Object.keys(obj).length - 10} more)` : '';
  return `{${entries.join(', ')}${suffix}}`;
}

function formatMarkdown(text, options = {}) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  let result = text;

  if (options.autoLink !== false) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    result = result.replace(urlRegex, '<$1>');
  }

  if (options.cleanWhitespace !== false) {
    result = result.replace(/\n\s*\n\s*\n/g, '\n\n');
  }

  return result;
}

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