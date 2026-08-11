#!/bin/bash

# 日志函数
log_info() {
    echo -e "\033[0;34m[INFO]\033[0m $1"
}

log_success() {
    echo -e "\033[0;32m[SUCCESS]\033[0m $1"
}

log_error() {
    echo -e "\033[0;31m[ERROR]\033[0m $1"
    exit 1
}

log_warn() {
    echo -e "\033[0;33m[WARN]\033[0m $1"
}

# 检测管道模式
IS_PIPE_MODE=false
if [ ! -t 0 ]; then
    IS_PIPE_MODE=true
fi

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

# 依赖检查
check_dependencies() {
    log_info "检查依赖..."

    if ! command -v git >/dev/null 2>&1; then
        log_error "未找到 git，请先安装 git"
    fi

    if ! command -v node >/dev/null 2>&1; then
        log_error "未找到 Node.js，请先安装 Node.js\n       AET 插件需要 Node.js 才能运行"
    fi

    if ! command -v npm >/dev/null 2>&1; then
        log_error "未找到 npm，请先安装 Node.js（npm 会随 Node.js 安装）"
    fi

    log_success "依赖检查通过"
}

# 安装知识图谱工具 graphify（可选工具，失败不影响主安装）
install_knowledge_graph() {
    log_info "检查知识图谱工具 graphify..."
    
    # 检测 graphify 是否已安装（优先检测 venv，再检测全局命令/模块）
    local venv_python="$HOME/.aet/venv/bin/python3"
    if [ -f "$venv_python" ] && "$venv_python" -c "import graphify" >/dev/null 2>&1; then
        log_success "检测到 graphify 已安装（~/.aet/venv）"
        echo -e "\033[0;32m         知识图谱工具已就绪：graphify\033[0m"
        return 0
    elif command -v graphify >/dev/null 2>&1; then
        log_success "检测到 graphify 已安装"
        echo -e "\033[0;32m         知识图谱工具已就绪：graphify\033[0m"
        return 0
    elif command -v python3 >/dev/null 2>&1; then
        # pip包名是graphifyy，但模块名是graphify
        if python3 -c "import graphify" >/dev/null 2>&1; then
            log_success "检测到 graphify 已安装"
            echo -e "\033[0;32m         知识图谱工具已就绪：graphify\033[0m"
            return 0
        fi
    fi
    
    # 未检测到 graphify，自动安装
    log_info "未检测到 graphify，开始安装..."
    
    # 检查 Python 环境
    if ! command -v python3 >/dev/null 2>&1; then
        log_error "未找到 Python，无法安装 graphifyy\n       请先安装 Python: https://python.org"
        return 1
    fi
    log_info "安装 graphifyy 到 venv..."
    
    local venv_dir="$HOME/.aet/venv"
    local venv_pip="$venv_dir/bin/pip"
    
    # 创建 venv
    mkdir -p "$venv_dir" || log_error "无法创建 venv 目录: $venv_dir"
    
    log_info "创建虚拟环境..."
    if ! python3 -m venv "$venv_dir"; then
        log_error "venv 创建失败"
        return 1
    fi
    
    # 检查 pip
    if [ ! -f "$venv_pip" ]; then
        log_error "venv pip 不存在: $venv_pip"
        return 1
    fi
    
    # 安装 graphifyy
    log_info "安装 graphifyy..."
    if "$venv_pip" install graphifyy; then
        log_success "graphifyy 安装成功"
        echo -e "\033[0;32m         项目分析功能已就绪（~/.aet/venv）\033[0m"
    else
        log_error "graphifyy 安装失败"
        return 1
    fi
    
    return 0
}

resolve_aet_target() {
    case "${platform}" in
        xiaoO)    echo "$HOME/.xiaoo/aet" ;;
        opencode) echo "$HOME/.config/opencode/aet" ;;
        *)        echo "$HOME/.xiaoo/aet" ;;
    esac
}

resolve_repo_url() {
    echo "https://atomgit.com/openeuler/agentic-engineering-team.git"
}

