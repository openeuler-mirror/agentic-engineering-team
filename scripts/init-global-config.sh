#!/bin/bash

# AET 全局配置初始化脚本
# 创建 ~/.aet/config.json（全局配置，包含 Token，永不覆盖）
# 创建 ~/.aet/templates/workflow.json（工作流模板，可覆盖更新）

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 存储各平台 Token（使用普通变量，兼容 bash 3.x）
GITCODE_TOKEN=""
GITHUB_TOKEN=""
GITLAB_TOKEN=""
TOKEN_PROVIDED=false  # 标记是否通过参数提供了 token
TRACE_ENABLED=""  # 空字符串表示未选择，将使用默认值 true

# 检查 gum 是否安装
check_gum() {
    if ! command -v gum >/dev/null 2>&1; then
        echo ""
        echo -e "${YELLOW}[提示]${NC} 推荐安装 gum 以获得更好的交互体验："
        echo ""
        echo "  macOS: brew install gum"
        echo "  Linux: 请访问 https://github.com/charmbracelet/gum"
        echo ""
        USE_GUM=false
    else
        USE_GUM=true
    fi
}

# 检测是否在管道模式下运行（stdin 不是 tty）
check_pipe_mode() {
    if [ ! -t 0 ]; then
        IS_PIPE_MODE=true
    else
        IS_PIPE_MODE=false
    fi
}

# 安全读取用户输入（管道模式下从 /dev/tty 读取）
safe_read() {
    local prompt="$1"
    local var_name="$2"

    if [ "$IS_PIPE_MODE" = true ]; then
        # 管道模式：从 /dev/tty 读取
        echo -n "$prompt"
        read "$var_name" < /dev/tty
    else
        # 正常模式：从 stdin 读取
        read -p "$prompt" "$var_name"
    fi
}

# 日志函数
log_info() {
    if [ "$USE_GUM" = true ]; then
        gum style --foreground 4 "ℹ $1"
    else
        echo -e "${BLUE}[INFO]${NC} $1"
    fi
}

log_success() {
    if [ "$USE_GUM" = true ]; then
        gum style --foreground 2 "✔ $1"
    else
        echo -e "${GREEN}[SUCCESS]${NC} $1"
    fi
}

log_warning() {
    if [ "$USE_GUM" = true ]; then
        gum style --foreground 3 "⚠ $1"
    else
        echo -e "${YELLOW}[WARNING]${NC} $1"
    fi
}

log_error() {
    if [ "$USE_GUM" = true ]; then
        gum style --foreground 1 "✗ $1"
    else
        echo -e "${RED}[ERROR]${NC} $1"
    fi
}

# 获取脚本所在目录（AET 项目根目录）
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AET_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# 全局配置目录和文件路径
GLOBAL_CONFIG_DIR="$HOME/.aet"
GLOBAL_CONFIG_FILE="$GLOBAL_CONFIG_DIR/config.json"
TEMPLATES_DIR="$GLOBAL_CONFIG_DIR/templates"
WORKFLOW_TEMPLATE_FILE="$TEMPLATES_DIR/workflow.json"

# 编程语言规范基线目录(implement domain,aet 层 = install seed,可覆盖更新)
STANDARDS_DEST_DIR="$GLOBAL_CONFIG_DIR/implement/aet/language-standards"

# 模板源文件
GLOBAL_CONFIG_TEMPLATE="$AET_DIR/scripts/templates/global-config-template.json"
WORKFLOW_TEMPLATE_SOURCE="$AET_DIR/scripts/templates/workflow-template.json"
STANDARDS_SOURCE_DIR="$AET_DIR/scripts/templates/language-standards"

