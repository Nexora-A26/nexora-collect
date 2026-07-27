@echo off
setlocal
cd /d "%~dp0"
echo ================================================
echo Nexora Collect - Development Runner
echo ================================================
where node >nul 2>nul || (
  echo Node.js is not installed. Install Node.js 20 or 22 LTS first.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 goto :error
)
call npm run dev
exit /b %errorlevel%
:error
echo.
echo Installation or startup failed. Read the error above.
pause
exit /b 1
