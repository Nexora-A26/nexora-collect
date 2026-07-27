@echo off
setlocal
cd /d "%~dp0"
if not exist node_modules call npm install
if errorlevel 1 goto :error
call npm run verify
if errorlevel 1 goto :error
echo All project checks passed.
pause
exit /b 0
:error
echo Project verification failed. Read the error above.
pause
exit /b 1