# 显示帮助信息
show_help() {
    echo "AET 全局配置初始化脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  --skip-token            跳过所有 Token 配置"
    echo "  --token VALUE           配置指定平台的 Token（需配合 --platform）"
    echo "  --platform TYPE         设置平台类型（gitcode/github/gitlab，默认：gitcode）"
    echo "  --force                 强制重新配置（跳过存在确认询问）"
    echo "  -h, --help              显示帮助信息"
    echo ""
    echo "支持的平台:"
    echo "  gitcode  - AtomGit/GitCode"
    echo "  github   - GitHub"
    echo "  gitlab   - GitLab"
    echo ""
    echo "输出文件:"
    echo "  ~/.aet/config.json           全局配置（Token 等，永不覆盖）"
    echo "  ~/.aet/templates/workflow.json  工作流模板（可覆盖更新）"
    echo "  ~/.aet/implement/aet/language-standards/  编程语言规范基线（可覆盖更新）"
    echo ""
    echo "示例:"
    echo "  $0                                  # 交互式配置（选择配置哪个平台）"
    echo "  $0 --skip-token                     # 跳过所有 Token 配置"
    echo "  $0 --token \$ATOMGIT_TOKEN --platform gitcode  # 配置 GitCode Token"
    echo "  $0 --force                          # 强制重新配置（跳过确认）"
    echo ""
}

# 解析命令行参数
parse_args() {
    SKIP_TOKEN=false
    FORCE=false
    TOKEN_VALUE=""
    PLATFORM=""

    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-token)
                SKIP_TOKEN=true
                shift
                ;;
            --force)
                FORCE=true
                shift
                ;;
            --token)
                if [ -n "$2" ]; then
                    TOKEN_VALUE="$2"
                    shift 2
                else
                    log_error "参数 --token 需要提供值"
                    exit 1
                fi
                ;;
            --platform)
                if [ -n "$2" ]; then
                    PLATFORM="$2"
                    shift 2
                else
                    log_error "参数 --platform 需要提供值"
                    exit 1
                fi
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "未知参数: $1"
                show_help
                exit 1
                ;;
        esac
    done

    # 如果指定了 --token 和 --platform，存储该平台的 token
    if [ -n "$TOKEN_VALUE" ] && [ -n "$PLATFORM" ]; then
        case $PLATFORM in
            gitcode) GITCODE_TOKEN="$TOKEN_VALUE" ;;
            github)  GITHUB_TOKEN="$TOKEN_VALUE" ;;
            gitlab)  GITLAB_TOKEN="$TOKEN_VALUE" ;;
        esac
        TOKEN_PROVIDED=true
    fi
}

