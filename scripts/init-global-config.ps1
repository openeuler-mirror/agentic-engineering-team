param(
    [switch]$SkipToken,
    [switch]$Force,
    [string]$Token = "",
    [string]$Platform = "",
    [switch]$Help
)

$GITCODE_TOKEN = ""
$GITHUB_TOKEN = ""
$GITLAB_TOKEN = ""

function log_info { Write-Host "[INFO] $args" -ForegroundColor Blue }
function log_success { Write-Host "[SUCCESS] $args" -ForegroundColor Green }
function log_warning { Write-Host "[WARNING] $args" -ForegroundColor Yellow }
function log_error { Write-Host "[ERROR] $args" -ForegroundColor Red; exit 1 }

# AET 项目根目录（脚本在 scripts/ 下，上一级即为根目录）
# 兼容 iex 模式：$PSScriptRoot 为 null 时从脚本路径推算
$AET_DIR = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Definition }
$GLOBAL_CONFIG_DIR = Join-Path $env:USERPROFILE ".aet"
$GLOBAL_CONFIG_FILE = Join-Path $GLOBAL_CONFIG_DIR "config.json"
$TEMPLATES_DIR = Join-Path $GLOBAL_CONFIG_DIR "templates"
$WORKFLOW_TEMPLATE_FILE = Join-Path $TEMPLATES_DIR "workflow.json"
$STANDARDS_DEST_DIR = Join-Path $GLOBAL_CONFIG_DIR "implement\aet\language-standards"
$GLOBAL_CONFIG_TEMPLATE = Join-Path $AET_DIR "scripts\templates\global-config-template.json"
$WORKFLOW_TEMPLATE_SOURCE = Join-Path $AET_DIR "scripts\templates\workflow-template.json"
$STANDARDS_SOURCE_DIR = Join-Path $AET_DIR "scripts\templates\language-standards"

function show_help {
    Write-Host @"
AET 全局配置初始化脚本

用法: powershell -File init-global-config.ps1 [选项]

选项:
  -SkipToken              跳过所有 Token 配置
  -Token VALUE            配置指定平台的 Token（需配合 -Platform）
  -Platform TYPE          设置平台类型（gitcode/github/gitlab）
  -Force                  强制重新配置（跳过存在确认询问）
  -Help                   显示帮助信息

支持的平台:
  gitcode  - AtomGit/GitCode
  github   - GitHub
  gitlab   - GitLab

输出文件:
  ~/.aet/config.json              全局配置（Token 等，永不覆盖）
  ~/.aet/templates/workflow.json  工作流模板（可覆盖更新）

示例:
  powershell -File init-global-config.ps1                                    # 交互式配置
  powershell -File init-global-config.ps1 -SkipToken                         # 跳过所有 Token 配置
  powershell -File init-global-config.ps1 -Token %ATOMGIT_TOKEN% -Platform gitcode  # 配置 GitCode Token
  powershell -File init-global-config.ps1 -Force                             # 强制重新配置
"@
    exit 0
}

if ($Help) { show_help }

function configure_platform_token {
    param([string]$platform)
    $envVarName = ""; $alreadyConfigured = $false
    switch ($platform) {
        "gitcode" { $envVarName = "ATOMGIT_TOKEN"; if ($GITCODE_TOKEN) { $alreadyConfigured = $true } }
        "github"  { $envVarName = "GITHUB_TOKEN";  if ($GITHUB_TOKEN)  { $alreadyConfigured = $true } }
        "gitlab"  { $envVarName = "GITLAB_TOKEN";  if ($GITLAB_TOKEN)  { $alreadyConfigured = $true } }
    }
    if ($alreadyConfigured) {
        $reconfigure = Read-Host "$platform 已配置，是否重新配置？(y/n)"
        if ($reconfigure -ne "y") { log_info "保留 ${platform} 的现有配置"; return }
    }
    Write-Host "配置 ${platform} 平台 Token：" -ForegroundColor Yellow
    Write-Host "  1. 直接输入 Token 值"
    Write-Host "  2. 使用环境变量引用（推荐）"
    Write-Host "  3. 跳过此平台"
    $method = Read-Host "请选择 (1-3)"
    switch ($method) {
        "1" {
            $input = Read-Host "请输入 ${platform} Token 值"
            switch ($platform) {
                "gitcode" { $GITCODE_TOKEN = $input }
                "github"  { $GITHUB_TOKEN = $input }
                "gitlab"  { $GITLAB_TOKEN = $input }
            }
            log_success "${platform} Token 已配置"
        }
        "2" {
            $envVar = Read-Host "请输入环境变量名（默认 $envVarName）"
            if ([string]::IsNullOrEmpty($envVar)) { $envVar = $envVarName }
            $tokenRef = "`${$envVar}"
            switch ($platform) {
                "gitcode" { $GITCODE_TOKEN = $tokenRef }
                "github"  { $GITHUB_TOKEN = $tokenRef }
                "gitlab"  { $GITLAB_TOKEN = $tokenRef }
            }
            log_success "${platform} Token 配置为环境变量引用：${tokenRef}"
            log_info "请确保设置环境变量：`$env:${envVar}=<your-token>"
        }
        "3" { log_info "跳过 ${platform} Token 配置" }
    }
}

