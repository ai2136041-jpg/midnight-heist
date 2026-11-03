@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install
)
start "" cmd /c "timeout /t 4 >nul & start http://127.0.0.1:5173"
call npm run dev
pause
