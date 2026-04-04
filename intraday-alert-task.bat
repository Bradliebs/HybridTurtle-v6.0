@echo off
:: ============================================================
:: HybridTurtle — Intraday Trigger & Stop Alert
:: ============================================================
:: Checks live prices against signal triggers and auto-applies stops.
:: Sends a focused Telegram summary with triggers hit & stops applied.
:: Double-click to run manually, or schedule via Task Scheduler.
:: ============================================================

title HybridTurtle Intraday Alert
color 0E
setlocal
cd /d "%~dp0"

echo.
echo  ===========================================================
echo   HybridTurtle — Intraday Trigger ^& Stop Alert
echo  ===========================================================
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  !! Node.js not found. Please run install.bat first.
    pause
    exit /b 1
)

:: Check .env
if not exist ".env" (
    echo  !! No .env file found. Please run install.bat first.
    pause
    exit /b 1
)

echo  [%date% %time%] Starting intraday alert...
echo.

:: Log start timestamp
echo [%date% %time%] Starting intraday alert... >> intraday-alert.log

:: Run intraday alert — show output in console AND save to log
call npx tsx src/cron/intraday-alert.ts 2>&1 | powershell -NoProfile -Command "$input | Tee-Object -FilePath 'intraday-alert.log' -Append"

set EXIT_CODE=%ERRORLEVEL%

echo.
echo  [%date% %time%] Intraday alert finished (exit code: %EXIT_CODE%)
echo [%date% %time%] Intraday alert finished (exit code: %EXIT_CODE%) >> intraday-alert.log

if %EXIT_CODE% neq 0 (
    echo.
    echo  !! Intraday alert failed. Check intraday-alert.log for details.
)

echo.
echo  Full log saved to: intraday-alert.log
echo.
:: Only pause when running interactively (not from Task Scheduler)
if /i NOT "%~1"=="--scheduled" pause
