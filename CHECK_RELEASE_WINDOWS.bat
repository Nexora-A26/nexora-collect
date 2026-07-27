@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set QUIET=0
set SETUP_ONLY=0
if /i "%~1"=="/quiet" set QUIET=1
if /i "%~1"=="/setup-only" set SETUP_ONLY=1
set SETUP=release\Nexora-Collect-Setup-1.0.2-x64.exe
set PORTABLE=release\Nexora-Collect-Portable-1.0.2-x64.exe
set PACKAGED=release\win-unpacked\Nexora Collect.exe
if not exist "%SETUP%" (
  echo Missing installer: %SETUP%
  exit /b 1
)
if %SETUP_ONLY%==0 (
  if not exist "%PORTABLE%" (
    echo Missing portable build: %PORTABLE%
    exit /b 1
  )
)
if not exist "%PACKAGED%" (
  echo Missing unpacked executable: %PACKAGED%
  exit /b 1
)
"%PACKAGED%" --smoke-test
if errorlevel 1 (
  echo Packaged application smoke test failed.
  exit /b 1
)
if %QUIET%==0 (
  echo Release verification passed.
  echo %SETUP%
  echo %PORTABLE%
  pause
)
exit /b 0
