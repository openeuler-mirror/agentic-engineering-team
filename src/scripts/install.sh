#!/usr/bin/env bash
# AET 一键安装脚本 (v3)
#
# 针对 src → dist 构建产物安装，交互式 TUI（参考 OpenSpec init 观感）。
#
# 用法:
#   bash src/scripts/install.sh                    # 远程模式: 克隆仓库到 ~/.aet/aet 再安装
#   bash src/scripts/install.sh -l                 # 本地模式: 脚本已在仓库内，直接用当前仓库
#   bash src/scripts/install.sh --plugins claude,opencode   # 非交互: 指定要装的插件
#   bash src/scripts/install.sh --offline          # 离线模式: 跳过 npm install/build，复用已有 dist（见下）
#   bash src/scripts/install.sh -h                 # 帮助
#
# 离线场景: 在有网机器先 npm install + npm run build，把整个仓库目录（含 node_modules/、dist/）
#   拷到无网机器，然后 bash install.sh -l --offline ...（或远程 --offline 复用已克隆仓库）。
#   --offline 要求 dist/bin/aet.js 已存在，否则报错提示先在有网机器构建。
#
# 流程:
#   1. 依赖检查 (git / node / npm)
#   2. 定位/获取仓库 (local 或克隆到 ~/.aet/aet)
#   3. npm install → npm run build → npm link（每次都跑，确保最新；--offline 跳过前两步）
#   4. 拷贝运行时配置到 ~/.aet/
#   5. 数字选择安装插件: claude / codeagent / opencode / codex / omp
#      - claude:   claude plugin marketplace add ./dist/plugins/claude-code + claude plugin install aet@aet
#      - codeagent: codeagent plugin marketplace add ./dist/plugins/codeagent3 + codeagent plugin install aet@aet
#                   （CLI 检测 codeagent / codeagentcli / ~/codeagentcli，找不到则交互问）
#      - opencode: 把 <repo>/dist/plugins/opencode 加进 ~/.config/opencode/opencode.json
#      - codex:    codex plugin marketplace add ./dist/plugins/codex + codex plugin install aet
#      - omp:      omp marketplace add ./dist/plugins/omp + omp install aet@aet
#
# 兼容: macOS bash 3.x / Linux bash / Windows Git Bash (MSYS)。
# 插件选择是数字输入（非箭头键），tty 与管道模式一致。

set -euo pipefail

# ======================================================================
# 常量
# ======================================================================
REPO_URL_SSH="git@gitcode.com:openeuler/agentic-engineering-team.git"
REPO_URL_HTTPS="https://gitcode.com/openeuler/agentic-engineering-team.git"
INSTALL_ROOT="${INSTALL_ROOT:-$HOME/.aet}"          # 可用环境变量覆盖（便于测试）
REPO_DIR="$INSTALL_ROOT/aet"                        # 远程克隆目标
OPENCODE_CONFIG_DIR="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
OPENCODE_CONFIG="$OPENCODE_CONFIG_DIR/opencode.json"

# 插件清单 (id|名称|说明)
PLUGINS=(
  "claude|Claude Code|claude plugin marketplace add ./dist/plugins/claude-code + install aet@aet"
  "codeagent|CodeAgent3|codeagent plugin marketplace add ./dist/plugins/codeagent3 + install aet@aet"
  "opencode|OpenCode|写入 ~/.config/opencode/opencode.json 的 plugin 数组"
  "codex|Codex|codex plugin marketplace add ./dist/plugins/codex"
  "omp|omp (Oh My Pi)|omp marketplace add ./dist/plugins/omp + omp install aet@aet"
)

# ======================================================================
# 颜色 + 日志
# ======================================================================
if [ -t 1 ]; then
    RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'
    BLUE=$'\033[0;34m'; CYAN=$'\033[0;36m'; BOLD=$'\033[1m'
    DIM=$'\033[2m'; NC=$'\033[0m'
else
    RED=""; GREEN=""; YELLOW=""; BLUE=""; CYAN=""; BOLD=""; DIM=""; NC=""
fi

log_info()    { printf '%s[INFO]%s %s\n' "$BLUE" "$NC" "$*"; }
log_ok()      { printf '%s[ OK ]%s %s\n' "$GREEN" "$NC" "$*"; }
log_warn()    { printf '%s[WARN]%s %s\n' "$YELLOW" "$NC" "$*"; }
log_error()   { printf '%s[ERROR]%s %s\n' "$RED" "$NC" "$*" >&2; }

