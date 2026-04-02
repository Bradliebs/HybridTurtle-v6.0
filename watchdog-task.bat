@echo off
:: ============================================================
:: HybridTurtle — Watchdog (Missed Heartbeat Detection)
:: ============================================================
:: Checks if nightly/midday tasks ran. Sends Telegram alert if not.
:: Schedule via Task Scheduler to run daily at 10:00 AM.
:: ============================================================

title HybridTurtle Watchdog
setlocal
cd /d "%~dp0"

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  !! Node.js not found. Please run install.bat first.
    exit /b 1
)

:: Check .env
if not exist ".env" (
    echo  !! No .env file found. Please run install.bat first.
    exit /b 1
)

:: Ensure migrations are current
call node scripts/auto-migrate.mjs --quiet

:: Run the watchdog check
call npx tsx src/cron/watchdog.ts

endlocal
