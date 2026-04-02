@echo off
:: ============================================================
:: HybridTurtle Research Refresh — Scheduled Task Entry Point
:: ============================================================
:: Refreshes the research dataset: backfills scores, enriches
:: forward outcomes, links trades. Safe to rerun (idempotent).
::
:: Usage:
::   research-refresh-task.bat              (interactive, pauses on finish)
::   research-refresh-task.bat --scheduled  (silent, for Task Scheduler)
:: ============================================================

title HybridTurtle Research Refresh
setlocal
cd /d "%~dp0"

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  !! Node.js not found. Please run install.bat first.
    if not "%~1"=="--scheduled" pause
    exit /b 1
)

:: Check .env
if not exist ".env" (
    echo  !! No .env file found. Please run install.bat first.
    if not "%~1"=="--scheduled" pause
    exit /b 1
)

:: Run migrations first (handles DB lock gracefully)
call node scripts/auto-migrate.mjs --quiet

:: Run the research refresh job
call npx tsx src/cron/research-refresh.ts --run-now 2>&1 | powershell -NoProfile -Command "$input | Tee-Object -FilePath 'research-refresh.log' -Append"

set EXIT_CODE=%ERRORLEVEL%

if "%~1"=="--scheduled" goto :end

echo.
if %EXIT_CODE% equ 0 (
    echo  Research refresh completed successfully.
) else (
    echo  Research refresh encountered errors. Check research-refresh.log
)
echo.
pause

:end
exit /b %EXIT_CODE%