# ======================================================================
# TUI: banner / spinner / step / multi_select
# ======================================================================
banner() {
    local w=58
    local title="A E T"
    local subtitle="Agentic Engineering Team  ·  一键安装"
    local pad_l=$(( (w - ${#title}) / 2 ))
    printf '\n'
    printf '%s╭%s╮%s\n' "$CYAN" "$(printf '%*s' "$((w-2))" | tr ' ' '─')" "$NC"
    printf '%s│%*s%s%s%*s%s│%s\n' "$CYAN" "$((pad_l-1))" "" "$BOLD" "$title" "$((w - pad_l - ${#title} - 1))" "" "$CYAN" "$NC"
    pad_l=$(( (w - ${#subtitle}) / 2 ))
    printf '%s│%*s%s%s%*s%s│%s\n' "$CYAN" "$((pad_l-1))" "" "$DIM" "$subtitle" "$((w - pad_l - ${#subtitle} - 1))" "" "$CYAN" "$NC"
    printf '%s╰%s╯%s\n' "$CYAN" "$(printf '%*s' "$((w-2))" | tr ' ' '─')" "$NC"
    printf '\n'
}

# step <标题> [副标题] —— 打印编号步骤标题
step() {
    printf '\n%s▸ %s%s\n' "$CYAN" "$BOLD" "$1" "$NC"
    if [ -n "${2:-}" ]; then
        printf '  %s%s%s\n' "$DIM" "$2" "$NC"
    fi
}

# run_step <title> <cmd...> —— 标题 + spinner 包裹命令
run_step() {
    local title="$1"; shift
    printf '\n%s▸ %s%s %s... ' "$CYAN" "$BOLD" "$title" "$NC"
    local pid
    "$@" >/dev/null 2>&1 &
    pid=$!
    local i=0
    local frames=(⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏)
    while kill -0 "$pid" 2>/dev/null; do
        printf '\b%s' "${frames[$((i % 10))]}"
        i=$((i + 1))
        sleep 0.08
    done
    wait "$pid"
    local rc=$?
    if [ "$rc" -eq 0 ]; then
        printf '\b%s✓ %s\n' "$GREEN" "$NC"
        return 0
    fi
    printf '\b%s✗ %s\n' "$RED" "$NC"
    return "$rc"
}

# safe_read <prompt> <var_name> —— 读取一行用户输入。
# tty: 用 read -p；管道 (curl|bash) 或无 tty: 提示打到 stderr，从 stdin 读。
safe_read() {
    local prompt="$1" var_name="$2"
    if [ -t 0 ]; then
        read -r -p "$prompt" "$var_name"
    else
        printf '%s' "$prompt" >&2
        read -r "$var_name" || true
    fi
}

# pl_id / pl_name / pl_desc —— 解析 PLUGINS 条目 "id|名称|说明"
pl_id()   { printf '%s' "${PLUGINS[$1]%%|*}"; }
pl_name() { printf '%s' "${PLUGINS[$1]}" | cut -d'|' -f2; }
pl_desc() { printf '%s' "${PLUGINS[$1]}" | cut -d'|' -f3; }

# multi_select <var_name> —— 简单数字选择。
# 列出插件后提示"输入序号，空格分隔（a=全部，n=跳过）"，tty 与管道模式一致。
# 结果以空格分隔的 id 列表写入 $1。
multi_select() {
    local out_var="$1"
    local total="${#PLUGINS[@]}"
    local i nums result n

    printf '\n%s可安装插件:%s\n' "$BOLD" "$NC"
    for ((i=0; i<total; i++)); do
        printf '  %s%d%s) %-12s %s%s%s\n' "$CYAN" "$((i + 1))" "$NC" "$(pl_name "$i")" "$DIM" "$(pl_desc "$i")" "$NC"
    done
    printf '  %s（marketplace 类插件的手动命令请在仓库根目录执行，或用绝对路径）%s\n' "$DIM" "$NC"
    printf '\n'

    while true; do
        safe_read "选择要安装的插件序号（空格/逗号分隔，a=全部，n=跳过）[1-$total]: " nums
        nums="${nums:-a}"
        # 兼容逗号分隔: "1,3" -> "1 3"
        nums="${nums//,/ }"
        case "$nums" in
            a|A)
                for ((i=0; i<total; i++)); do result="$result $(pl_id "$i")"; done
                break ;;
            n|N)
                result=""
                break ;;
            *[!\ ]*)
                result=""
                local ok=1
                for n in $nums; do
                    case "$n" in
                        ''|*[!0-9]*) log_warn "  '$n' 不是数字（a=全部，n=跳过）"; ok=0; break ;;
                        *)
                            n="$((n - 1))"
                            if [ "$n" -ge 0 ] && [ "$n" -lt "$total" ]; then
                                result="$result $(pl_id "$n")"
                            else
                                log_warn "  序号 $((n + 1)) 超出范围"; ok=0; break
                            fi ;;
                    esac
                done
                [ "$ok" -eq 1 ] && break ;;
            *)
                log_warn "  请输入序号，a（全部）或 n（跳过）" ;;
        esac
    done

    printf -v "$out_var" '%s' "$result"
    printf '%s已选择:%s %s\n' "$GREEN" "$NC" "${result:-（无，跳过）}"
}

# ======================================================================
# Step 0: 依赖检查
# ======================================================================
check_deps() {
    local missing=0
    for cmd in git node npm; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            log_error "缺少依赖: $cmd"
            missing=1
        fi
    done
    if [ "$missing" -eq 1 ]; then
        log_error "请先安装缺失依赖后重试"
        exit 1
    fi
    log_ok "依赖检查通过 (git $(git --version | awk '{print $3}') / node $(node -v) / npm $(npm -v))"
}

# ======================================================================
# Step 1: 定位 / 获取仓库
# ======================================================================
resolve_repo() {
    if [ "$LOCAL_MODE" = true ]; then
        # 用脚本自身位置推导仓库根，不依赖调用时的工作目录：
        # 优先 BASH_SOURCE[0]（$0 在某些调用方式下是相对/改写路径），先 cd 到
        # 脚本目录再 pwd 绝对化，然后向上两级定位仓库根。这样用户从任意目录
        # 用绝对路径调用（bash /abs/path/repo/src/scripts/install.sh -l）都能
        # 正确定位，而不是基于当前 cwd 找 ./dist 之类相对路径。
        local script_src script_dir
        script_src="${BASH_SOURCE[0]:-$0}"
        script_dir="$(cd "$(dirname "$script_src")" && pwd)"
        REPO_ROOT="$(cd "$script_dir/../.." && pwd)"
        log_ok "本地模式，复用当前仓库: $REPO_ROOT"
        return 0
    fi

    if [ -d "$REPO_DIR/.git" ]; then
        log_ok "已存在仓库: $REPO_DIR"
        log_info "跳过克隆（如需更新请自行 git -C \"$REPO_DIR\" pull）"
        REPO_ROOT="$REPO_DIR"
        return 0
    fi

    log_info "克隆仓库到 $REPO_DIR ..."
    mkdir -p "$INSTALL_ROOT"
    if ! run_step "克隆仓库 (ssh)" git clone --depth 1 "$REPO_URL_SSH" "$REPO_DIR"; then
        log_warn "ssh 克隆失败，回退 https ..."
        # SSH 克隆可能在认证/传输阶段半途失败，留下非空的 $REPO_DIR（含
        # .git/ 与零散对象）。直接回退到 HTTPS 会因 "destination path
        # already exists and is not an empty directory" 而失败，所以先
        # 清空目标目录再重试 HTTPS（本地模式不经过这里，REPO_DIR 由本
        # 脚本刚创建，删了重克隆是安全的）。
        rm -rf "$REPO_DIR"
        run_step "克隆仓库 (https)" git clone --depth 1 "$REPO_URL_HTTPS" "$REPO_DIR" \
            || { log_error "克隆失败，请检查网络/凭据后重试"; exit 1; }
    fi
    REPO_ROOT="$REPO_DIR"
    log_ok "仓库就绪: $REPO_ROOT"
}

# ======================================================================
# Step 2: 安装 CLI (npm install → build → npm link)
# ======================================================================
install_cli() {
    cd "$REPO_ROOT"

    if [ "$OFFLINE_MODE" = true ]; then
        # 离线模式: 复用已在有网机器构建好的 dist/，跳过 npm install/build（二者都要网）。
        if [ ! -f dist/bin/aet.js ]; then
            log_error "离线模式要求 dist/bin/aet.js 已存在，但未找到"
            log_error "请先在有网机器执行 npm install + npm run build，再把整个仓库目录（含 node_modules/、dist/）拷到本机"
            exit 1
        fi
        log_ok "离线模式，复用已构建的 dist/ (跳过 npm install / build)"
    else
        # 在线: 每次都 npm install + build，确保依赖与 dist 是最新（覆盖旧 dist）。
        run_step "安装依赖 npm install" npm install --no-fund --no-audit \
            || { log_error "npm install 失败"; exit 1; }

        run_step "构建 dist npm run build" npm run build \
            || { log_error "npm run build 失败"; exit 1; }
    fi

    # npm link 是纯本地符号链接，不要网络，在线/离线都执行。
    run_step "全局链接 npm link" npm link \
        || { log_error "npm link 失败"; exit 1; }

    if command -v aet >/dev/null 2>&1; then
        log_ok "aet 已可用: $(command -v aet) ($(aet --version 2>/dev/null || echo '?'))"
    else
        log_warn "aet 未在 PATH 上"
        log_warn "请确认 npm 全局 bin 目录已加入 PATH（查询: npm config get prefix）"
    fi
}

# ======================================================================
# Step 3: 拷贝运行时配置到 ~/.aet/
# ======================================================================
# 全局配置（repository.json，含 token）不再由本脚本拷贝到特殊路径
# ~/.aet/config.json。它由 aet-install skill 的 /init 流程经 runtime 同步
# 拷入 ~/.aet/config/repository.json（runtime-meta whitelist 保护，永不覆盖）。
# 这里只拷贝 workflow.json（运行期实际生效副本，~/.aet/config/workflow.json）。
install_configs() {
    local src_workflow="$REPO_ROOT/src/config/workflow.json"
    local dst_dir="$INSTALL_ROOT"
    local dst_workflow="$dst_dir/config/workflow.json"

    # workflow.json 是运行期实际生效副本（~/.aet/config/workflow.json），
    # 源缺失则跳过；目标已存在时询问是否覆盖（默认保留，避免覆盖用户改动）。
    if [ ! -f "$src_workflow" ]; then
        log_warn "工作流配置源缺失（跳过）: $src_workflow"
        return 0
    fi
    mkdir -p "$dst_dir/config"

    if [ -f "$dst_workflow" ]; then
        local answer=""
        safe_read "目标已存在 ${dst_workflow}，是否覆盖？[y/N]: " answer
        case "$answer" in
            y|Y|yes|YES)
                cp "$src_workflow" "$dst_workflow"
                log_ok "已覆盖: $dst_workflow"
                ;;
            *)
                log_info "保留现有配置: $dst_workflow"
                ;;
        esac
    else
        cp "$src_workflow" "$dst_workflow"
        log_ok "已创建: $dst_workflow"
    fi
}

