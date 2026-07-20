@echo off
chcp 65001 >nul 2>nul
if "%~1"=="" goto :main
call :%~1 %2 %3 %4 %5 %6 %7 %8 %9
exit /b %errorlevel%

:main
echo AET Utility Functions
echo Usage: call common.cmd function_name args...
echo.
echo Available functions:
echo   log_info "msg"
echo   log_success "msg"
echo   log_error "msg"
echo   check_dependencies
echo   download_source target_dir
echo   create_symlinks aet_dir
echo   verify_installation
echo   check_installed
echo   backup_current
echo   pull_latest
echo   restore_config
echo   verify_upgrade
exit /b 0

:log_info
echo [INFO] %~2
exit /b 0

:log_success
echo [SUCCESS] %~2
exit /b 0

:log_error
echo [ERROR] %~2
exit /b 1

:check_dependencies
echo [INFO] checking dependencies...
where git >nul 2>nul || ( echo [ERROR] git not found & exit /b 1 )
where curl >nul 2>nul || where wget >nul 2>nul || ( echo [ERROR] curl/wget not found & exit /b 1 )
echo [SUCCESS] dependency check passed
exit /b 0

:download_source
set "repo=https://atomgit.com/openeuler/agentic-engineering-team.git"
set "target=%~2"
echo [INFO] downloading source...
if exist "%target%\" (
    echo [INFO] directory exists, pulling latest...
    pushd "%target%" && git pull origin main && popd
) else (
    echo [INFO] cloning repo...
    git clone "%repo%" "%target%"
)
if %errorlevel% neq 0 ( echo [ERROR] download failed & exit /b 1 )
echo [SUCCESS] source downloaded
exit /b 0

:create_symlinks
set "aet_dir=%~2"
set "plugins=%USERPROFILE%\.config\opencode\plugins"
set "skills=%USERPROFILE%\.config\opencode\skills"
echo [INFO] creating symlinks...
if not exist "%plugins%" mkdir "%plugins%"
if not exist "%skills%" mkdir "%skills%"
if exist "%plugins%\aet.js" del "%plugins%\aet.js"
mklink "%plugins%\aet.js" "%aet_dir%\.opencode\plugins\aet.js" >nul 2>nul
if %errorlevel% neq 0 ( echo [ERROR] plugin symlink failed & exit /b 1 )
if exist "%skills%\aet" rmdir /s /q "%skills%\aet"
mklink /d "%skills%\aet" "%aet_dir%\skills" >nul 2>nul
if %errorlevel% neq 0 ( echo [ERROR] skills symlink failed & exit /b 1 )
echo [SUCCESS] symlinks created
exit /b 0

:verify_installation
echo [INFO] verifying installation...
if not exist "%USERPROFILE%\.config\opencode\plugins\aet.js" ( echo [ERROR] plugin not found & exit /b 1 )
if not exist "%USERPROFILE%\.config\opencode\skills\aet" ( echo [ERROR] skills not found & exit /b 1 )
echo [SUCCESS] verification passed
exit /b 0

:check_installed
if not exist "%USERPROFILE%\.config\opencode\aet" ( echo [ERROR] AET not installed, run install.cmd first & exit /b 1 )
echo [SUCCESS] AET is installed
exit /b 0

:backup_current
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set "dt=%%I"
set "ts=%dt:~0,14%"
set "backup_dir=%USERPROFILE%\.config\opencode\aet.backup.%ts%"
echo [INFO] backing up current version...
if exist "%USERPROFILE%\.config\opencode\aet" (
    xcopy /e /i /q "%USERPROFILE%\.config\opencode\aet" "%backup_dir%" >nul
) else (
    echo [ERROR] AET directory not found & exit /b 1
)
echo [SUCCESS] backed up to %backup_dir%
exit /b 0

:pull_latest
echo [INFO] pulling latest code...
pushd "%USERPROFILE%\.config\opencode\aet" || ( echo [ERROR] cannot enter AET directory & exit /b 1 )
git fetch origin
if %errorlevel% neq 0 ( echo [ERROR] fetch failed & popd & exit /b 1 )
git reset --hard origin/main
if %errorlevel% neq 0 ( echo [ERROR] reset failed & popd & exit /b 1 )
popd
echo [SUCCESS] code updated
exit /b 0

:restore_config
echo [INFO] symlinks preserved, no config restore needed
exit /b 0

:verify_upgrade
call :verify_installation
exit /b 0