download_source() {
    local repo="$(resolve_repo_url)"
    local target="$(resolve_aet_target)"

    log_info "下载源代码..."

    if [ -d "${target}" ] && [ ! -L "${target}" ]; then
        log_info "目录已存在，拉取更新..."
        cd "${target}" && git pull || log_warn "git pull 失败，继续使用现有代码"
    else
        log_info "克隆仓库到 ${target}..."
        mkdir -p "$(dirname "${target}")"
        rm -rf "${target}"
        git clone "${repo}" "${target}" || log_error "克隆仓库失败"
    fi

    log_success "源代码下载完成"
}

resolve_aet_root() {
    local target="$(resolve_aet_target)"

    if [ "${install_mode}" = "remote" ]; then
        download_source
    else
        local script_dir="$(cd "$(dirname "$0")" && pwd)"
        local project_root="$(cd "${script_dir}/.." && pwd)"

        if [ ! -f "${project_root}/commands/init.md" ]; then
            log_error "本地目录不是有效的 AET 项目: ${project_root}\n请确保在 AET 项目根目录下运行此脚本"
        fi

        log_info "使用本地源代码: ${project_root}"

        mkdir -p "$(dirname "${target}")"
        if [ -L "${target}" ]; then
            rm -f "${target}"
        elif [ -d "${target}" ]; then
            if [ "$(readlink -f "${target}")" = "$(readlink -f "${project_root}")" ]; then
                log_info "已使用相同目录，跳过链接步骤"
                AET_ROOT="${target}"
                return
            fi
            rm -rf "${target}"
        fi
        ln -s "${project_root}" "${target}"
        log_success "已创建符号链接: ${target} -> ${project_root}"
    fi

    AET_ROOT="${target}"
}

# ============================================================
# opencode 平台函数
# ============================================================