# ======================================================================
# Step 4: 插件安装
# ======================================================================
# opencode JSON 合并：把 $2（绝对路径）加入 $1（json 文件）的 plugin 数组
# 文件不存在则新建; 路径已存在则跳过。用 node 保证 JSON 正确性。
opencode_add_plugin() {
    local cfg="$1" plugin_path="$2"
    # 用 node 保证 JSON 正确性。成功时把绝对路径打到 stdout（由调用方
    # $(...) 捕获进 added）；失败时（如现有 opencode.json 是 jsonc 含
    # 注释/尾随逗号或损坏）把干净的诊断打到 stderr 并以非零退出，让
    # 调用方的 `|| return 1` 触发——避免 JSON.parse 抛出的原始栈跟踪
    # 在命令替换中丢失，用户看不到 opencode 安装失败的原因。
    node -e '
        const fs = require("fs");
        const [cfg, pluginPath] = process.argv.slice(1);
        let obj = {};
        if (fs.existsSync(cfg)) {
            const raw = fs.readFileSync(cfg, "utf8");
            try {
                obj = JSON.parse(raw);
            } catch (e) {
                console.error("opencode.json 解析失败: " + e.message);
                console.error("  路径: " + cfg);
                console.error("  若文件是 jsonc（含注释/尾随逗号），请手动把以下路径加入 plugin 数组:");
                console.error("  " + pluginPath);
                process.exit(1);
            }
        }
        if (!Array.isArray(obj.plugin)) obj.plugin = [];
        const abs = require("path").resolve(pluginPath);
        if (!obj.plugin.includes(abs)) obj.plugin.push(abs);
        fs.mkdirSync(require("path").dirname(cfg), { recursive: true });
        fs.writeFileSync(cfg, JSON.stringify(obj, null, 2) + "\n");
        console.log(abs);
    ' "$cfg" "$plugin_path"
}