# 交互式询问用户
interactive_ask() {
    log_info "开始配置全局配置..."

    # 询问是否配置 Token
    if [ "$SKIP_TOKEN" = false ]; then
        local continue_config=true

        while [ "$continue_config" = true ]; do
            echo ""

            if [ "$USE_GUM" = true ]; then
                # 使用 gum choose - 单选，显示已配置状态
                local platform_header="请选择要配置的平台 Token："

                # 显示已配置状态
                if [ -n "$GITCODE_TOKEN" ]; then
                    platform_header="$platform_header (GitCode: 已配置)"
                fi
                if [ -n "$GITHUB_TOKEN" ]; then
                    platform_header="$platform_header (GitHub: 已配置)"
                fi
                if [ -n "$GITLAB_TOKEN" ]; then
                    platform_header="$platform_header (GitLab: 已配置)"
                fi

                platform_choice=$(gum choose \
                    --header "$platform_header" \
                    --cursor.foreground 4 \
                    --selected.foreground 2 \
                    "GitCode/AtomGit" \
                    "GitHub" \
                    "GitLab" \
                    "完成配置（退出）")

                case "$platform_choice" in
                    "GitCode/AtomGit")
                        configure_platform_token "gitcode"
                        ;;
                    "GitHub")
                        configure_platform_token "github"
                        ;;
                    "GitLab")
                        configure_platform_token "gitlab"
                        ;;
                    "完成配置（退出）")
                        continue_config=false
                        ;;
                esac
            else
                # 传统方式
                echo -e "${YELLOW}请选择要配置的平台 Token：${NC}"

                # 显示已配置状态
                if [ -n "$GITCODE_TOKEN" ]; then
                    echo "  1. GitCode/AtomGit (已配置)"
                else
                    echo "  1. GitCode/AtomGit"
                fi
                if [ -n "$GITHUB_TOKEN" ]; then
                    echo "  2. GitHub (已配置)"
                else
                    echo "  2. GitHub"
                fi
                if [ -n "$GITLAB_TOKEN" ]; then
                    echo "  3. GitLab (已配置)"
                else
                    echo "  3. GitLab"
                fi
                echo "  4. 完成配置（退出）"
                echo ""

                safe_read "请输入选项编号 (1-4): " config_choice

                case $config_choice in
                    1)
                        configure_platform_token "gitcode"
                        ;;
                    2)
                        configure_platform_token "github"
                        ;;
                    3)
                        configure_platform_token "gitlab"
                        ;;
                    4)
                        continue_config=false
                        ;;
                    *)
                        echo "无效选项"
                        ;;
                esac
            fi
        done

        log_success "Token 配置完成"
    fi

    # 询问是否启用 LLM 追踪日志
    if [ "$TRACE_ENABLED" = "" ]; then
        echo ""
        log_info "是否启用 LLM 请求/响应追踪日志？"
        echo -e "  追踪日志记录所有 LLM API 请求和响应到 ~/.aet/log/trace/"
        echo -e "  用于调试、性能分析和用量统计。可随时通过修改 ~/.aet/config.json 或调用工具开关。"
        echo ""

        if [ "$USE_GUM" = true ]; then
            trace_choice=$(gum choose \
                --header "请选择：" \
                --cursor.foreground 4 \
                --selected.foreground 2 \
                "启用追踪（推荐）" \
                "禁用追踪")

            if [ "$trace_choice" = "启用追踪（推荐）" ]; then
                TRACE_ENABLED="true"
            else
                TRACE_ENABLED="false"
            fi
        else
            echo -e "${YELLOW}选项:${NC}"
            echo -e "  1. 启用追踪（推荐）"
            echo -e "  2. 禁用追踪"
            echo ""
            safe_read "请选择 (1/2): " trace_num
            if [ "$trace_num" = "2" ]; then
                TRACE_ENABLED="false"
            else
                TRACE_ENABLED="true"
            fi
        fi
    fi
}

