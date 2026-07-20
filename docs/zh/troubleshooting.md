# 故障排查

> 文档版本：v1.0 | 更新日期：2026-05-27 | 软件版本：v1.1.0

## 诊断工作流

遇到问题时，建议按以下步骤系统排查：

1. **检查安装状态**：确认 AET 插件和依赖正确安装
2. **检查配置文件**：确认 `.aet/config.json` 配置正确
3. **检查网络连接**：确认能够访问代码仓库平台
4. **查看错误信息**：分析 AET 返回的具体错误描述
5. **查看日志**：收集详细日志信息用于定位问题

## 常见问题与解决方案

### 安装问题

#### 安装失败：未找到 git

**原因：** 系统未安装 Git。

**解决方案：**

```bash
# macOS
brew install git

# Ubuntu/Debian
sudo apt-get install git

# Windows
# 下载安装 https://gitforwindows.org/
```

#### 安装失败：未找到 Node.js

**原因：** 系统未安装 Node.js 或版本低于 14.0.0。

**解决方案：** 从 [nodejs.org](https://nodejs.org/) 下载安装 Node.js >= 14.0.0。

#### 安装失败：npm 依赖安装失败

**原因：** 网络问题导致 npm 包下载失败。

**解决方案：**

```bash
# 清理缓存后重试
cd ~/.config/opencode/aet
npm cache clean --force
npm install
```

### 配置问题

#### 初始化失败：无法检测到 Git 仓库

**原因：** 当前目录不是 Git 仓库。

**解决方案：** 确保在 Git 项目目录中运行 `/aet-init`。

#### 令牌配置错误

**原因：** `.aet/config.json` 中的平台 Token 无效或权限不足。

**解决方案：**

1. 检查 Token 是否正确
2. 确认 Token 具有足够的权限范围
3. 重新执行 `/aet-init` 更新配置

### 使用问题

#### 命令无响应

**原因：** 可能由以下原因导致：

1. AET 未正确安装
2. 当前目录没有 `.aet/config.json`
3. OpenCode 未重新加载配置

**解决方案：**

```bash
# 检查安装状态
ls -la ~/.config/opencode/plugins/aet.js
ls -la ~/.config/opencode/skills/aet

# 检查项目配置
ls -la .aet/config.json
```

#### Issue 已被认领

**错误信息：** "This issue has already been claimed"

**原因：** 其他开发者已认领该 Issue。

**解决方案：** 选择其他未认领的 Issue。

#### 功能验证失败

**原因：** 实现的功能未通过验证检查。

**解决方案：**

- 检查验证报告中的具体失败项
- 根据失败原因修改代码
- 重新运行工作流

#### PR 提交失败

**原因：** 平台 Token 权限不足或分支冲突。

**解决方案：**

1. 确认 Token 具有提交 PR 的权限
2. 检查是否有未解决的冲突
3. 尝试手动解决冲突后重试

### 工作流问题

#### 长程任务中断

**原因：** AI 上下文超限、网络中断或其他意外情况。

**解决方案：**

AET 支持断点恢复，重新运行相同的命令即可：

```bash
/aet-auto https://atomgit.com/owner/repo/issues/123
```

AET 会自动检测已存在的 Checkpoint，询问继续或重新开始。

#### Agent 行为异常

**原因：** Agent 上下文丢失或指令理解偏差。

**解决方案：**

1. 检查当前阶段的输出文档是否完整
2. 使用 `confirm` 确认点重新评审
3. 如必要，选择"需要修改"让 Agent 重新执行

## 错误信息与含义

| 错误信息 | 含义 | 解决方案 |
| :--- | :--- | :--- |
| `未找到 git` | 系统缺少 Git | 安装 Git |
| `未找到 Node.js` | Node.js 未安装 | 安装 Node.js >= 14 |
| `npm 依赖安装失败` | 网络或 npm 问题 | 清理缓存后重试 |
| `This issue has already been claimed` | Issue 已被认领 | 选择其他 Issue |
| `令牌配置错误` | Token 无效或权限不足 | 重新配置 Token |
| `无法访问平台 API` | 网络问题或 API 地址错误 | 检查网络和 API 配置 |
| `Checkpoint 不存在` | 中断的任务已过期 | 重新开始任务 |

## 日志收集

### 收集诊断信息

如需向开发团队报告问题，请收集以下信息：

```bash
# 安装状态
ls -la ~/.config/opencode/plugins/aet.js
ls -la ~/.config/opencode/skills/aet

# Node.js 版本
node --version

# 项目配置状态（注意隐去 Token）
cat .aet/config.json

# OpenCode 版本
opencode --version
```

### 启用详细日志

在 OpenCode 配置中启用详细日志模式可以获取更多调试信息。

## 获取帮助

### 官方资源

- **Issue 追踪**：在代码仓库提交 Issue
- **文档导航**：参考本文档集中的其他文档
  - [架构设计](./architecture.md) — 了解 AET 整体架构
  - [安装指南](./installation.md) — 重新安装和配置
  - [命令参考](./commands.md) — 确认命令使用方式

### 信息收集模板

报告问题时请提供：

1. AET 版本号
2. 使用的命令和完整参数
3. 完整的错误信息（文本）
4. 配置诊断信息（隐去敏感信息）
5. 复现步骤
