@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instale Node.js 24 ou posterior e abra este arquivo novamente.
  pause
  exit /b 1
)
node src/main.mjs
pause
