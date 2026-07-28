@echo off
setlocal
cd /d "%~dp0"
echo ================================================
echo Nexora Collect Online - Vercel Deployment
echo ================================================
echo Make sure the Supabase migration was executed and Vercel environment variables are configured.
echo.
call npx vercel --prod
if errorlevel 1 (
  echo Deployment failed.
  pause
  exit /b 1
)
echo Deployment completed.
pause