# 配置指定平台的 Token
configure_platform_token() {
    local platform="$1"
    local env_var_name=""
    local already_configured=false

    case $platform in
        gitcode)
            env_var_name="ATOMGIT_TOKEN"
            if [ -n "$GITCODE_TOKEN" ]; then already_configured=true; fi
            ;;
        github)
            env_var_name="GITHUB_TOKEN"
            if [ -n "$GITHUB_TOKEN" ]; then already_configured=true; fi
            ;;
        gitlab)
            env_var_name="GITLAB_TOKEN"
            if [ -n "$GITLAB_TOKEN" ]; then already_configured=true; fi
            ;;
    esac

    # 如果已配置，提示用户
    if [ "$already_configured" = true ]; then
        if [ "$USE_GUM" = true ]; then
            local reconfigure=$(gum confirm "${platform} 已配置，是否重新配置？" && echo "y" || echo "n")
        else
            echo ""
            echo -e "${YELLOW}${platform} 已配置，是否重新配置？${NC}"
            safe_read "(y/n): " reconfigure
        fi

        if [[ ! "$reconfigure" =~ ^[Yy]$ ]]; then
            log_info "保留 ${platform} 的现有配置"
            return
        fi
    fi

    if [ "$USE_GUM" = true ]; then
        # 使用 gum choose 选择配置方式
        token_method=$(gum choose \
            --header "配置 ${platform} 平台 Token" \
            --cursor.foreground 4 \
            --selected.foreground 2 \
            "直接输入 Token 值" \
            "使用环境变量引用 \${${env_var_name}}（推荐）" \
            "跳过此平台")

        case "$token_method" in
            "直接输入 Token 值")
                # 使用 gum input 输入 Token
                token_input=$(gum input \
                    --header "请输入 ${platform} Token 值" \
                    --placeholder "gcode_xxx 或 ghp_xxx" \
                    --prompt "> " \
                    --width 50)

                case $platform in
                    gitcode) GITCODE_TOKEN="$token_input" ;;
                    github)  GITHUB_TOKEN="$token_input" ;;
                    gitlab)  GITLAB_TOKEN="$token_input" ;;
                esac
                log_success "${platform} Token 已配置"
                ;;
            "使用环境变量引用 \${${env_var_name}}（推荐）")
                # 使用 gum input 输入环境变量名
                input_env_var=$(gum input \
                    --header "请输入环境变量名（默认: ${env_var_name})" \
                    --placeholder "${env_var_name}" \
                    --prompt "> " \
                    --width 50)

                if [ -z "$input_env_var" ]; then
                    input_env_var="$env_var_name"
                fi

                local token_input="\${$input_env_var}"
                case $platform in
                    gitcode) GITCODE_TOKEN="$token_input" ;;
                    github)  GITHUB_TOKEN="$token_input" ;;
                    gitlab)  GITLAB_TOKEN="$token_input" ;;
                esac
                log_success "${platform} Token 配置为环境变量引用"
                log_info "请确保设置环境变量：export ${input_env_var}=<your-token>"
                ;;
            "跳过此平台")
                log_info "跳过 ${platform} Token 配置"
                ;;
        esac
    else
        # 传统方式
        echo ""
        echo -e "${YELLOW}配置 ${platform} 平台 Token：${NC}"
        echo ""
        echo "选项:"
        echo "  1. 直接输入 Token 值"
        echo "  2. 使用环境变量引用：\${${env_var_name}}（推荐）"
        echo "  3. 跳过此平台"
        echo ""
        safe_read "请选择 (1-3): " token_method

        case $token_method in
            1)
                safe_read "请输入 ${platform} Token 值: " token_input
                case $platform in
                    gitcode) GITCODE_TOKEN="$token_input" ;;
                    github)  GITHUB_TOKEN="$token_input" ;;
                    gitlab)  GITLAB_TOKEN="$token_input" ;;
                esac
                log_success "${platform} Token 已配置"
                ;;
            2)
                safe_read "请输入环境变量名（默认 ${env_var_name}): " input_env_var
                if [ -z "$input_env_var" ]; then
                    input_env_var="$env_var_name"
                fi
                local token_input="\${$input_env_var}"
                case $platform in
                    gitcode) GITCODE_TOKEN="$token_input" ;;
                    github)  GITHUB_TOKEN="$token_input" ;;
                    gitlab)  GITLAB_TOKEN="$token_input" ;;
                esac
                log_success "${platform} Token 配置为环境变量引用：\${$input_env_var}"
                log_info "请确保设置环境变量：export ${input_env_var}=<your-token>"
                ;;
            3)
                log_info "跳过 ${platform} Token 配置"
                ;;
            *)
                echo "无效选项"
                ;;
        esac
    fi
}

# 创建全局配置目录
create_global_dir() {
    if [ ! -d "$GLOBAL_CONFIG_DIR" ]; then
        mkdir -p "$GLOBAL_CONFIG_DIR" || {
            log_error "无法创建全局配置目录: $GLOBAL_CONFIG_DIR"
            exit 1
        }
        log_success "创建全局配置目录: $GLOBAL_CONFIG_DIR"
    else
        log_info "全局配置目录已存在: $GLOBAL_CONFIG_DIR"
    fi

    # 创建模板目录
    if [ ! -d "$TEMPLATES_DIR" ]; then
        mkdir -p "$TEMPLATES_DIR" || {
            log_error "无法创建模板目录: $TEMPLATES_DIR"
            exit 1
        }
        log_success "创建模板目录: $TEMPLATES_DIR"
    else
        log_info "模板目录已存在: $TEMPLATES_DIR"
    fi
}

# 加载全局配置模板
load_template() {
    if [ ! -f "$GLOBAL_CONFIG_TEMPLATE" ]; then
        log_error "全局配置模板文件不存在: $GLOBAL_CONFIG_TEMPLATE"
        log_error "请确保在 AET 项目根目录下运行此脚本"
        exit 1
    fi

    # 读取模板文件
    TEMPLATE_CONTENT=$(cat "$GLOBAL_CONFIG_TEMPLATE")

    # 移除所有 _comment 字段（使用 jq 或手动处理）
    if command -v jq >/dev/null 2>&1; then
        TEMPLATE_CONTENT=$(echo "$TEMPLATE_CONTENT" | jq 'del(._comment, .codePlatform._comment, .codePlatform.platforms._comment)')
    fi

    log_info "加载全局配置模板"
}

