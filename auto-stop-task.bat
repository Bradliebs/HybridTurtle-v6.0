@echo off
:: ============================================================
:: HybridTurtle — Auto-Stop Scheduler
:: ============================================================
:: Runs the auto-stop scheduler as a long-running background process.
:: Stops are checked hourly Mon-Fri (configurable via AUTO_STOPS_CRON).
:: Schedule via Task Scheduler to start at logon, or double-click to run.
:: ============================================================

title HybridTurtle Auto-Stop Scheduler
color 0D
setlocal
cd /d "%~dp0"

echo.
echo  ===========================================================
echo   HybridTurtle — Auto-Stop Scheduler
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

:: Check node_modules
if not exist "node_modules" (
    echo  !! Dependencies not installed. Please run install.bat first.
    pause
    exit /b 1
)

echo  [%date% %time%] Starting auto-stop scheduler...
echo  Stops will be checked hourly on weekdays.
echo  Keep this window open (or run via Task Scheduler).
echo.

:: Log start
echo [%date% %time%] Auto-stop scheduler starting... >> auto-stop.log

:: Run the scheduler — this blocks until killed
call npx tsx scripts/start-auto-stop-scheduler.ts 2>&1 | powershell -NoProfile -Command "$input | Tee-Object -FilePath 'auto-stop.log' -Append"

set EXIT_CODE=%ERRORLEVEL%

echo.
echo  [%date% %time%] Auto-stop scheduler exited (exit code: %EXIT_CODE%)
echo [%date% %time%] Auto-stop scheduler exited (exit code: %EXIT_CODE%) >> auto-stop.log

:: Only pause when running interactively (not from Task Scheduler)
if /i NOT "%~1"=="--scheduled" pause
