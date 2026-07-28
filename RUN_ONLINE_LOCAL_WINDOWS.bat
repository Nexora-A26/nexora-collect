@echo off
setlocal
cd /d "%~dp0"
echo ================================================
echo Nexora Collect Online - Local Vercel Server
echo ================================================
if not exist .env.local (
  echo Missing .env.local
  echo Copy .env.example to .env.local and add your Supabase values first.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm install
  if errorlevel 1 pause & exit /b 1
)
call npx vercel dev
pause
