function log_info { Write-Host "[INFO] $args" -ForegroundColor Blue }
function log_success { Write-Host "[SUCCESS] $args" -ForegroundColor Green }
function log_error { Write-Host "[ERROR] $args" -ForegroundColor Red; exit 1 }

function check_dependencies {
    log_info "检查依赖..."
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { log_error "未找到 git，请先安装 git" }
    if (-not (Get-Command curl -ErrorAction SilentlyContinue) -and -not (Get-Command wget -ErrorAction SilentlyContinue)) {
        log_error "未找到 curl 或 wget，请安装其中之一"
    }
    log_success "依赖检查通过"
}

function download_source {
    param([string]$TargetDir)
    $repo = "https://atomgit.com/openeuler/agentic-engineering-team.git"
    log_info "下载源代码..."
    if (Test-Path $TargetDir) {
        log_info "目录已存在，拉取最新代码..."
        Push-Location $TargetDir
        git pull origin main
        if (-not $?) { log_error "拉取代码失败" }
        Pop-Location
    } else {
        log_info "克隆仓库..."
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $TargetDir) | Out-Null
        git clone $repo $TargetDir
        if (-not $?) { log_error "克隆仓库失败" }
    }
    log_success "源代码下载完成"
}

function create_symlinks {
    param([string]$AetDir)
    log_info "创建符号链接..."
    $pluginsDir = Join-Path $env:USERPROFILE ".config\opencode\plugins"
    $skillsDir = Join-Path $env:USERPROFILE ".config\opencode\skills"
    New-Item -ItemType Directory -Force -Path $pluginsDir | Out-Null
    New-Item -ItemType Directory -Force -Path $skillsDir | Out-Null
    $pluginDst = Join-Path $pluginsDir "aet.js"
    if (Test-Path $pluginDst) { Remove-Item $pluginDst -Force }
    New-Item -ItemType SymbolicLink -Path $pluginDst -Target (Join-Path $AetDir ".opencode\plugins\aet.js") | Out-Null
    if (-not $?) { log_error "无法创建插件符号链接" }
    $skillsDst = Join-Path $skillsDir "aet"
    if (Test-Path $skillsDst) { Remove-Item -Recurse -Force $skillsDst }
    New-Item -ItemType SymbolicLink -Path $skillsDst -Target (Join-Path $AetDir "skills") | Out-Null
    if (-not $?) { log_error "无法创建 skills 符号链接" }
    log_success "符号链接创建完成"
}

function verify_installation {
    log_info "验证安装..."
    $checkPaths = @(
        (Join-Path $env:USERPROFILE ".config\opencode\plugins\aet.js"),
        (Join-Path $env:USERPROFILE ".config\opencode\skills\aet")
    )
    foreach ($p in $checkPaths) {
        if (-not (Test-Path $p)) { log_error "路径不存在: $p" }
    }
    log_success "验证通过"
}

function check_installed {
    $aetDir = Join-Path $env:USERPROFILE ".config\opencode\aet"
    if (-not (Test-Path $aetDir)) { log_error "AET 未安装，请先运行 install.ps1" }
    log_success "AET 已安装"
}

function backup_current {
    $ts = Get-Date -Format "yyyyMMddHHmmss"
    $backupDir = Join-Path $env:USERPROFILE ".config\opencode\aet.backup.$ts"
    log_info "备份当前版本..."
    Copy-Item -Recurse (Join-Path $env:USERPROFILE ".config\opencode\aet") $backupDir
    if (-not $?) { log_error "备份失败" }
    log_success "已备份到 $backupDir"
}

function pull_latest {
    log_info "拉取最新代码..."
    $aetDir = Join-Path $env:USERPROFILE ".config\opencode\aet"
    Push-Location $aetDir
    git fetch origin
    if (-not $?) { log_error "获取远程代码失败" }
    git reset --hard origin/main
    if (-not $?) { log_error "重置到最新版本失败" }
    Pop-Location
    log_success "代码更新完成"
}

function restore_config {
    log_info "符号链接已保持，无需恢复配置"
}

function verify_upgrade {
    verify_installation
}