# 创建插件和skills目录
opencode_create_directories() {
    local aet_dir="$HOME/.config/opencode/aet"
    
    log_info "创建插件和skills目录..."
    
    # 创建插件目录
    mkdir -p "$HOME/.config/opencode/plugins" || log_error "无法创建插件目录"
    
    # 创建插件符号链接
    ln -sf "$aet_dir/.opencode/plugins/aet.js" "$HOME/.config/opencode/plugins/aet.js" || \
        log_error "无法创建插件符号链接"
    
    # 创建 skills 目录
    mkdir -p "$HOME/.config/opencode/skills" || log_error "无法创建 skills 目录"
    
    # 创建真实的 aet skills 目录
    local aet_skills_dir="$HOME/.config/opencode/skills/aet"

    # 如果目录已存在，先删除
    if [ -e "$aet_skills_dir" ]; then
        rm -rf "$aet_skills_dir" || log_error "无法删除旧的 aet skills 目录"
    fi

    # 创建新目录
    mkdir -p "$aet_skills_dir" || log_error "无法创建 aet skills 目录"

    # 复制 skills 内容
    cp -r "$aet_dir/skills"/* "$aet_skills_dir/" || log_error "无法复制 skills 内容"
    
    log_success "目录创建完成"
}

# 创建commands目录的符号链接
opencode_create_commands_symlinks() {
    local aet_dir="$HOME/.config/opencode/aet"
    local commands_dir="$HOME/.config/opencode/commands"
    
    log_info "创建commands目录的符号链接..."
    
    # 创建commands目录
    mkdir -p "$commands_dir" || log_error "无法创建commands目录"
    
    # 删除旧的 aet: 格式命令文件
    for old_cmd in "$commands_dir"/aet:*; do
        if [ -e "$old_cmd" ]; then
            rm -f "$old_cmd" || log_error "无法删除旧命令文件 $old_cmd"
        fi
    done
    
    # 为commands目录中的每个文件创建符号链接
    if [ -d "$aet_dir/commands" ]; then
        for cmd_file in "$aet_dir/commands"/*.md; do
            if [ -f "$cmd_file" ]; then
                local filename=$(basename "$cmd_file")
                local symlink_name="aet-$filename"
                ln -sf "$cmd_file" "$commands_dir/$symlink_name" || \
                    log_error "无法创建符号链接 $symlink_name"
            fi
        done
        log_success "commands符号链接创建完成"
    else
        log_error "commands目录不存在: $aet_dir/commands"
    fi
}

# 全局配置初始化
init_global_config() {
    log_info "检查全局配置..."

    local global_config_dir="$HOME/.aet"
    local global_config_file="$global_config_dir/config.json"
    local force_reconfigure=false

    if [ -f "$global_config_file" ]; then
        log_info "全局配置已存在: $global_config_file"

        if command -v gum >/dev/null 2>&1; then
            # 使用 gum choose
            config_choice=$(gum choose \
                --header "全局配置已存在，请选择：" \
                --cursor.foreground 4 \
                --selected.foreground 2 \
                "重新配置（可添加/修改平台 Token）" \
                "跳过（保留现有配置，继续安装）")

            if [ "$config_choice" = "重新配置（可添加/修改平台 Token）" ]; then
                force_reconfigure=true
            else
                log_info "跳过全局配置重新配置，保留现有 Token"
            fi
        else
            # 传统方式
            echo ""
            echo -e "\033[1;33m[提示]\033[0m 全局配置已存在"
            echo ""
            echo "选项:"
            echo "  1. 重新配置（可添加/修改平台 Token）"
            echo "  2. 跳过（保留现有配置，继续安装）"
            echo ""
            safe_read "请选择 (1/2): " config_num

            if [ "$config_num" = "1" ]; then
                force_reconfigure=true
            else
                log_info "跳过全局配置重新配置，保留现有 Token"
            fi
        fi
    fi

    # 获取初始化脚本路径
    # 优先使用 AET 安装目录中的脚本（远程安装场景）
    local init_script="$HOME/.config/opencode/aet/scripts/init-global-config.sh"
    # 如果是本地安装，尝试从脚本所在目录获取
    if [ ! -f "$init_script" ]; then
        local script_dir="$(cd "$(dirname "$0")" && pwd)"
        init_script="$script_dir/init-global-config.sh"
    fi
    
    if [ ! -f "$init_script" ]; then
        log_error "全局配置初始化脚本不存在: $init_script"
        return 1
    fi
    
    # 执行全局配置初始化脚本
    if [ "$force_reconfigure" = true ]; then
        # 用户选择重新配置，传递 --force 跳过二次确认
        bash "$init_script" --force || {
            log_error "全局配置初始化失败"
            return 1
        }
    else
        # 首次安装，正常调用
        bash "$init_script" || {
            log_error "全局配置初始化失败"
            return 1
        }
    fi
    
    log_success "全局配置初始化完成"
    return 0
}

# 验证安装
opencode_verify_installation() {
    log_info "验证安装..."
    
    if [ ! -f "$HOME/.config/opencode/plugins/aet.js" ]; then
        log_error "插件链接不存在"
    fi
    
    if [ ! -d "$HOME/.config/opencode/skills/aet" ]; then
        log_error "skills 链接不存在"
    fi
    
    if [ ! -d "$HOME/.config/opencode/commands" ]; then
        log_error "commands目录不存在"
    fi
    
    # 检查公共模块目录
    local aet_utils_dir
    if [ -L "$HOME/.config/opencode/aet" ]; then
        aet_utils_dir="$(readlink -f "$HOME/.config/opencode/aet")/.platform/utils"
    else
        aet_utils_dir="$HOME/.config/opencode/aet/.platform/utils"
    fi
    if [ ! -d "$aet_utils_dir" ]; then
        log_error "公共模块目录不存在: $aet_utils_dir"
    fi
    
    # 检查至少有一个commands符号链接
    if [ ! -L "$HOME/.config/opencode/commands/aet-init.md" ]; then
        log_error "commands符号链接不存在"
    fi
    
    log_success "安装验证通过"
}

# ============================================================
# xiaoO 平台函数
# ============================================================

xiaoo_install_hooker_plugin() {
    local aet_root="$1"
    local config_file="$2"

    log_info "安装 Hooker 插件..."

    local plugin_json="${aet_root}/.xiaoo/hookers/plugin.json"

    [ -f "${plugin_json}" ] || log_error "plugin.json 不存在: ${plugin_json}"

    # 幂等：已注册则跳过
    if grep -qF "${plugin_json}" "${config_file}" 2>/dev/null; then
        log_info "plugin.json 已注册"
        return
    fi

    # [hooker] 段不存在，直接创建
    if ! grep -q '^\[hooker\]' "${config_file}" 2>/dev/null; then
        {
            echo ""
            echo "[hooker]"
            echo "plugins = [\"${plugin_json}\"]"
            echo 'default = "All"'
        } >> "${config_file}"
        log_success "已注册 plugin.json 到 config.toml"
        return
    fi

    # [hooker] 已存在，添加 plugin_json 到 plugins
    local existing_plugins
    existing_plugins=$(grep '^plugins[[:space:]]*=' "${config_file}" 2>/dev/null || true)

    local tmp_file
    tmp_file=$(mktemp)

    if [ -n "${existing_plugins}" ]; then
        # 已有 plugins 行，追加到数组
        if [[ "${existing_plugins}" =~ \[\][[:space:]]*$ ]]; then
            sed "s|^plugins[[:space:]]*=.*|plugins = [\"${plugin_json}\"]|" "${config_file}" > "${tmp_file}"
        else
            sed "/^plugins/s|]|, \"${plugin_json}\"]|" "${config_file}" > "${tmp_file}"
        fi
    else
        # 无 plugins 行，在 [hooker] 后新增
        awk -v plugin_line="plugins = [\"${plugin_json}\"]" '
        /^\[hooker\]/ { print; print plugin_line; next }
        { print }
        ' "${config_file}" > "${tmp_file}"
    fi

    mv "${tmp_file}" "${config_file}"
    log_success "已注册 plugin.json 到 config.toml"
}

xiaoo_install_commands() {
    local aet_root="$1"
    local command_dir="$2"
    local commands_src="${aet_root}/commands"

    log_info "链接命令文件..."

    if [ ! -d "${commands_src}" ]; then
        log_error "commands 目录不存在: ${commands_src}"
    fi

    mkdir -p "${command_dir}"

    # 清理旧的 aet- 命令符号链接或文件
    rm -f "${command_dir}"/aet-* 2>/dev/null

    local count=0
    for cmd_file in "${commands_src}"/*.md; do
        [ -f "${cmd_file}" ] || continue
        local filename=$(basename "${cmd_file}")
        ln -s "${cmd_file}" "${command_dir}/aet-${filename}"
        count=$((count + 1))
    done

    log_success "已链接 ${count} 个命令文件"
}

xiaoo_install_tools() {
    local aet_root="$1"
    local tools_dir="$2"
    local src_tools="${aet_root}/.xiaoo/tools"

    log_info "链接工具文件..."

    mkdir -p "${tools_dir}"

    if [ "$(cd -P "${src_tools}" 2>/dev/null && pwd -P)" = "$(cd -P "${tools_dir}" 2>/dev/null && pwd -P)" ]; then
        log_info "源与目标相同，跳过"
        return
    fi

    if [ ! -d "${src_tools}" ]; then
        log_warn "工具源目录不存在: ${src_tools}"
        return
    fi

    # 创建符号链接（跳过 tools.toml）
    local count=0
    for f in "${src_tools}"/*; do
        [ -f "$f" ] || continue
        local filename=$(basename "$f")
        [ "${filename}" = "tools.toml" ] && continue
        rm -f "${tools_dir}/${filename}"
        ln -s "$f" "${tools_dir}/${filename}"
        count=$((count + 1))
    done

    log_success "工具链接完成（${count} 个文件）"
}

xiaoo_install_xiaoo_files() {
    local aet_root="$1"
    local xiaoo_home="$2"
    local src_dir="${aet_root}/.xiaoo"

    log_info "链接 xiaoO专用JS文件..."

    local count=0
    for src_file in "${src_dir}"/*.js; do
        [ -f "${src_file}" ] || continue
        local filename=$(basename "${src_file}")
        rm -rf "${xiaoo_home}/${filename}"
        ln -s "${src_file}" "${xiaoo_home}/${filename}"
        count=$((count + 1))
    done

    log_success "已链接 ${count} 个专用JS文件"
}

xiaoo_install_skills() {
    local aet_root="$1"
    local skills_dir="$2"
    local aet_skills="${aet_root}/skills"

    log_info "链接 Skills..."

    if [ ! -d "${aet_skills}" ]; then
        log_warn "Skills 目录不存在，跳过"
        return
    fi

    local count=0
    for skill_dir in "${aet_skills}"/*/; do
        [ -d "${skill_dir}" ] || continue
        local skill_name=$(basename "${skill_dir}")
        rm -rf "${skills_dir}/${skill_name}"
        ln -s "${skill_dir}" "${skills_dir}/${skill_name}"
        count=$((count + 1))
    done

    log_success "已链接 ${count} 个 Skills"
}

