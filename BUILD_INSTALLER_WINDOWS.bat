@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ================================================
echo Nexora Collect - Windows Builder v1.0.2
echo ================================================

where node >nul 2>nul || (
  echo Node.js is not installed. Install Node.js 20 or 22 LTS first.
  pause
  exit /b 1
)

set CSC_IDENTITY_AUTO_DISCOVERY=false
set WIN_CSC_LINK=
set CSC_LINK=
set ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES=true

if exist release rmdir /s /q release

if exist package-lock.json (
  echo Installing exact dependencies from package-lock.json...
  call npm ci
) else (
  echo Installing dependencies...
  call npm install
)
if errorlevel 1 goto :error

echo Running TypeScript and renderer checks...
call npm run typecheck
if errorlevel 1 goto :error
call npm run build:web
if errorlevel 1 goto :error

echo Running Electron database smoke test...
call npm run smoke
if errorlevel 1 goto :error

echo Building unsigned Windows Setup and Portable edition...
call npm run dist:win:unsigned
if errorlevel 1 goto :error

echo Verifying release files...
call CHECK_RELEASE_WINDOWS.bat /quiet
if errorlevel 1 goto :error

echo.
echo Build completed successfully.
echo Setup: release\Nexora-Collect-Setup-1.0.2-x64.exe
echo Portable: release\Nexora-Collect-Portable-1.0.2-x64.exe
echo.
echo The installer creates Desktop and Start Menu shortcuts and includes Uninstall.
pause
exit /b 0

:error
echo.
echo Build failed. Do not distribute files from this failed build.
echo Review the first error above. Deprecation and audit warnings alone do not stop the build.
pause
exit /b 1
