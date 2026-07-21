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

# 依赖检查
check_dependencies() {
    log_info "检查依赖..."
    
    if ! command -v git >/dev/null 2>&1; then
        log_error "未找到 git，请先安装 git"
    fi
    
    if ! command -v curl >/dev/null 2>&1 && ! command -v wget >/dev/null 2>&1; then
        log_error "未找到 curl 或 wget，请先安装其中之一"
    fi
    
    log_success "依赖检查通过"
}

# 下载源代码
download_source() {
    local repo="https://atomgit.com/openeuler/agentic-engineering-team.git"
    local target="$HOME/.config/opencode/aet"
    
    log_info "下载源代码..."
    
    if [ -d "$target" ]; then
        log_info "目录已存在，拉取最新代码..."
        cd "$target" || log_error "无法进入目录 $target"
        git pull origin main || log_error "拉取代码失败"
    else
        log_info "克隆仓库..."
        git clone "$repo" "$target" || log_error "克隆仓库失败"
    fi
    
    log_success "源代码下载完成"
}

# 创建符号链接
create_symlinks() {
    local aet_dir="$HOME/.config/opencode/aet"
    
    log_info "创建符号链接..."
    
    # 创建插件目录
    mkdir -p "$HOME/.config/opencode/plugins" || log_error "无法创建插件目录"
    
    # 创建插件符号链接
    ln -sf "$aet_dir/.opencode/plugins/aet.js" "$HOME/.config/opencode/plugins/aet.js" || \
        log_error "无法创建插件符号链接"
    
    # 创建 skills 目录
    mkdir -p "$HOME/.config/opencode/skills" || log_error "无法创建 skills 目录"
    
    # 创建 skills 符号链接
    ln -sf "$aet_dir/skills" "$HOME/.config/opencode/skills/aet" || \
        log_error "无法创建 skills 符号链接"
    
    log_success "符号链接创建完成"
}

# 验证安装
verify_installation() {
    log_info "验证安装..."
    
    if [ ! -f "$HOME/.config/opencode/plugins/aet.js" ]; then
        log_error "插件链接不存在"
    fi
    
    if [ ! -d "$HOME/.config/opencode/skills/aet" ]; then
        log_error "skills 链接不存在"
    fi
    
    log_success "安装验证通过"
}

# 检查是否已安装
check_installed() {
    if [ ! -d "$HOME/.config/opencode/aet" ]; then
        log_error "AET 未安装，请先运行 install.sh"
    fi
    log_success "AET 已安装"
}

# 备份当前版本
backup_current() {
    local backup_dir="$HOME/.config/opencode/aet.backup.$(date +%Y%m%d%H%M%S)"
    
    log_info "备份当前版本..."
    
    cp -r "$HOME/.config/opencode/aet" "$backup_dir" || \
        log_error "备份失败"
    
    log_success "已备份到 $backup_dir"
}

# 拉取最新代码
pull_latest() {
    log_info "拉取最新代码..."
    
    cd "$HOME/.config/opencode/aet" || log_error "无法进入 AET 目录"
    git fetch origin || log_error "获取远程代码失败"
    git reset --hard origin/main || log_error "重置到最新版本失败"
    
    log_success "代码更新完成"
}

# 恢复配置
restore_config() {
    log_info "符号链接已保持，无需恢复配置"
}

# 验证升级
verify_upgrade() {
    verify_installation
}