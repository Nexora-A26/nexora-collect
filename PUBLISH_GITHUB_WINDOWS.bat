@echo off
setlocal EnableExtensions
cd /d "%~dp0"
where git >nul 2>nul || (
  echo Git is not installed. Install Git for Windows first.
  pause
  exit /b 1
)
if not exist .git git init
set /p REPO_URL=Paste the empty GitHub repository URL: 
if "%REPO_URL%"=="" exit /b 1
git branch -M main
git add .
git commit -m "Nexora Collect v1.0.2"
git remote remove origin >nul 2>nul
git remote add origin "%REPO_URL%"
git push -u origin main
echo.
echo Source uploaded. Enable GitHub Pages with GitHub Actions in repository Settings.
echo To publish Setup.exe in Releases, run:
echo   git tag v1.0.2
echo   git push origin v1.0.2
pause
