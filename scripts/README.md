# AET 快速安装脚本

## 说明

这些脚本已经将所有必要的函数内联到单个文件中，因此可以独立运行而无需其他依赖文件。

**重要变更**：
- skills 目录现在使用真实目录而不是符号链接
- 避免了循环链接问题

## 安装

### Linux / macOS

#### 使用 curl

```bash
curl -fsSL https://raw.atomgit.com/openeuler/agentic-engineering-team/raw/master/scripts/install.sh | bash
```

#### 使用 wget

```bash
wget -qO- https://raw.atomgit.com/openeuler/agentic-engineering-team/raw/master/scripts/install.sh | bash
```

#### 手动安装

```bash
chmod +x install.sh
./install.sh
```

### Windows

#### PowerShell

```powershell
# 一行安装（推荐）
iex (irm "https://raw.atomgit.com/openeuler/agentic-engineering-team/raw/master/scripts/install.ps1")

# 默认远程安装
powershell -ExecutionPolicy Bypass -File scripts\install.ps1

# 本地开发模式
powershell -ExecutionPolicy Bypass -File scripts\install.ps1 -Local
```

#### CMD

```cmd
:: 一行安装（curl + 执行，Windows 10+）
curl -fsSL https://raw.atomgit.com/openeuler/agentic-engineering-team/raw/master/scripts/install.cmd -o %TEMP%\install.cmd && %TEMP%\install.cmd

:: 一行安装（certutil + 执行，Win7+）
certutil -urlcache -split -f https://raw.atomgit.com/openeuler/agentic-engineering-team/raw/master/scripts/install.cmd %TEMP%\install.cmd >nul && %TEMP%\install.cmd

:: 默认远程安装
scripts\install.cmd

:: 本地开发模式
scripts\install.cmd /local
```

## 支持的平台

- Linux
- macOS
- Windows（原生 PowerShell 和 CMD 支持）
- Windows WSL

## 系统要求

### Linux / macOS

- Git
- curl 或 wget
- Bash

### Windows

- Git
- Node.js（含 npm）
- PowerShell 5.1+ 或 CMD

## 安装位置

默认安装到 `~/.config/opencode/aet`（Windows: `%USERPROFILE%\.config\opencode\aet`）

## 文件说明

| 文件 | 说明 |
|------|------|
| `install.sh` | Linux/macOS 安装脚本 |
| `install.ps1` | Windows PowerShell 安装脚本 |
| `install.cmd` | Windows CMD 安装脚本 |
| `init-global-config.sh` | Linux/macOS 全局配置初始化 |
| `init-global-config.ps1` | Windows PowerShell 全局配置初始化 |
| `init-global-config.cmd` | Windows CMD 全局配置初始化（自动调用 PowerShell，兜底简易模式） |
| `common.sh` | Linux/macOS 通用函数库 |
| `common.ps1` | Windows PowerShell 通用函数库 |
| `common.cmd` | Windows CMD 通用函数库 |
| `templates/` | 配置模板目录 |

## 故障排除

### 权限错误

如果遇到权限错误，请确保您有写入 `~/.config/opencode/` 的权限。

### 网络错误

如果下载失败，请检查网络连接或手动克隆仓库：

```bash
git clone https://atomgit.com/openeuler/agentic-engineering-team.git ~/.config/opencode/aet
```

### 符号链接错误

**Linux/macOS**：检查目标目录是否存在并具有写入权限。

**Windows**：创建符号链接需要管理员权限或启用开发人员模式。如果遇到错误，请以管理员身份运行终端，或在 Windows 设置中启用"开发人员模式"。

### PowerShell 执行策略

如果在 PowerShell 中遇到执行策略错误，请使用 `-ExecutionPolicy Bypass` 参数运行：

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```