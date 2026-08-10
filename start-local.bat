@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0start-server.ps1"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8787/"
pause
