/**
 * API类型定义
 */

/**
 * Issue对象
 * @typedef {Object} Issue
 * @property {number} id - Issue ID
 * @property {number} number - Issue编号
 * @property {string} title - 标题
 * @property {string} body - 内容
 * @property {string} state - 状态 (open/closed)
 * @property {string} created_at - 创建时间
 * @property {string} updated_at - 更新时间
 * @property {string} closed_at - 关闭时间
 * @property {Array<string>} labels - 标签
 * @property {Array<string>} assignees - 指派人
 * @property {Object} user - 创建用户
 * @property {Object} repository - 仓库信息
 */

/**
 * Issue创建参数
 * @typedef {Object} IssueCreateParams
 * @property {string} [repo] - 仓库名
 * @property {string} title - 标题
 * @property {string} body - 内容
 * @property {string} [assignee] - 指派人
 * @property {number} [milestone] - 里程碑ID
 * @property {string} [labels] - 标签（逗号分隔）
 * @property {string} [security_hole] - 安全漏洞标记
 * @property {string} [template_path] - 模板路径
 * @property {string} [issue_type] - Issue类型
 * @property {string} [issue_severity] - 严重程度
 * @property {Array<{field_name: string, field_values: string[]}>} [custom_fields] - 自定义字段
 */

/**
 * Issue更新参数
 * @typedef {Object} IssueUpdateParams
 * @property {string} [title] - 标题
 * @property {string} [body] - 内容
 * @property {string} [state] - 状态 (open/closed)
 * @property {Array<string>} [labels] - 标签
 * @property {Array<string>} [assignees] - 指派人
 * @property {string} [milestone] - 里程碑
 */

/**
 * PR对象
 * @typedef {Object} PullRequest
 * @property {number} id - PR ID
 * @property {number} number - PR编号
 * @property {string} title - 标题
 * @property {string} body - 内容
 * @property {string} state - 状态 (open/closed/merged)
 * @property {string} created_at - 创建时间
 * @property {string} updated_at - 更新时间
 * @property {string} closed_at - 关闭时间
 * @property {string} merged_at - 合并时间
 * @property {string} head - 源分支
 * @property {string} base - 目标分支
 * @property {Array<string>} labels - 标签
 * @property {Array<string>} assignees - 指派人
 * @property {Object} user - 创建用户
 */

/**
 * PR创建参数
 * @typedef {Object} PullRequestCreateParams
 * @property {string} title - 标题
 * @property {string} body - 内容
 * @property {string} head - 源分支
 * @property {string} base - 目标分支
 * @property {boolean} [draft] - 是否为草稿
 * @property {Array<string>} [labels] - 标签
 * @property {Array<string>} [assignees] - 指派人
 * @property {string} [milestone] - 里程碑
 */

/**
 * PR更新参数
 * @typedef {Object} PullRequestUpdateParams
 * @property {string} [title] - 标题
 * @property {string} [body] - 内容
 * @property {string} [state] - 状态 (open/closed)
 * @property {string} [base] - 目标分支
 * @property {Array<string>} [labels] - 标签
 * @property {Array<string>} [assignees] - 指派人
 * @property {string} [milestone] - 里程碑
 */

/**
 * 用户对象
 * @typedef {Object} User
 * @property {number} id - 用户ID
 * @property {string} login - 用户名
 * @property {string} name - 姓名
 * @property {string} email - 邮箱
 * @property {string} avatar_url - 头像URL
 */

/**
 * 仓库对象
 * @typedef {Object} Repository
 * @property {number} id - 仓库ID
 * @property {string} name - 仓库名
 * @property {string} full_name - 完整仓库名
 * @property {string} description - 描述
 * @property {boolean} private - 是否为私有仓库
 * @property {string} html_url - HTML URL
 * @property {string} clone_url - 克隆URL
 * @property {string} default_branch - 默认分支
 */

/**
 * API响应包装器
 * @typedef {Object} ApiResponse
 * @property {boolean} success - 是否成功
 * @property {any} data - 响应数据
 * @property {string} [message] - 响应消息
 * @property {Object} [metadata] - 元数据
 * @property {Error} [error] - 错误信息
 */

/**
 * 分页参数
 * @typedef {Object} PaginationParams
 * @property {number} [page] - 页码
 * @property {number} [per_page] - 每页数量
 * @property {string} [sort] - 排序字段
 * @property {string} [direction] - 排序方向 (asc/desc)
 */

/**
 * 分页结果
 * @typedef {Object} PaginatedResult
 * @property {Array<any>} items - 数据项
 * @property {number} total - 总数
 * @property {number} page - 当前页码
 * @property {number} per_page - 每页数量
 * @property {number} total_pages - 总页数
 */

module.exports = {
  // 导出类型定义供JSDoc使用
};
