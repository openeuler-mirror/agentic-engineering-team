# ===== IEX/管道模式支持 =====
# 不使用 param() 块（irm | iex 时 param() 会导致解析错误）
# 手动解析 $args 同时兼容 -File 和 iex 两种调用方式
$Local = $false
$Help = $false

foreach ($a in $args) {
    if ($a -eq '-Local') { $Local = $true }
    if ($a -eq '-Help')  { $Help = $true }
}

# 检测是否通过 iex (Invoke-Expression) 调用
$IS_IEX_MODE = [string]::IsNullOrEmpty($PSScriptRoot) -or [string]::IsNullOrEmpty($MyInvocation.MyCommand.Path)

$AET_DIR = Join-Path $env:USERPROFILE ".config\opencode\aet"

function log_info { Write-Host "[INFO] $args" -ForegroundColor Blue }
function log_success { Write-Host "[SUCCESS] $args" -ForegroundColor Green }
function log_error { Write-Host "[ERROR] $args" -ForegroundColor Red; exit 1 }

function show_help {
    Write-Host "AET 安装脚本"
    Write-Host ""
    Write-Host "用法:"
    Write-Host "  powershell -ExecutionPolicy Bypass -File install.ps1 [选项]"
    Write-Host "  iex (irm `"<api-raw-url>`")   # 一行安装（URL 用引号包裹）"
    Write-Host ""
    Write-Host "选项:"
    Write-Host "  -Local     使用本地源代码安装（开发模式）"
    Write-Host "  -Help      显示帮助信息"
    Write-Host ""
    Write-Host "示例:"
    Write-Host "  powershell -File install.ps1                        # 从远程仓库安装"
    Write-Host "  powershell -File install.ps1 -Local                 # 使用本地代码安装（开发模式）"
    Write-Host "  iex (irm https://raw.atomgit.com/openeuler/agentic-engineering-team/raw/master/scripts/install.ps1)           # 一行安装（Windows）"
    exit 0
}

if ($Help) { show_help }

# IEX 模式下 -Local 无意义（远程来源），降级为远程安装并提示
if ($IS_IEX_MODE -and $Local) {
    Write-Host "[WARNING] IEX 模式下不支持 -Local 参数，将执行远程安装" -ForegroundColor Yellow
    $Local = $false
}

# 依赖检查
function check_dependencies {
    log_info "检查依赖..."
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { log_error "未找到 git，请先安装 git" }
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { log_error "未找到 Node.js，请先安装 Node.js`n       AET 插件需要 Node.js 才能运行" }
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { log_error "未找到 npm，请先安装 Node.js（npm 会随 Node.js 安装）" }
    log_success "依赖检查通过"
}

# 安装 graphify（可选工具，失败不影响主安装）
function install_graphify {
    if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
        Write-Host "[提示] 未找到 Python，跳过 graphify 安装" -ForegroundColor Yellow
        Write-Host "         请先安装 Python: https://python.org" -ForegroundColor Yellow
        return
    }
    log_info "安装 graphify（项目分析工具）到 venv..."
    $venvDir = Join-Path $env:USERPROFILE ".aet\venv"
    if (-not (Test-Path $venvDir)) {
        New-Item -ItemType Directory -Path $venvDir -Force | Out-Null
    }
    python -m venv $venvDir
    $venvPip = Join-Path $venvDir "Scripts\pip.exe"
    if (-not (Test-Path $venvPip)) {
        log_error "venv pip 不存在: $venvPip"
        return
    }
    & $venvPip install graphifyy
    if ($LASTEXITCODE -eq 0) {
        log_success "graphify 安装成功"
        Write-Host "         项目分析功能已就绪" -ForegroundColor Green
    } else {
        Write-Host "[提示] graphify 安装失败，但不影响 AET 正常使用" -ForegroundColor Yellow
        Write-Host "         您可以稍后手动安装: pip install graphifyy" -ForegroundColor Yellow
    }
}

# 下载源代码（远程安装）
function download_source {
    log_info "下载源代码..."
    if (Test-Path $AET_DIR) {
        log_info "目录已存在，删除旧目录..."
        Remove-Item -Recurse -Force $AET_DIR
    }
    log_info "克隆仓库..."
    git clone "https://atomgit.com/openeuler/agentic-engineering-team.git" $AET_DIR
    if (-not $?) { log_error "克隆仓库失败" }
    log_success "源代码下载完成"
}

# 设置本地源目录（本地安装）
function setup_local_source {
    $currentDir = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { Get-Location }
    if (-not (Test-Path (Join-Path $currentDir ".opencode\plugins\aet.js"))) {
        log_error "本地目录不是有效的 AET 项目: $currentDir`n请确保在 AET 项目根目录下运行此脚本"
    }
    log_info "使用本地源代码: $currentDir"
    $target = $AET_DIR
    if (Test-Path $target) {
        $resolvedTarget = (Get-Item $target).Target
        if ($resolvedTarget -and (Compare-Object @($resolvedTarget) @($currentDir)).Length -eq 0) {
            log_info "已使用相同目录，跳过链接步骤"
        } else {
            log_info "目录已存在，删除旧目录..."
            Remove-Item -Recurse -Force $target
            if (-not (safe_symlink $target $currentDir)) { log_error "无法创建目录链接" }
            log_success "使用符号链接连接到本地源代码"
        }
    } else {
        if (-not (safe_symlink $target $currentDir)) { log_error "无法创建目录链接" }
        log_success "使用符号链接连接到本地源代码"
    }
    return $currentDir
}