# 复制工作流模板（直接覆盖）
copy_workflow_template() {
    if [ ! -f "$WORKFLOW_TEMPLATE_SOURCE" ]; then
        log_error "工作流模板源文件不存在: $WORKFLOW_TEMPLATE_SOURCE"
        log_error "请确保在 AET 项目根目录下运行此脚本"
        exit 1
    fi

    # 直接复制工作流模板（覆盖）
    cp "$WORKFLOW_TEMPLATE_SOURCE" "$WORKFLOW_TEMPLATE_FILE" || {
        log_error "无法复制工作流模板: $WORKFLOW_TEMPLATE_FILE"
        exit 1
    }

    log_success "工作流模板已更新: $WORKFLOW_TEMPLATE_FILE"
}

# 复制编程语言规范基线（直接覆盖 aet 层，custom 层永不触碰）
copy_standards() {
    if [ ! -d "$STANDARDS_SOURCE_DIR" ]; then
        log_warning "语言规范源目录不存在，跳过: $STANDARDS_SOURCE_DIR"
        return 0
    fi

    mkdir -p "$STANDARDS_DEST_DIR" || {
        log_error "无法创建语言规范目录: $STANDARDS_DEST_DIR"
        exit 1
    }

    # 覆盖 aet 基线层（用户在 ~/.aet/implement/custom/ 下的自定义不受影响）
    cp -R "$STANDARDS_SOURCE_DIR"/. "$STANDARDS_DEST_DIR"/ || {
        log_error "无法复制语言规范基线: $STANDARDS_DEST_DIR"
        exit 1
    }

    log_success "编程语言规范基线已更新: $STANDARDS_DEST_DIR"
}

# 从已存在的全局配置文件读取指定平台的 Token（jq 优先，否则用 node）
read_token_from_file() {
    local platform="$1"
    if [ ! -f "$GLOBAL_CONFIG_FILE" ]; then
        return 0
    fi
    if command -v jq >/dev/null 2>&1; then
        jq -r ".codePlatform.platforms.${platform}.token // empty" "$GLOBAL_CONFIG_FILE"
    elif command -v node >/dev/null 2>&1; then
        node -e '
            const fs = require("fs");
            try {
                const c = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
                const p = c && c.codePlatform && c.codePlatform.platforms;
                const t = p && p[process.argv[2]] && p[process.argv[2]].token;
                if (t) process.stdout.write(String(t));
            } catch (e) {}
        ' "$GLOBAL_CONFIG_FILE" "$platform"
    fi
}

