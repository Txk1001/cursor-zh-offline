@echo off
setlocal
chcp 65001 >nul
where node >nul 2>nul
if errorlevel 1 goto embedded
node "%~dp0scripts\portable-install.mjs" %*
set "result=%errorlevel%"
goto finish
:embedded
set "ELECTRON_RUN_AS_NODE=1"
if defined CURSOR_INSTALL_DIR if exist "%CURSOR_INSTALL_DIR%\Cursor.exe" set "cursor_runtime=%CURSOR_INSTALL_DIR%\Cursor.exe"
if not defined cursor_runtime if exist "%LOCALAPPDATA%\Programs\cursor\Cursor.exe" set "cursor_runtime=%LOCALAPPDATA%\Programs\cursor\Cursor.exe"
if not defined cursor_runtime if exist "%ProgramFiles%\Cursor\Cursor.exe" set "cursor_runtime=%ProgramFiles%\Cursor\Cursor.exe"
if not defined cursor_runtime (
  echo 未找到 Node.js 或默认目录中的 Cursor。请安装 Node.js 18.17 或以上，再运行此入口。
  exit /b 1
)
"%cursor_runtime%" "%~dp0scripts\translate-install.mjs" --force-language-pack %*
set "result=%errorlevel%"
:finish
if not "%result%"=="0" echo 安装未完成，请查看上方原因。
pause
exit /b %result%
