@echo off
:: ============================================================
:: HybridTurtle — Package for Distribution
:: ============================================================
:: Creates a zip file you can send to someone else.
:: They just extract it and run install.bat.
::
:: What's INCLUDED:  All source code, configs, batch files,
::                   database schema, docs, planning files.
::
:: What's EXCLUDED:  node_modules, database, .env secrets,
::                   logs, build cache, backups.
:: ============================================================

title HybridTurtle Packager v6.0
color 0D
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo  ===========================================================
echo   HybridTurtle — Package for Distribution
echo  ===========================================================
echo.

:: ── Check PowerShell is available (needed for zip) ──
where powershell >nul 2>&1
if %errorlevel% neq 0 (
    echo  !! PowerShell not found. Cannot create zip file.
    pause
    exit /b 1
)

:: ── Set output filename with date stamp ──
for /f "tokens=1-3 delims=/ " %%a in ("%date%") do set DATESTAMP=%%c%%b%%a
:: Fallback if date format doesn't parse nicely
if "%DATESTAMP%"=="" (
    for /f "tokens=*" %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd"') do set DATESTAMP=%%d
)
set "ZIPNAME=HybridTurtle-v6.0-%DATESTAMP%.zip"
set "ZIPPATH=%~dp0%ZIPNAME%"

:: ── Check if zip already exists ──
if exist "%ZIPPATH%" (
    echo  A package with today's date already exists:
    echo    %ZIPNAME%
    echo.
    set /p OVERWRITE="  Overwrite it? (Y/N): "
    if /i not "!OVERWRITE!"=="Y" (
        echo  Cancelled.
        pause
        exit /b 0
    )
    del "%ZIPPATH%"
)

echo  Creating package: %ZIPNAME%
echo.
echo  This may take a minute...
echo.

:: ── Build the zip using PowerShell helper script ──
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\package-helper.ps1" -RootDir "%~dp0." -ZipName "%ZIPNAME%"

if %errorlevel% neq 0 (
    echo.
    echo  !! Packaging failed. Make sure no files are locked by other programs.
    echo  !! Try closing VS Code and any terminals, then run package.bat again.
    pause
    exit /b 1
)

echo.
echo  ===========================================================
echo   PACKAGING COMPLETE!
echo  ===========================================================
echo.
echo   File: %ZIPNAME%
echo   Location: %~dp0
echo.
echo   To distribute:
echo     1. Send the zip file to the other person
echo     2. They extract it to any folder
echo     3. They double-click install.bat
echo     4. They double-click the desktop shortcut to launch
echo.
echo   The zip does NOT contain:
echo     - Your database (trading data, positions, stops)
echo     - Your .env secrets (API keys, tokens)
echo     - Log files or backups
echo     - node_modules (reinstalled by install.bat)
echo.
echo  ===========================================================
echo.
pause
