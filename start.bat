@echo off
setlocal
set "NODE_HOME=%USERPROFILE%\node-v24.22.3-win-x64"
set "PATH=%NODE_HOME%;%PATH%"
cd /d "%~dp0"
echo.
echo CareerCompass starting... open http://localhost:3000
echo Press Ctrl+C to stop.
echo.
node server.js
endlocal