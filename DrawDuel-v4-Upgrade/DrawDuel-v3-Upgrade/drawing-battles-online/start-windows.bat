@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
    echo Node.js is needed to run the online game server.
    echo Install Node.js 20 or later, then run this file again.
    pause
    exit /b 1
)
echo Starting Draw Duel at http://localhost:3000
echo Keep this window open while playing.
node server.js
pause