install_claude() {
    command -v claude >/dev/null 2>&1 || { log_warn "未检测到 claude CLI，跳过"; return 1; }
    local target="$REPO_ROOT/dist/plugins/claude-code"
    if [ ! -d "$target" ]; then
        log_warn "插件目录缺失: ${target}（先确保 dist 已构建）"
        return 1
    fi
    # CC 插件树自带 .claude-plugin/marketplace.json（build 时自主生成），
    # 把它作为 marketplace 根注册，再按名安装 aet 插件。
    run_step "注册 marketplace" claude plugin marketplace add "$target" || return 1
    run_step "安装插件 aet@aet" claude plugin install aet@aet || return 1
    log_ok "Claude Code 插件已安装"
}

install_codeagent() {
    local target="$REPO_ROOT/dist/plugins/codeagent3"
    if [ ! -d "$target" ]; then
        log_warn "插件目录缺失: ${target}（先确保 dist 已构建）"
        return 1
    fi

    # CodeAgent 与 claude/codex 对齐，走 marketplace 安装：插件树自带
    # .cac-plugin/marketplace.json（build 时自主生成），注册为 marketplace
    # 后按名安装 aet 插件。只需检测 CodeAgent CLI 存在即可。
    # CLI 候选：PATH 里的 codeagent / codeagentcli，降级 ~/codeagentcli 二进制。
    local cli=""
    if command -v codeagent >/dev/null 2>&1; then
        cli="codeagent"
    elif command -v codeagentcli >/dev/null 2>&1; then
        cli="codeagentcli"
    elif [ -x "$HOME/codeagentcli" ]; then
        cli="$HOME/codeagentcli"
    fi
    if [ -z "$cli" ]; then
        log_warn "未检测到 CodeAgent CLI（codeagent / codeagentcli / ~/codeagentcli 均不存在）"
        local custom=""
        safe_read "请输入 codeagent CLI 路径（回车跳过 codeagent）: " custom
        if [ -z "$custom" ]; then
            log_info "跳过 codeagent 安装"
            return 1
        fi
        custom="${custom/#\~/$HOME}"
        if [ ! -x "$custom" ]; then
            log_warn "不是可执行文件: $custom"
            return 1
        fi
        cli="$custom"
    fi

    run_step "注册 marketplace" "$cli" plugin marketplace add "$target" || return 1
    run_step "安装插件 aet@aet" "$cli" plugin install aet@aet || return 1
    log_ok "CodeAgent3 插件已安装"
}

