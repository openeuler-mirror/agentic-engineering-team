@echo off
chcp 65001 >nul 2>nul
setlocal enabledelayedexpansion

set "INSTALL_MODE=remote"
set "AET_DIR=%USERPROFILE%\.config\opencode\aet"
for %%i in ("%~f0") do set "SCRIPT_DIR=%%~dpi"

if /i "%~1"=="/local" set "INSTALL_MODE=local"
if /i "%~1"=="/?" goto :help
if /i "%~1"=="/h" goto :help
if /i "%~1"=="-h" goto :help
if /i "%~1"=="--help" goto :help

echo [INFO] starting AET installation...

echo [INFO] checking dependencies...
where git >nul 2>nul || ( echo [ERROR] git not found & exit /b 1 )
where node >nul 2>nul || ( echo [ERROR] Node.js not found & exit /b 1 )
where npm >nul 2>nul || ( echo [ERROR] npm not found & exit /b 1 )
echo [SUCCESS] dependency check passed

if /i "%INSTALL_MODE%"=="local" (
    echo [INFO] mode: local install [dev]
    set "CURRENT_DIR=%SCRIPT_DIR%.."
    if not exist "!CURRENT_DIR!\.opencode\plugins\aet.js" (
        echo [ERROR] not a valid AET project: !CURRENT_DIR!
        exit /b 1
    )
    echo [INFO] using local source: !CURRENT_DIR!
    if exist "%AET_DIR%" rmdir /s /q "%AET_DIR%"
    if not exist "%USERPROFILE%\.config\opencode" mkdir "%USERPROFILE%\.config\opencode"
    mklink /d "%AET_DIR%" "!CURRENT_DIR!" >nul
    if %errorlevel% neq 0 (
        echo [ERROR] cannot create symlink, run as admin or enable Developer Mode
        exit /b 1
    )
    echo [SUCCESS] connected to local source
) else (
    echo [INFO] mode: remote install
    if exist "%AET_DIR%" rmdir /s /q "%AET_DIR%"
    echo [INFO] cloning repo...
    git clone https://atomgit.com/openeuler/agentic-engineering-team.git "%AET_DIR%"
    if %errorlevel% neq 0 ( echo [ERROR] clone failed & exit /b 1 )
    echo [SUCCESS] source downloaded
)

set "PLUGINS_DIR=%USERPROFILE%\.config\opencode\plugins"
set "SKILLS_DIR=%USERPROFILE%\.config\opencode\skills"
set "COMMANDS_DIR=%USERPROFILE%\.config\opencode\commands"
set "AET_SKILLS_DIR=%SKILLS_DIR%\aet"

if not exist "%PLUGINS_DIR%" mkdir "%PLUGINS_DIR%"
if exist "%PLUGINS_DIR%\aet.js" del "%PLUGINS_DIR%\aet.js"
mklink "%PLUGINS_DIR%\aet.js" "%AET_DIR%\.opencode\plugins\aet.js" >nul 2>nul
if %errorlevel% neq 0 ( echo [ERROR] plugin symlink failed & exit /b 1 )

if not exist "%SKILLS_DIR%" mkdir "%SKILLS_DIR%"
if exist "%AET_SKILLS_DIR%" rmdir /s /q "%AET_SKILLS_DIR%"
mkdir "%AET_SKILLS_DIR%"
if exist "%AET_DIR%\skills\*" xcopy /e /i /q "%AET_DIR%\skills\*" "%AET_SKILLS_DIR%" >nul

if not exist "%COMMANDS_DIR%" mkdir "%COMMANDS_DIR%"
if exist "%AET_DIR%\commands" (
    for %%f in ("%AET_DIR%\commands\*.md") do (
        set "link_name=aet-%%~nxf"
        if exist "!COMMANDS_DIR!\!link_name!" del "!COMMANDS_DIR!\!link_name!"
        mklink "!COMMANDS_DIR!\!link_name!" "%%f" >nul 2>nul
        if not exist "!COMMANDS_DIR!\!link_name!" (
            echo [WARNING] mklink failed, copying instead
            copy "%%f" "!COMMANDS_DIR!\!link_name!" >nul
        )
    )
    echo [SUCCESS] commands links created
) else (
    echo [ERROR] commands dir not found: %AET_DIR%\commands
    exit /b 1
)

echo [INFO] verifying installation...
if not exist "%PLUGINS_DIR%\aet.js" ( echo [ERROR] plugin not found & exit /b 1 )
if not exist "%AET_SKILLS_DIR%" ( echo [ERROR] skills not found & exit /b 1 )
if not exist "%COMMANDS_DIR%\aet-init.md" ( echo [ERROR] commands link not found & exit /b 1 )
echo [SUCCESS] installation verified

rem install graphify (optional, python required)
where python >nul 2>nul && (
    if not exist "%USERPROFILE%\.aet\venv" mkdir "%USERPROFILE%\.aet\venv"
    python -m venv "%USERPROFILE%\.aet\venv"
    "%USERPROFILE%\.aet\venv\Scripts\pip.exe" install graphifyy >nul 2>nul
    if !errorlevel! equ 0 ( echo [SUCCESS] graphify installed
    ) else ( echo [WARNING] graphify install failed, you can manually run: pip install graphifyy )
) || ( echo [WARNING] python not found, skip graphify install )

set "INIT_SCRIPT=%AET_DIR%\scripts\init-global-config.cmd"
if not exist "%INIT_SCRIPT%" set "INIT_SCRIPT=%~dp0init-global-config.cmd"
if exist "%INIT_SCRIPT%" ( call "%INIT_SCRIPT%" )

echo [SUCCESS] AET installation complete!
goto :eof

:help
echo AET Install Script
echo.
echo Usage: install.cmd [options]
echo.
echo Options:
echo   /local      Install from local source [dev mode]
echo   /h          Show this help
echo.
echo One-liner (curl, Win10+):
echo   curl -fsSL --ssl-no-revoke https://raw.atomgit.com/openeuler/agentic-engineering-team/raw/master/scripts/install.cmd -o %%TEMP%%\install.cmd ^&^& %%TEMP%%\install.cmd
echo.
echo One-liner (certutil, Win7+):
echo   certutil -urlcache -split -f https://raw.atomgit.com/openeuler/agentic-engineering-team/raw/master/scripts/install.cmd %%TEMP%%\install.cmd ^>nul ^&^& %%TEMP%%\install.cmd
echo.
echo Examples:
echo   install.cmd                                                  Remote install
echo   install.cmd /local                                           Local dev install
exit /b 0