function interactive_ask {
    log_info "开始配置全局配置..."
    if (-not $SkipToken) {
        $continue = $true
        while ($continue) {
            Write-Host "`n请选择要配置的平台 Token：" -ForegroundColor Yellow
            $i = 1
            $platforms = @("gitcode", "github", "gitlab")
            $names = @("GitCode/AtomGit", "GitHub", "GitLab")
            for ($idx = 0; $idx -lt $platforms.Length; $idx++) {
                $status = ""
                $p = $platforms[$idx]
                switch ($p) {
                    "gitcode" { if ($GITCODE_TOKEN) { $status = " (已配置)" } }
                    "github"  { if ($GITHUB_TOKEN)  { $status = " (已配置)" } }
                    "gitlab"  { if ($GITLAB_TOKEN)  { $status = " (已配置)" } }
                }
                Write-Host "  $($idx+1). $($names[$idx])$status"
            }
            Write-Host "  4. 完成配置（退出）"
            $choice = Read-Host "请输入选项编号 (1-4)"
            switch ($choice) {
                "1" { configure_platform_token "gitcode" }
                "2" { configure_platform_token "github" }
                "3" { configure_platform_token "gitlab" }
                "4" { $continue = $false }
                default { Write-Host "无效选项" }
            }
        }
        log_success "Token 配置完成"
    }
}

function read_token_from_file {
    param([string]$platform)
    if (-not (Test-Path $GLOBAL_CONFIG_FILE)) { return "" }
    try {
        $config = Get-Content $GLOBAL_CONFIG_FILE -Raw | ConvertFrom-Json
        if ($config.codePlatform.platforms.$platform.token) {
            return $config.codePlatform.platforms.$platform.token
        }
    } catch {}
    return ""
}

function generate_config {
    if (-not (Test-Path $GLOBAL_CONFIG_TEMPLATE)) {
        log_error "全局配置模板文件不存在: $GLOBAL_CONFIG_TEMPLATE"
    }
    $template = Get-Content $GLOBAL_CONFIG_TEMPLATE -Raw | ConvertFrom-Json
    $template.codePlatform.platforms.gitcode.token = $GITCODE_TOKEN
    $template.codePlatform.platforms.github.token = $GITHUB_TOKEN
    $template.codePlatform.platforms.gitlab.token = $GITLAB_TOKEN
    return $template | ConvertTo-Json -Depth 10
}

function write_config {
    param([string]$Content)
    if ((Test-Path $GLOBAL_CONFIG_FILE) -and (-not $Force)) {
        log_info "全局配置文件已存在，保留现有配置: $GLOBAL_CONFIG_FILE"
        return
    }
    if ((Test-Path $GLOBAL_CONFIG_FILE) -and $Force) {
        log_info "覆盖全局配置文件，清理旧的工作流配置（Token 将重新配置）"
    }
    $Content | Out-File -FilePath $GLOBAL_CONFIG_FILE -Encoding utf8
    # 设置文件权限为仅当前用户可读写（等效于 chmod 600）
    try {
        $acl = Get-Acl $GLOBAL_CONFIG_FILE
        $acl.SetAccessRuleProtection($true, $false)
        $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
        $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($user, "Modify", "Allow")
        $acl.SetAccessRule($rule)
        $acl | Set-Acl $GLOBAL_CONFIG_FILE
    } catch {
        log_warning "无法设置文件权限（非管理员不影响使用）"
    }
    log_success "全局配置文件已更新: $GLOBAL_CONFIG_FILE"
}

function create_global_dir {
    if (-not (Test-Path $GLOBAL_CONFIG_DIR)) {
        New-Item -ItemType Directory -Force -Path $GLOBAL_CONFIG_DIR | Out-Null
        log_success "创建全局配置目录: $GLOBAL_CONFIG_DIR"
    }
    if (-not (Test-Path $TEMPLATES_DIR)) {
        New-Item -ItemType Directory -Force -Path $TEMPLATES_DIR | Out-Null
        log_success "创建模板目录: $TEMPLATES_DIR"
    }
}