install_opencode() {
    command -v opencode >/dev/null 2>&1 || { log_warn "未检测到 opencode CLI，跳过"; return 1; }
    local target="$REPO_ROOT/dist/plugins/opencode"
    if [ ! -d "$target" ]; then
        log_warn "插件目录缺失: ${target}（先确保 dist 已构建）"
        return 1
    fi
    if [ ! -f "$OPENCODE_CONFIG" ] && [ -f "$OPENCODE_CONFIG_DIR/opencode.jsonc" ]; then
        log_warn "存在 $OPENCODE_CONFIG_DIR/opencode.jsonc 但无 opencode.json"
        log_warn "请手动把 \"$target\" 加进 opencode.jsonc 的 plugin 数组"
        return 1
    fi
    local added
    added="$(opencode_add_plugin "$OPENCODE_CONFIG" "$target")" || return 1
    log_ok "已把插件目录写入 opencode.json: $added"
}

install_codex() {
    command -v codex >/dev/null 2>&1 || { log_warn "未检测到 codex CLI，跳过"; return 1; }
    local target="$REPO_ROOT/dist/plugins/codex"
    if [ ! -d "$target" ]; then
        log_warn "插件目录缺失: ${target}（先确保 dist 已构建）"
        return 1
    fi
    run_step "注册 marketplace" codex plugin marketplace add "$target" || return 1
    run_step "安装插件 aet" codex plugin install aet || return 1
    log_ok "Codex 插件已安装"
}