# 安全创建符号链接
# 命令名使用连字符（如 aet-pr.md），不再包含冒号，避免 NTFS 冒号限制
function safe_symlink {
    param([string]$Path, [string]$Target)
    New-Item -ItemType SymbolicLink -Path $Path -Target $Target -Force -ErrorAction SilentlyContinue | Out-Null
    if ($?) { return $true }
    Write-Host "[WARNING] 符号链接需要管理员权限，降级为复制文件: $(Split-Path $Path -Leaf)" -ForegroundColor Yellow
    Write-Host "         启用 Windows 开发人员模式可免管理员权限创建符号链接" -ForegroundColor Yellow
    if (Test-Path $Path) { Remove-Item -Force $Path }
    if (Test-Path -PathType Container $Target) {
        Copy-Item -Recurse -Force $Target $Path
    } else {
        Copy-Item -Force $Target $Path
    }
    return $?
}

# 创建插件和 skills 目录
function create_directories {
    log_info "创建插件和 skills 目录..."
    $pluginsDir = Join-Path $env:USERPROFILE ".config\opencode\plugins"
    $skillsDir = Join-Path $env:USERPROFILE ".config\opencode\skills"
    New-Item -ItemType Directory -Force -Path $pluginsDir | Out-Null
    $pluginDst = Join-Path $pluginsDir "aet.js"
    $pluginSrc = Join-Path $AET_DIR ".opencode\plugins\aet.js"
    if (Test-Path $pluginDst) { Remove-Item $pluginDst -Force }
    if (-not (safe_symlink $pluginDst $pluginSrc)) { log_error "无法创建插件链接" }
    New-Item -ItemType Directory -Force -Path $skillsDir | Out-Null
    $aetSkillsDir = Join-Path $skillsDir "aet"
    if (Test-Path $aetSkillsDir) { Remove-Item -Recurse -Force $aetSkillsDir }
    New-Item -ItemType Directory -Force -Path $aetSkillsDir | Out-Null
    $skillsSrcDir = Join-Path $AET_DIR "skills"
    if (Test-Path $skillsSrcDir) { Copy-Item -Recurse "$skillsSrcDir\*" $aetSkillsDir }
    log_success "目录创建完成"
}

# 创建 commands 目录的符号链接
function create_commands_symlinks {
    $commandsDir = Join-Path $env:USERPROFILE ".config\opencode\commands"
    New-Item -ItemType Directory -Force -Path $commandsDir | Out-Null
    $cmdsDir = Join-Path $AET_DIR "commands"
    if (Test-Path $cmdsDir) {
        Get-ChildItem "$cmdsDir\*.md" | ForEach-Object {
            $linkName = "aet-$($_.Name)"
            $linkPath = Join-Path $commandsDir $linkName
            $ok = safe_symlink $linkPath $_.FullName
            if (-not $ok) {
                Write-Host "[WARNING] 命令链接创建失败: $linkName" -ForegroundColor Yellow
            }
        }
        log_success "commands 符号链接创建完成"
    } else {
        log_error "commands 目录不存在: $cmdsDir"
    }
}

# 全局配置初始化
function init_global_config {
    log_info "检查全局配置..."
    $globalConfigFile = Join-Path $env:USERPROFILE ".aet\config.json"
    $forceReconfigure = $false
    if (Test-Path $globalConfigFile) {
        log_info "全局配置已存在: $globalConfigFile"
        Write-Host ""
        Write-Host "[提示] 全局配置已存在" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "选项:" -ForegroundColor Yellow
        Write-Host "  1. 重新配置（可添加/修改平台 Token）"
        Write-Host "  2. 跳过（保留现有配置，继续安装）"
        $configChoice = Read-Host "请选择 (1/2)"
        if ($configChoice -eq "1") { $forceReconfigure = $true }
        else { log_info "跳过全局配置重新配置，保留现有 Token" }
    }
    $initScript = $null
    $psScriptRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Get-Location }
    $initPaths = @(
        (Join-Path $AET_DIR "scripts\init-global-config.ps1"),
        (Join-Path $psScriptRoot "init-global-config.ps1")
    )
    foreach ($s in $initPaths) {
        if (Test-Path $s) { $initScript = $s; break }
    }
    if (-not $initScript) { log_error "全局配置初始化脚本不存在" }
    if ($forceReconfigure) {
        & $initScript -Force
    } else {
        & $initScript
    }
    if (-not $?) { log_error "全局配置初始化失败" }
    log_success "全局配置初始化完成"
}

# 验证安装
function verify_installation {
    log_info "验证安装..."
    $pluginFile = Join-Path $env:USERPROFILE ".config\opencode\plugins\aet.js"
    $skillsDir = Join-Path $env:USERPROFILE ".config\opencode\skills\aet"
    $commandsDir = Join-Path $env:USERPROFILE ".config\opencode\commands"
    if (-not (Test-Path $pluginFile)) { log_error "插件链接不存在" }
    if (-not (Test-Path $skillsDir)) { log_error "skills 链接不存在" }
    if (-not (Test-Path $commandsDir)) { log_error "commands 目录不存在" }
    log_success "安装验证通过"
}

log_info "开始安装 AET..."
check_dependencies

if ($Local) {
    log_info "模式: 本地安装（开发模式）"
    $sourceDir = setup_local_source
    create_directories
    create_commands_symlinks
} else {
    log_info "模式: 远程安装"
    download_source
    create_directories
    create_commands_symlinks
}

verify_installation
install_graphify
init_global_config

log_success "AET 安装成功！"
Write-Host ""
Write-Host "您现在可以使用 AET 了！"
