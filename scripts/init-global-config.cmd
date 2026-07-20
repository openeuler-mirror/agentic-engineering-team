@echo off
chcp 65001 >nul 2>nul
setlocal enabledelayedexpansion

set "FORCE_MODE=false"
set "SKIP_TOKEN=false"
set "TOKEN_VALUE="
set "PLATFORM="

:parse_args
if "%~1"=="" goto :args_done
if /i "%~1"=="-h" goto :help
if /i "%~1"=="--help" goto :help
if /i "%~1"=="/h" goto :help
if /i "%~1"=="--skip-token" set "SKIP_TOKEN=true" & shift & goto :parse_args
if /i "%~1"=="--force" set "FORCE_MODE=true" & shift & goto :parse_args
if /i "%~1"=="--token" set "TOKEN_VALUE=%~2" & shift & shift & goto :parse_args
if /i "%~1"=="--platform" set "PLATFORM=%~2" & shift & shift & goto :parse_args
echo [ERROR] unknown argument: %~1
goto :help
:args_done

rem Determine script directory from the batch file path
for %%i in ("%~f0") do set "BATCH_DIR=%%~dpi"
set "PS_SCRIPT=%BATCH_DIR%init-global-config.ps1"
if not exist "!PS_SCRIPT!" (
    for %%i in ("%~f0..\..\scripts\init-global-config.ps1") do set "PS_SCRIPT=%%~fi"
)
if exist "!PS_SCRIPT!" (
    set "PS_ARGS="
    if "%SKIP_TOKEN%"=="true" set "PS_ARGS=!PS_ARGS! -SkipToken"
    if "%FORCE_MODE%"=="true" set "PS_ARGS=!PS_ARGS! -Force"
    if not "%TOKEN_VALUE%"=="" set "PS_ARGS=!PS_ARGS! -Token '%TOKEN_VALUE%'"
    if not "%PLATFORM%"=="" set "PS_ARGS=!PS_ARGS! -Platform %PLATFORM%"
    echo [INFO] using PowerShell for config initialization...
    powershell -ExecutionPolicy Bypass -File "!PS_SCRIPT!" !PS_ARGS!
    exit /b !errorlevel!
)

echo [WARNING] PowerShell not found, using CMD fallback...

set "GLOBAL_CONFIG_DIR=%USERPROFILE%\.aet"
set "GLOBAL_CONFIG_FILE=%GLOBAL_CONFIG_DIR%\config.json"

if not exist "%GLOBAL_CONFIG_DIR%" mkdir "%GLOBAL_CONFIG_DIR%"
if not exist "%GLOBAL_CONFIG_DIR%\templates" mkdir "%GLOBAL_CONFIG_DIR%\templates"

if "%FORCE_MODE%"=="false" if exist "%GLOBAL_CONFIG_FILE%" (
    echo [INFO] config exists: %GLOBAL_CONFIG_FILE%
    goto :eof
)

if not exist "%GLOBAL_CONFIG_FILE%" (
    echo { > "%GLOBAL_CONFIG_FILE%"
    echo   "version": "1.0", >> "%GLOBAL_CONFIG_FILE%"
    echo   "codePlatform": { >> "%GLOBAL_CONFIG_FILE%"
    echo     "platforms": { >> "%GLOBAL_CONFIG_FILE%"
    echo       "gitcode": { "type": "gitcode", "apiBaseUrl": "https://api.atomgit.com/api/v5", "token": "" }, >> "%GLOBAL_CONFIG_FILE%"
    echo       "github": { "type": "github", "apiBaseUrl": "https://api.github.com", "token": "" }, >> "%GLOBAL_CONFIG_FILE%"
    echo       "gitlab": { "type": "gitlab", "apiBaseUrl": "https://gitlab.com/api/v4", "token": "" } >> "%GLOBAL_CONFIG_FILE%"
    echo     } >> "%GLOBAL_CONFIG_FILE%"
    echo   } >> "%GLOBAL_CONFIG_FILE%"
    echo } >> "%GLOBAL_CONFIG_FILE%"
    echo [SUCCESS] config created: %GLOBAL_CONFIG_FILE%
)

goto :eof

:help
echo AET Global Config Initialization
echo.
echo Usage: init-global-config.cmd [options]
echo.
echo Options:
echo   --skip-token        Skip token configuration
echo   --force             Force reconfiguration
echo   --token VALUE       Set token (requires --platform)
echo   --platform TYPE     Platform: gitcode/github/gitlab
echo   --help              Show this help
echo.
echo Examples:
echo   init-global-config.cmd --skip-token
echo   init-global-config.cmd --force
exit /b 0
