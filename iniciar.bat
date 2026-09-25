@echo off
cd /d "%~dp0"
where npm >nul 2>nul
if errorlevel 1 (
  echo npm nao foi encontrado. Instale Node.js 18 ou mais recente e tente novamente.
  pause
  exit /b 1
)
start "" http://localhost:8000
npm start
