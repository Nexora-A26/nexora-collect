@echo off
setlocal
cd /d "%~dp0"
echo ================================================
echo Nexora Collect Online - Verification
echo ================================================
where node >nul 2>nul || (echo Node.js is not installed.& pause & exit /b 1)
where npm >nul 2>nul || (echo npm is not installed.& pause & exit /b 1)
if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 goto :fail
)
echo Running TypeScript check...
call npm run typecheck
if errorlevel 1 goto :fail
echo Building Vite web application...
call npm run build:web
if errorlevel 1 goto :fail
echo.
echo Online project verification passed.
pause
exit /b 0
:fail
echo.
echo Verification failed. Read the error above.
pause
exit /b 1