# 配置 agents 段：交互询问用户设置 main agent 的 workspace 路径
xiaoo_install_agents_config() {
    local aet_root="$1"
    local config_file="$2"

    log_info "配置项目目录..."

    # 交互询问 workspace
    local workspace=""

    safe_read "请设置项目目录：" workspace

    # 去除首尾引号和空格
    workspace=$(echo "${workspace}" | sed 's/^["'"'"']*//;s/["'"'"']*$//' | xargs)

    [ -z "${workspace}" ] && log_error "项目目录不能为空，请重新运行安装并填写有效的目录路径"
    [ ! -d "${workspace}" ] && log_error "项目目录不存在: ${workspace}，请确认路径后重新运行安装"

    # 幂等：已存在相同配置则跳过
    if grep -q "workspace = \"${workspace}\"" "${config_file}" 2>/dev/null; then
        log_info "agents 配置已存在"
        return
    fi

    # 移除 [agents] 整个段（包括 [[agents.list]] 子段），重新写入
    local tmp_file
    tmp_file=$(mktemp)
    awk '
    /^\[agents\]/ { skip = 1; next }
    skip && /^\[/ && !/^\[\[agents/ { skip = 0 }
    !skip { print }
    ' "${config_file}" > "${tmp_file}"

    # 追加新的 agents 段
    {
        echo ""
        echo "[agents]"
        echo 'default_agent_id = "main"'
        echo ""
        echo "[[agents.list]]"
        echo "id = \"main\""
        echo "workspace = \"${workspace}\""
    } >> "${tmp_file}"

    mv "${tmp_file}" "${config_file}"
    log_success "已配置项目目录: ${workspace}"
}

xiaoo_verify_installation() {
    local aet_root="$1"
    local config_file="$2"
    local command_dir="$3"
    local tools_dir="$4"
    local skills_dir="$5"
    local xiaoo_home="$6"

    log_info "验证安装..."

    local plugin_json="${aet_root}/.xiaoo/hookers/plugin.json"
    if [ ! -f "${plugin_json}" ]; then
        log_error "plugin.json 不存在"
    fi

    if ! grep -q "${plugin_json}" "${config_file}" 2>/dev/null; then
        log_error "plugin.json 未注册到 config.toml"
    fi

    if [ ! -L "${command_dir}/aet-init.md" ]; then
        log_error "commands 符号链接不存在"
    fi

    if [ ! -L "${tools_dir}" ] && [ ! -d "${tools_dir}" ]; then
        log_error "tools 目录不存在"
    fi

    if [ ! -L "${xiaoo_home}/hook-utils.js" ]; then
        log_error "xiaoo 专用 JS 文件链接不存在"
    fi

    log_success "安装验证通过"
}

xiaoo_start_daemon() {
    local config_file="$1"
    local workspace="$2"

    if ! command -v xiaoo-daemon >/dev/null 2>&1; then
        log_warn "未找到 xiaoo-daemon 命令，请手动启动: xiaoo-daemon --config ${config_file} --host 127.0.0.1 --port 18080"
        return
    fi

    # 已有 daemon 在运行则先杀掉
    if pgrep -f "xiaoo-daemon.*--port 18080" >/dev/null 2>&1; then
        log_info "xiaoO daemon 已在运行中，正在重启..."
        pkill -f "xiaoo-daemon.*--port 18080" 2>/dev/null
        sleep 1
    fi

    log_info "后台启动 xiaoO daemon..."
    cd "${workspace}" && nohup xiaoo-daemon --config "${config_file}" --host 127.0.0.1 --port 18080 >> "${HOME}/.xiaoo/xiaoo_daemon.log" 2>&1 &
    disown
    log_success "xiaoO daemon 已在后台启动 (127.0.0.1:18080)"
}

xiaoo_main() {
    echo "=== AET xiaoO 平台安装 ==="
    echo ""

    check_dependencies

    resolve_aet_root
    local aet_root="${AET_ROOT}"
    log_info "AET 根目录: ${aet_root}"
    echo ""

    local xiaoo_config_dir="${HOME}/.config/xiaoo"
    local xiaoo_command_dir="${HOME}/.xiaoo/commands"
    local xiaoo_tools_dir="${HOME}/.xiaoo/tools"
    local xiaoo_home="${HOME}/.xiaoo"
    local xiaoo_skills_dir="${HOME}/.xiaoo/skills"
    local xiaoo_config_file="${xiaoo_config_dir}/config.toml"

    mkdir -p "${xiaoo_config_dir}"
    mkdir -p "${xiaoo_command_dir}"
    mkdir -p "${xiaoo_tools_dir}"
    mkdir -p "${xiaoo_skills_dir}"

    [ ! -f "${xiaoo_config_file}" ] && touch "${xiaoo_config_file}"

    xiaoo_install_hooker_plugin "${aet_root}" "${xiaoo_config_file}"
    xiaoo_install_commands "${aet_root}" "${xiaoo_command_dir}"
    xiaoo_install_tools "${aet_root}" "${xiaoo_tools_dir}"
    xiaoo_install_xiaoo_files "${aet_root}" "${xiaoo_home}"
    xiaoo_install_skills "${aet_root}" "${xiaoo_skills_dir}"
    xiaoo_install_agents_config "${aet_root}" "${xiaoo_config_file}"
    xiaoo_verify_installation "${aet_root}" "${xiaoo_config_file}" "${xiaoo_command_dir}" "${xiaoo_tools_dir}" "${xiaoo_skills_dir}" "${xiaoo_home}"

    install_knowledge_graph
    init_global_config

    local workspace=$(grep '^workspace = ' "${xiaoo_config_file}" | head -1 | sed 's/^workspace = "\(.*\)"/\1/')
    xiaoo_start_daemon "${xiaoo_config_file}" "${workspace}"

    echo ""
    log_success "AET 安装成功！"
    echo ""
    echo "您现在可以使用 AET 了！"
}

opencode_main() {
    echo "=== AET opencode 平台安装 ==="
    echo ""

    check_dependencies

    resolve_aet_root

    if [ "$install_mode" = "local" ]; then
        log_info "模式: 本地安装（开发模式）"
    else
        log_info "模式: 远程安装"
    fi
    opencode_create_directories
    opencode_create_commands_symlinks
    opencode_verify_installation

    # 安装知识图谱工具
    install_knowledge_graph

    # 全局配置初始化
    init_global_config

    log_success "AET 安装成功！"
    echo ""
    echo "您现在可以使用 AET 了！"
}

# 显示帮助
show_help() {
    echo "AET 安装脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  -l, --local    使用本地源代码安装（开发模式）"
    echo "  -h, --help     显示帮助信息"
    echo ""
    echo "示例:"
    echo "  $0                    # 从远程仓库安装"
    echo "  $0 --local            # 使用本地代码安装（开发模式）"
    echo ""
}

# 主函数
main() {
    local install_mode="remote"
    local platform="opencode"
    local PLATFORM_SPECIFIED=""

    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            -l|--local)
                install_mode="local"
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "未知参数: $1"
                ;;
        esac
    done

    # 交互式选择安装平台
    if [[ -z "${PLATFORM_SPECIFIED}" ]]; then
        echo "请选择安装平台："
        echo "  1) opencode  - 安装到 ~/.config/opencode/"
        echo "  2) xiaoO     - 安装到 ~/.xiaoo/"
        echo ""
        safe_read "请输入选项 (1 或 2，默认 1): " choice
        case "${choice}" in
            2|xiaoO|XIAOO) platform="xiaoO" ;;
            *) platform="opencode" ;;
        esac
        log_info "已选择平台: ${platform}"
    fi

    # 分发到对应平台的安装逻辑
    case "${platform}" in
        xiaoO)
            xiaoo_main
            ;;
        opencode)
            opencode_main
            ;;
    esac
}

main "$@"
