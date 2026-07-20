# Release {{version}}

> {{summary}}

## 发布概述

{{overview}}

本次版本主要包含以下方面的更新：
{{#highlights}}
- {{.}}
{{/highlights}}

## 🆕 新增功能

{{#features}}
### {{number}}、{{title}} {{#issue}}#{{issue}}{{/issue}}

{{description}}

{{#image}}
![{{title}}](../assets/{{image}})
{{/image}}
{{/features}}

## 🆙 功能优化

{{#improvements}}
### {{number}}、{{title}}

{{description}}
{{/improvements}}

## 🐛 Bug 修复

{{#fixes}}
- {{number}}、{{description}}
{{/fixes}}

## 📚 文档更新

{{#docs}}
- {{.}}
{{/docs}}

## 👥 贡献者

感谢以下贡献者对本版本的贡献：
{{#contributors}}
- @{{name}} ({{commits}} commits)
{{/contributors}}

---

**完整变更日志**: {{compare_url}}
**查阅全文**: {{wiki_url}}