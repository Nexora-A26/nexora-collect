@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set CSC_IDENTITY_AUTO_DISCOVERY=false
set WIN_CSC_LINK=
set CSC_LINK=
if exist package-lock.json (call npm ci) else (call npm install)
if errorlevel 1 goto :error
call npm run verify
if errorlevel 1 goto :error
call npm run dist:win:setup
if errorlevel 1 goto :error
call CHECK_RELEASE_WINDOWS.bat /setup-only
exit /b %errorlevel%
:error
echo Setup build failed.
pause
exit /b 1
