@echo off
REM Double-click this file, or its Desktop shortcut, to launch Empire Pod in development mode.
cd /d "%~dp0"

if not exist node_modules (
    echo Installing dependencies - first run only...
    call npm install
)

call npm run dev
