@echo off
cd /d "%~dp0"
set "CAP_NODE=%~dp0runtime\node.exe"
if not exist "%CAP_NODE%" set "CAP_NODE=node"
"%CAP_NODE%" tools\event-runner.mjs stop
set "CAP_STOP_EXIT=%errorlevel%"
pause
exit /b %CAP_STOP_EXIT%
