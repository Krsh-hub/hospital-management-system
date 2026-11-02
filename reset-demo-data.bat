@echo off
cd /d "%~dp0app"
echo This deletes all data and recreates fresh demo data dated around TODAY.
pause
call npm run reset
echo Done. Now run start.bat
pause
