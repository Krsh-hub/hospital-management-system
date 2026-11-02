@echo off
title MediCore HMS
cd /d "%~dp0app"
if not exist node_modules (
  echo Installing dependencies, please wait...
  call npm install
)
start "" http://localhost:3000
echo.
echo  MediCore HMS is starting... keep this window open during the demo.
echo  Close this window (or press Ctrl+C) to stop the server.
echo.
node --no-warnings server.js
pause