# 生成全局配置文件
generate_config() {
    # FORCE 模式且文件已存在时，保留用户未重新输入的旧 Token
    # （对 jq 和 node 两条路径都生效）
    if [ "$FORCE" = true ] && [ -f "$GLOBAL_CONFIG_FILE" ]; then
        local old_gitcode_token=$(read_token_from_file gitcode)
        local old_github_token=$(read_token_from_file github)
        local old_gitlab_token=$(read_token_from_file gitlab)

        if [ -z "$GITCODE_TOKEN" ] && [ -n "$old_gitcode_token" ]; then
            GITCODE_TOKEN="$old_gitcode_token"
        fi
        if [ -z "$GITHUB_TOKEN" ] && [ -n "$old_github_token" ]; then
            GITHUB_TOKEN="$old_github_token"
        fi
        if [ -z "$GITLAB_TOKEN" ] && [ -n "$old_gitlab_token" ]; then
            GITLAB_TOKEN="$old_gitlab_token"
        fi
    fi

    if command -v jq >/dev/null 2>&1; then
        CONFIG_CONTENT=$(echo "$TEMPLATE_CONTENT" | \
            jq --arg gitcode_token "$GITCODE_TOKEN" \
               --arg github_token "$GITHUB_TOKEN" \
               --arg gitlab_token "$GITLAB_TOKEN" \
               --argjson trace_enabled "${TRACE_ENABLED:-true}" \
               '.codePlatform.platforms.gitcode.token = $gitcode_token |
                .codePlatform.platforms.github.token = $github_token |
                .codePlatform.platforms.gitlab.token = $gitlab_token |
                .trace.enabled = $trace_enabled')
    elif command -v node >/dev/null 2>&1; then
        # jq 不可用时用 node 写入（node 是安装的硬依赖）。
        # Token 通过环境变量传入，避免引号/特殊字符破坏 JSON。
        CONFIG_CONTENT=$(printf '%s' "$TEMPLATE_CONTENT" | \
            GEN_GITCODE_TOKEN="$GITCODE_TOKEN" \
            GEN_GITHUB_TOKEN="$GITHUB_TOKEN" \
            GEN_GITLAB_TOKEN="$GITLAB_TOKEN" \
            GEN_TRACE_ENABLED="${TRACE_ENABLED:-true}" \
            node -e '
                let s = "";
                process.stdin.on("data", d => s += d);
                process.stdin.on("end", () => {
                    const c = JSON.parse(s);
                    c.codePlatform = c.codePlatform || {};
                    c.codePlatform.platforms = c.codePlatform.platforms || {};
                    const p = c.codePlatform.platforms;
                    for (const k of ["gitcode", "github", "gitlab"]) {
                        p[k] = p[k] || { type: k };
                    }
                    p.gitcode.token = process.env.GEN_GITCODE_TOKEN || "";
                    p.github.token = process.env.GEN_GITHUB_TOKEN || "";
                    p.gitlab.token = process.env.GEN_GITLAB_TOKEN || "";
                    c.trace = c.trace || {};
                    c.trace.enabled = process.env.GEN_TRACE_ENABLED === "true" || process.env.GEN_TRACE_ENABLED === undefined;
                    process.stdout.write(JSON.stringify(c, null, 2) + "\n");
                });
            ')
    else
        log_error "未找到 jq 或 node，无法生成配置文件。请安装 Node.js 或 jq 后重试。"
        exit 1
    fi

    log_info "生成全局配置文件内容"
}

# 写入配置文件
write_config() {
    # 全局配置文件如果已存在：
    # - 非 FORCE 模式：不覆盖（保留用户 Token）
    # - FORCE 模式：覆盖文件，清理旧的工作流配置（只保留 Token）
    if [ -f "$GLOBAL_CONFIG_FILE" ] && [ "$FORCE" = false ]; then
        log_info "全局配置文件已存在，保留现有配置: $GLOBAL_CONFIG_FILE"
        log_info "如需修改 Token，请手动编辑文件"
        return 0
    fi

    # FORCE 模式下，覆盖旧配置（清理旧的工作流配置）
    if [ -f "$GLOBAL_CONFIG_FILE" ] && [ "$FORCE" = true ]; then
        log_info "覆盖全局配置文件，清理旧的工作流配置（Token 将重新配置）"
    fi

    echo "$CONFIG_CONTENT" > "$GLOBAL_CONFIG_FILE" || {
        log_error "无法写入配置文件: $GLOBAL_CONFIG_FILE"
        exit 1
    }

    # 设置文件权限为 600（仅用户可读写）
    chmod 600 "$GLOBAL_CONFIG_FILE" || {
        log_error "无法设置文件权限: $GLOBAL_CONFIG_FILE"
        exit 1
    }

    log_success "全局配置文件已更新: $GLOBAL_CONFIG_FILE"
    log_success "文件权限已设置为 600"
}

# 显示安全提示
show_security_notice() {
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}全局配置初始化完成${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""

    # 显示已配置的平台 Token
    echo -e "${BLUE}已配置的平台 Token：${NC}"

    if [ -n "$GITCODE_TOKEN" ]; then
        if [[ "$GITCODE_TOKEN" =~ ^\$\{.*\}$ ]]; then
            echo "  gitcode: 环境变量引用 (${GITCODE_TOKEN})"
        else
            echo -e "  gitcode: ${YELLOW}明文存储（建议改用环境变量引用）${NC}"
        fi
    else
        echo "  gitcode: 未配置"
    fi

    if [ -n "$GITHUB_TOKEN" ]; then
        if [[ "$GITHUB_TOKEN" =~ ^\$\{.*\}$ ]]; then
            echo "  github: 环境变量引用 (${GITHUB_TOKEN})"
        else
            echo -e "  github: ${YELLOW}明文存储（建议改用环境变量引用）${NC}"
        fi
    else
        echo "  github: 未配置"
    fi

    if [ -n "$GITLAB_TOKEN" ]; then
        if [[ "$GITLAB_TOKEN" =~ ^\$\{.*\}$ ]]; then
            echo "  gitlab: 环境变量引用 (${GITLAB_TOKEN})"
        else
            echo -e "  gitlab: ${YELLOW}明文存储（建议改用环境变量引用）${NC}"
        fi
    else
        echo "  gitlab: 未配置"
    fi

    echo ""
    echo -e "${BLUE}配置文件位置：${NC}"
    echo "  全局配置: $GLOBAL_CONFIG_FILE (永不覆盖，手动修改 Token)"
    echo "  工作流模板: $WORKFLOW_TEMPLATE_FILE (随版本更新覆盖)"
    echo ""
    echo -e "${BLUE}注意事项：${NC}"
    echo "  ~/.aet/ 目录不在项目范围内，不会被 git 提交"
    echo "  全局配置文件权限应为 600"
    echo "  工作流模板会随 AET 更新自动覆盖"
    echo ""
    echo -e "${GREEN}下一步：${NC}"
    echo "  进入项目目录，执行 /aet-init 命令初始化项目配置"
    echo "  项目配置中指定 platform.type，系统会自动使用对应平台的 Token"
    echo ""
}

# 主函数
main() {
    # 先检查 gum 和管道模式
    check_gum
    check_pipe_mode

    parse_args "$@"

    # 管道模式下提示用户（但 --force 时继续执行）
    if [ "$IS_PIPE_MODE" = true ] && [ "$FORCE" = false ]; then
        if [ -f "$GLOBAL_CONFIG_FILE" ]; then
            log_info "全局配置文件已存在: $GLOBAL_CONFIG_FILE"
            log_info "跳过全局配置初始化"
            # 但仍然更新工作流模板与语言规范基线
            create_global_dir
            copy_workflow_template
            copy_standards
            exit 0
        fi
    fi

    if [ "$IS_PIPE_MODE" = true ]; then
        log_info "管道模式运行，将从终端读取输入"
    fi

    # 检查配置文件是否已存在（除非 --force）
    if [ -f "$GLOBAL_CONFIG_FILE" ] && [ "$FORCE" = false ]; then
        log_info "全局配置文件已存在: $GLOBAL_CONFIG_FILE"
        log_info "保留现有全局配置（Token 等敏感信息）"
        # 不退出，继续更新工作流模板
    fi

    # 全局配置文件存在且 --force 时，询问是否重新配置
    if [ -f "$GLOBAL_CONFIG_FILE" ] && [ "$FORCE" = true ]; then
        log_warning "将覆盖现有全局配置文件"

        # 交互式询问（如果不是通过参数配置）
        if [ "$SKIP_TOKEN" = false ] && [ "$TOKEN_PROVIDED" = false ]; then
            interactive_ask
        fi
    elif [ ! -f "$GLOBAL_CONFIG_FILE" ]; then
        # 全局配置文件不存在，交互式配置
        if [ "$SKIP_TOKEN" = false ] && [ "$TOKEN_PROVIDED" = false ]; then
            interactive_ask
        fi
    fi

    # 创建全局配置目录
    create_global_dir

    # 加载配置模板（仅在需要创建全局配置时）
    if [ ! -f "$GLOBAL_CONFIG_FILE" ] || [ "$FORCE" = true ]; then
        load_template
        generate_config
        write_config
    fi

    # 复制工作流模板（直接覆盖）
    copy_workflow_template

    # 复制编程语言规范基线（直接覆盖 aet 层）
    copy_standards

    # 显示安全提示
    show_security_notice
}

# 运行主函数
main "$@"