function copy_workflow_template {
    if (-not (Test-Path $WORKFLOW_TEMPLATE_SOURCE)) {
        log_error "工作流模板源文件不存在: $WORKFLOW_TEMPLATE_SOURCE"
    }
    Copy-Item $WORKFLOW_TEMPLATE_SOURCE $WORKFLOW_TEMPLATE_FILE -Force
    if (-not $?) { log_error "无法复制工作流模板" }
    log_success "工作流模板已更新: $WORKFLOW_TEMPLATE_FILE"
}

function copy_standards {
    if (-not (Test-Path $STANDARDS_SOURCE_DIR)) {
        log_warning "语言规范源目录不存在，跳过: $STANDARDS_SOURCE_DIR"
        return
    }
    if (-not (Test-Path $STANDARDS_DEST_DIR)) {
        New-Item -ItemType Directory -Path $STANDARDS_DEST_DIR -Force | Out-Null
    }
    # 覆盖 aet 基线层（~/.aet/implement/custom/ 下的自定义不受影响）
    Copy-Item (Join-Path $STANDARDS_SOURCE_DIR "*") $STANDARDS_DEST_DIR -Recurse -Force
    if (-not $?) { log_error "无法复制语言规范基线" }
    log_success "编程语言规范基线已更新: $STANDARDS_DEST_DIR"
}

function show_security_notice {
    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "全局配置初始化完成" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "`n已配置的平台 Token：" -ForegroundColor Blue
    $pairs = @(
        @{name="gitcode"; val=$GITCODE_TOKEN},
        @{name="github";  val=$GITHUB_TOKEN},
        @{name="gitlab";  val=$GITLAB_TOKEN}
    )
    foreach ($p in $pairs) {
        if ($p.val) {
            if ($p.val -match '^\$\{.*\}$') {
                Write-Host "  $($p.name): 环境变量引用 ($($p.val))"
            } else {
                Write-Host "  $($p.name): 明文存储（建议改用环境变量引用）" -ForegroundColor Yellow
            }
        } else {
            Write-Host "  $($p.name): 未配置"
        }
    }
    Write-Host "`n配置文件位置：" -ForegroundColor Blue
    Write-Host "  全局配置: $GLOBAL_CONFIG_FILE（永不覆盖，手动修改 Token）"
    Write-Host "  工作流模板: $WORKFLOW_TEMPLATE_FILE（随版本更新覆盖）"
    Write-Host "`n注意事项：" -ForegroundColor Blue
    Write-Host "  ~/.aet/ 目录不在项目范围内，不会被 git 提交"
    Write-Host "  工作流模板会随 AET 更新自动覆盖"
    Write-Host "`n下一步：" -ForegroundColor Green
    Write-Host "  进入项目目录，执行 /aet-init 命令初始化项目配置"
    Write-Host "  项目配置中指定 platform.type，系统会自动使用对应平台的 Token"
}

# 处理 --token 和 --platform 参数
if (-not $SkipToken) {
    if ($Token -and $Platform) {
        switch ($Platform) {
            "gitcode" { $GITCODE_TOKEN = $Token }
            "github"  { $GITHUB_TOKEN = $Token }
            "gitlab"  { $GITLAB_TOKEN = $Token }
        }
    }
}

# Force 模式下保留未重新输入的旧 Token
if ($Force -and (Test-Path $GLOBAL_CONFIG_FILE)) {
    $oldGitcode = read_token_from_file "gitcode"
    $oldGithub  = read_token_from_file "github"
    $oldGitlab  = read_token_from_file "gitlab"
    if ([string]::IsNullOrEmpty($GITCODE_TOKEN) -and $oldGitcode) { $GITCODE_TOKEN = $oldGitcode }
    if ([string]::IsNullOrEmpty($GITHUB_TOKEN)  -and $oldGithub)  { $GITHUB_TOKEN  = $oldGithub }
    if ([string]::IsNullOrEmpty($GITLAB_TOKEN)  -and $oldGitlab)  { $GITLAB_TOKEN  = $oldGitlab }
}

# 配置文件已存在且 --force 时，询问是否重新配置
if (Test-Path $GLOBAL_CONFIG_FILE) {
    if ($Force) {
        log_warning "将覆盖现有全局配置文件"
        if ((-not $SkipToken) -and (-not ($Token -and $Platform))) {
            interactive_ask
        }
    } else {
        log_info "全局配置文件已存在: $GLOBAL_CONFIG_FILE"
        log_info "保留现有全局配置（Token 等敏感信息）"
    }
} else {
    # 配置文件不存在，交互式配置
    if ((-not $SkipToken) -and (-not ($Token -and $Platform))) {
        interactive_ask
    }
}

create_global_dir

if ((-not (Test-Path $GLOBAL_CONFIG_FILE)) -or $Force) {
    $configContent = generate_config
    write_config $configContent
}

copy_workflow_template
copy_standards
show_security_notice
