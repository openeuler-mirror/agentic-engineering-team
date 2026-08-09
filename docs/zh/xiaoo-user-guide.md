# AET xiaoO 用户使用手册

## 1. 前置条件

- xiaoO 已安装（`xiaoo-daemon` 命令可用）

## 2. 安装

在 AET 源码目录下执行安装脚本：

```bash
curl -fsSL https://raw.atomgit.com/openeuler/agentic-engineering-team/raw/master/scripts/install.sh | bash
```

安装时会提示平台选择，选择平台时输入 **2**（xiaoO）：

```
请选择安装平台：
  1) opencode  - 安装到 ~/.config/opencode/
  2) xiaoO     - 安装到 ~/.xiaoo/

请输入选项 (1 或 2，默认 1): 2
```

安装脚本会依次完成：

1. 创建符号链接 `~/.xiaoo/aet` → AET 源码目录
2. 注册 Hooker 插件到 `~/.config/xiaoo/config.toml`
3. 链接命令文件（9 个）到 `~/.xiaoo/commands/`
4. 链接工具文件（12 个）到 `~/.xiaoo/tools/`
5. 链接 xiaoO 专用 JS 文件（3 个）
6. 链接 Skills（42 个）到 `~/.xiaoo/skills/`
7. **配置项目目录**（输入你的项目工作目录路径）
8. 初始化全局配置（`~/.aet/config.json`，含平台 Token 等）
9. 启动 xiaoO daemon

### 设置项目目录

安装过程中会提示：

```
请设置项目目录：
```

输入你要使用 AET 的项目根目录绝对路径，例如：

```
/Users/yangwei/Desktop/job/my-project
```

该目录是AET项目目录。

## 3. 启动与连接

### 3.1 启动 xiaoO TUI

```bash
xiaoo
```

### 3.2 设置远程模式

进入 TUI 后，连接到 daemon：

```
/remote http://127.0.0.1:18080
```

连接成功后会显示：

```
Remote connected: http://127.0.0.1:18080
```

> 此步骤每次启动 xiaoO TUI 都需要执行，除非 xiaoO 配置了自动连接。

## 4. 使用 AET 命令

xiaoO 中 AET 命令以 `/aet-` 开头，在 TUI 中直接输入即可。

### 4.1 命令列表

| 命令                    | 说明                                   |
| --------------------- | ------------------------------------ |
| `/aet-auto <描述>`      | 智能路由，根据意图自动选择工作流（feature/bugfix/分析等） |
| `/aet-init`           | 初始化项目配置（创建 `.aet/config.json`）       |
| `/aet-design <描述>`    | 进入设计阶段（需求分析 + 架构设计）                  |
| `/aet-implement <描述>` | 进入实现阶段（开发计划 + 编码 + 验证）               |

### 4.2 使用示例

```
/aet-auto 帮我用feature工作流实现一个hello world系统
/aet-design 帮我设计一个用户认证模块
/aet-implement 实现登录接口
```

