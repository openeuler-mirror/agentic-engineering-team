# AET 安装指南

> 文档版本：v1.0 | 更新日期：2026-05-27 | 软件版本：v1.1.0

## 系统要求

### 硬件要求

- 内存：至少 4GB RAM（推荐 8GB+）
- 磁盘空间：至少 500MB 可用空间

### 操作系统

支持 macOS、Linux、Windows（通过 PowerShell 或 CMD）。

### 依赖软件

| 软件 | 版本要求 | 用途 |
| :--- | :--- | :--- |
| **Git** | 任意版本 | 版本管理和代码克隆 |
| **Node.js** | >= 14.0.0 | 运行 AET 插件 |
| **npm** | 随 Node.js 安装 | 管理项目依赖 |

验证依赖是否已安装：

```bash
git --version
node --version
npm --version
```

### 可选依赖

| 软件 | 版本要求 | 用途 |
| :--- | :--- | :--- |
| **Python 3.x** | >= 3.6 | graphifyy 知识图谱 |
| **gum** | 任意版本 | 增强交互式配置体验 |
| **graphifyy** | 最新版 | Python 知识图谱工具（项目分析） |

## 前置准备

### 安装 OpenCode

AET 以 OpenCode 插件形式运行，请先安装 OpenCode。详情请参考 OpenCode 官方文档。

### 平台 Token（可选）

如需使用 Issue 管理和 PR 管理功能，需要准备以下平台的访问令牌：

- GitHub Token
- GitLab Token
- Gitee / AtomGit / GitCode Token

Token 可在安装过程中交互式配置，也可稍后手动配置。

> **Note：** 若未配置 Token，以下功能将不可用：
> - `/aet-pr` - PR 管理功能
> - `/aet-issue` - Issue 管理功能

## 安装方法

### 方法一：一键安装（推荐）

#### Linux / macOS

```bash
curl -fsSL https://raw.atomgit.com/openeuler/agentic-engineering-team/raw/master/scripts/install.sh | bash
```

或使用 wget：

```bash
wget -qO- https://raw.atomgit.com/openeuler/agentic-engineering-team/raw/master/scripts/install.sh | bash
```

#### Windows PowerShell

```powershell
iex (irm "https://raw.atomgit.com/openeuler/agentic-engineering-team/raw/master/scripts/install.ps1")
```

#### Windows CMD

```cmd
curl -fsSL --ssl-no-revoke https://raw.atomgit.com/openeuler/agentic-engineering-team/raw/master/scripts/install.cmd -o %TEMP%\install.cmd && %TEMP%\install.cmd
```

安装脚本会自动完成以下操作：

1. 检查系统依赖（Git、Node.js、npm）
2. 从远程仓库克隆 AET 源代码到 `~/.config/opencode/aet`
3. 创建插件符号链接到 `~/.config/opencode/plugins/aet.js`
4. 复制 skills 到 `~/.config/opencode/skills/aet`
5. 创建命令符号链接到 `~/.config/opencode/commands/`
6. （可选）安装知识图谱工具 graphify
7. 交互式引导配置平台 Token

### 方法二：AI 助手安装

在 OpenCode 会话中直接用自然语言告诉 AI「帮我安装 AET」，AI 会自动执行方法一中的一键安装脚本完成安装。

### 方法三：源码安装（开发模式）

适合需要本地开发或调试的场景：

```bash
git clone https://atomgit.com/openeuler/agentic-engineering-team.git ~/.config/opencode/aet
mkdir -p ~/.config/opencode/plugins
ln -s ~/.config/opencode/aet/.opencode/plugins/aet.js ~/.config/opencode/plugins/aet.js
mkdir -p ~/.config/opencode/skills
ln -s ~/.config/opencode/aet/skills ~/.config/opencode/skills/aet
```

如果已经在 AET 项目目录下，可以直接运行本地安装脚本：

#### Linux / macOS

```bash
./scripts/install.sh --local
```

#### Windows PowerShell

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Local
```

#### Windows CMD

```cmd
scripts\install.cmd /local
```

`--local` / `-Local` / `/local` 模式使用符号链接而非复制，修改源码后无需重新安装。

## 初始化配置

### 全局配置

安装过程中会引导配置全局配置文件 `~/.aet/config.json`，包含：

- 多平台 Token 存储（GitCode/GitHub/GitLab）
- API 基础 URL
- 支持环境变量引用（如 `${GITHUB_TOKEN}`）

配置模板可参考 `scripts/templates/global-config-template.json`。

### 项目配置

进入项目目录后执行以下命令初始化项目配置：

```
/aet-init
```

配置向导会自动检测 Git 远程仓库信息，读取全局配置中的 Token，生成 `.aet/config.json`。

> **Tip：** 项目配置至少需要执行一次，否则依赖于平台 API 的命令不可用。

## 验证安装

安装完成后，通过以下方式验证：

```bash
# 检查插件目录
ls -la ~/.config/opencode/plugins/aet.js

# 检查 skills 目录
ls -la ~/.config/opencode/skills/aet

# 检查命令符号链接
ls -la ~/.config/opencode/commands/aet-*.md
```

验证通过后，在 OpenCode 中即可使用 AET 的所有命令。

## 升级

重新运行一键安装脚本会自动覆盖安装到最新版本：

```bash
curl -fsSL https://raw.atomgit.com/openeuler/agentic-engineering-team/raw/master/scripts/install.sh | bash
```

> **Note：** 升级不会影响已有的全局配置 `~/.aet/config.json` 和项目配置 `.aet/config.json`。

## 卸载

如需卸载 AET：

```bash
# 删除 AET 目录
rm -rf ~/.config/opencode/aet

# 删除插件符号链接
rm -f ~/.config/opencode/plugins/aet.js

# 删除 skills 目录
rm -rf ~/.config/opencode/skills/aet

# 删除命令符号链接
rm -f ~/.config/opencode/commands/aet-*.md
```

> **Warning：** 卸载不会删除全局配置 `~/.aet/config.json`，如需清理请手动删除。