install_omp() {
    command -v omp >/dev/null 2>&1 || { log_warn "未检测到 omp CLI，跳过"; return 1; }
    local target="$REPO_ROOT/dist/plugins/omp"
    if [ ! -d "$target" ]; then
        log_warn "插件目录缺失: ${target}（先确保 dist 已构建）"
        return 1
    fi
    # omp 的 marketplace 复用 Claude Code 格式：catalog 在插件树内的
    # .claude-plugin/marketplace.json（build 时自主生成）。注册该目录为
    # marketplace 后按名安装 aet 插件。
    run_step "注册 marketplace" omp marketplace add "$target" || return 1
    run_step "安装插件 aet@aet" omp install aet@aet || return 1
    log_ok "omp 插件已安装"
}

# ======================================================================
# Step 5: 总结
# ======================================================================
summary() {
    local installed="$1" skipped="$2"
    printf '\n%s──────────────────────────────────────────────%s\n' "$GREEN" "$NC"
    printf '%s%s AET 安装完成 %s%s\n' "$GREEN" "$BOLD" "$NC" "$NC"
    printf '%s──────────────────────────────────────────────%s\n' "$GREEN" "$NC"
    if [ -n "$installed" ]; then
        printf '  已安装插件: %s\n' "$installed"
    else
        printf '  未安装任何插件\n'
    fi
    if [ -n "$skipped" ]; then
        printf '  跳过: %s\n' "$skipped"
    fi
    printf '\n'
    printf '%s下一步:%s\n' "$BOLD" "$NC"
    printf '  · 编辑 ~/.aet/config/repository.json 填写 platform token\n'
    printf '    (支持 ${ATOMGIT_TOKEN} / ${GITHUB_TOKEN} / ${GITLAB_TOKEN} 环境变量引用)\n'
    printf '  · 重启 claude / codeagent / opencode / codex / omp 使插件生效\n'
    printf '  · 首次进入项目时 SessionStart 钩子自动生成斜杠命令\n'
    printf '\n%s想卸载？%s\n' "$BOLD" "$NC"
    printf '  · aet CLI:    npm unlink -g aet-cli\n'
    printf '  · claude:     claude plugin uninstall aet@aet\n'
    printf '  · codeagent:  codeagent plugin uninstall aet@aet\n'
    printf '  · opencode:   从 opencode.json 的 plugin 数组移除该路径\n'
    printf '  · codex:      codex plugin uninstall aet\n'
    printf '  · omp:        omp uninstall aet\n'
    printf '\n'
}

# ======================================================================
# 参数解析
# ======================================================================
usage() {
    sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
}

LOCAL_MODE=false
OFFLINE_MODE=false
PLUGIN_ARG=""

while [ "$#" -gt 0 ]; do
    case "$1" in
        -l|--local) LOCAL_MODE=true ;;
        --offline) OFFLINE_MODE=true ;;
        --plugins)
            shift
            [ "$#" -gt 0 ] || { log_error "--plugins 需要一个值"; exit 1; }
            PLUGIN_ARG="$1"
            ;;
        -h|--help) usage ;;
        *) log_warn "未知参数: $1（-h 查看帮助）" ;;
    esac
    shift
done

# ======================================================================
# 主流程
# ======================================================================
main() {
    banner
    step "[1/5] 依赖检查";      check_deps
    step "[2/5] 定位仓库";      resolve_repo
    step "[3/5] 安装 AET CLI";  install_cli
    step "[4/5] 运行时配置";    install_configs

    # ---- 插件选择 ----
    printf '\n%s▸ %s[5/5] 插件安装%s\n' "$CYAN" "$BOLD" "$NC"
    local picked=""
    if [ -n "$PLUGIN_ARG" ]; then
        # 兼容逗号/空格分隔: claude,opencode 或 claude opencode
        picked="${PLUGIN_ARG//,/ }"
        printf '  %s非交互指定插件: %s%s\n' "$GREEN" "$NC" "$picked"
    else
        multi_select picked
    fi

    local installed="" skipped=""
    local id
    for id in $picked; do
        case "$id" in
            claude)   if install_claude; then installed="$installed claude"; else skipped="$skipped claude"; fi ;;
            codeagent) if install_codeagent; then installed="$installed codeagent"; else skipped="$skipped codeagent"; fi ;;
            opencode) if install_opencode; then installed="$installed opencode"; else skipped="$skipped opencode"; fi ;;
            codex)    if install_codex; then installed="$installed codex"; else skipped="$skipped codex"; fi ;;
            omp)      if install_omp; then installed="$installed omp"; else skipped="$skipped omp"; fi ;;
            *) log_warn "未知插件: ${id}（可选项: claude codeagent opencode codex omp）" ;;
        esac
    done

    summary "$installed" "$skipped"
}

main "$@"
