@echo off
:: ============================================================
:: HybridTurtle Trading Dashboard — One-Click Installer
:: ============================================================
:: This script installs everything a novice needs to run
:: the HybridTurtle dashboard on a fresh Windows machine.
:: ============================================================

:: Keep window open even if the script crashes unexpectedly
if not defined _INSTALL_RUNNING (
    set "_INSTALL_RUNNING=1"
    cmd /k "%~f0" %*
    exit /b
)

title HybridTurtle Installer v6.0
color 0A
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

:: ── If called with --register-tasks-only, jump straight to task registration ──
if "%~1"=="--register-tasks-only" (
    set "LOG=%~dp0install.log"
    set "SCRIPT_DIR=%~dp0"
    goto :do_register_tasks
)

:: ── Install log ──
set "LOG=%~dp0install.log"
>> "%LOG%" echo.
>> "%LOG%" echo [%date% %time%] ====== Starting install ======
echo  (logging to install.log)

echo.
echo  ===========================================================
echo       _  _      _        _    _  _____          _   _
echo     ^| ^|^| ^|_  _^| ^|__  _ ^(_) ^|^|_^|_   _^|_  _ _ ^|_^| ^| ___
echo     ^|  _  ^| ^|^| ^| '_ \^| '__^| ^| / _` ^| ^| ^|  ^| ^| ^| '_^|  _^|^| / -_^)
echo     ^|_^| ^|_^|\_, ^|_.__/^|_^|  ^|_^|\__,_^| ^|_^|  ^|___^|_^|  ^|_^|^| ^|_\___^|
echo            ^|__/
echo  ===========================================================
echo       Trading Dashboard Installer v6.0
echo  ===========================================================
echo.

:: ── Step 1: Check for Node.js ──
echo  [1/8] Checking for Node.js...
where node >nul 2>&1
if !errorlevel! neq 0 (
    echo.
    echo  !! Node.js is NOT installed.
    echo  !! Opening the Node.js download page...
    echo  !! Please install Node.js LTS.
    echo  !! Important: after install finishes, close this window
    echo  !! and run install.bat again.
    echo.
    start https://nodejs.org/en/download/
    echo  Press any key to exit installer...
    pause >nul
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo         Found Node.js %NODE_VER%
>> "%LOG%" echo [%date% %time%] Node.js %NODE_VER%

:: ── Node.js version compatibility check ──
set "NODE_VER_NO_V=%NODE_VER:v=%"
for /f "tokens=1 delims=." %%i in ("%NODE_VER_NO_V%") do set NODE_MAJOR=%%i
if %NODE_MAJOR% LSS 18 (
    echo.
    echo  !! This installer requires Node.js 18 or higher.
    echo  !! You have Node.js %NODE_VER% installed.
    echo  !! Please install a current Node.js LTS version, then run install.bat again.
    echo  !! On the Node.js website, choose the LTS tab.
    echo.
    echo  !! Opening Node.js download page...
    >> "%LOG%" echo [%date% %time%] FAIL: Node.js too old: %NODE_VER%
    start https://nodejs.org/en/download/
    pause
    exit /b 1
)

:: ── Node.js architecture check ──
for /f "tokens=*" %%i in ('node -e "console.log(process.arch)"') do set NODE_ARCH=%%i
echo         Architecture: %NODE_ARCH%
echo %NODE_ARCH% | findstr /i "x64 arm64" >nul
if !errorlevel! neq 0 (
    echo.
    echo  !! 64-bit Node.js is required. You have: %NODE_ARCH%
    echo  !! Please install the 64-bit ^(x64^) version from https://nodejs.org
    >> "%LOG%" echo [%date% %time%] FAIL: Wrong architecture: %NODE_ARCH%
    pause
    exit /b 1
)
>> "%LOG%" echo [%date% %time%] Architecture: %NODE_ARCH% OK

:: ── Step 2: Check npm & PowerShell ──
echo  [2/8] Checking npm...
where npm >nul 2>&1
if !errorlevel! neq 0 (
    echo  !! npm not found. It should come with Node.js.
    echo  !! Please reinstall Node.js from https://nodejs.org
    >> "%LOG%" echo [%date% %time%] FAIL: npm not found
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('npm --version') do set NPM_VER=%%i
echo         Found npm v%NPM_VER%
>> "%LOG%" echo [%date% %time%] npm v%NPM_VER%

:: ── Pre-flight: Verify PowerShell ──
echo         Checking PowerShell...
where powershell >nul 2>&1
if !errorlevel! neq 0 (
    echo  !! PowerShell not found. Required for installation.
    >> "%LOG%" echo [%date% %time%] FAIL: PowerShell not found
    pause
    exit /b 1
)
>> "%LOG%" echo [%date% %time%] PowerShell OK

:: ── Step 3: Create .env if missing ──
echo  [3/8] Setting up environment...
if exist ".env" (
    echo         .env already exists - keeping existing config
    >> "%LOG%" echo [%date% %time%] .env already exists - skipped
    goto :env_done
)
:: Generate a cryptographically random secret (32 bytes, base64)
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "$b = New-Object byte[] 32; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)"') do set NEXTAUTH_SECRET=%%i
for /f "tokens=*" %%i in ('powershell -NoProfile -Command "$b = New-Object byte[] 32; [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)"') do set CRON_SECRET=%%i
> ".env" echo DATABASE_URL=file:./dev.db
>> ".env" echo NEXTAUTH_URL=http://localhost:3000
>> ".env" echo NEXTAUTH_SECRET=!NEXTAUTH_SECRET!
>> ".env" echo CRON_SECRET=!CRON_SECRET!
>> ".env" echo.
>> ".env" echo # Broker adapter: disabled, mock, or trading212
>> ".env" echo BROKER_ADAPTER=disabled
>> ".env" echo.
>> ".env" echo # Telegram nightly reports - fill these in during Step 7 or later
>> ".env" echo # TELEGRAM_BOT_TOKEN=your-bot-token-here
>> ".env" echo # TELEGRAM_CHAT_ID=your-chat-id-here
echo         Created .env with SQLite database
>> "%LOG%" echo [%date% %time%] Created .env
:env_done

:: ── Step 4: Install dependencies ──
echo  [4/8] Installing dependencies (this may take 2-5 minutes)...
echo.
:: Use npm ci for reproducible installs when lockfile exists; fall back to npm install
if exist "package-lock.json" (
    call npm ci >> "%LOG%" 2>&1
) else (
    call npm install >> "%LOG%" 2>&1
)
if !errorlevel! neq 0 (
    echo.
    echo  !! npm install failed. Common fixes:
    echo  !!   1. Close VS Code and any other editors, then re-run
    echo  !!   2. Run: npm install --ignore-scripts
    echo  !!      then: npx prisma generate
    echo  !!   3. Disable antivirus temporarily
    echo  !!   4. Run installer as Administrator
    echo  !! See install.log for details.
    >> "%LOG%" echo [%date% %time%] FAIL: npm install
    goto :fail
)
>> "%LOG%" echo [%date% %time%] npm install OK

:: ── Step 5: Setup database ──
echo.
echo  [5/8] Setting up database...
call npx prisma generate >> "%LOG%" 2>&1
if !errorlevel! neq 0 (
    echo  !! Prisma generate failed. See install.log for details.
    >> "%LOG%" echo [%date% %time%] FAIL: prisma generate
    goto :fail
)

call node scripts/auto-migrate.mjs >> "%LOG%" 2>&1
if !errorlevel! neq 0 (
    echo  !! Database migration failed. See install.log for details.
    >> "%LOG%" echo [%date% %time%] FAIL: auto-migrate
    goto :fail
)

:: Seed the database with stock universe (idempotent — safe to re-run)
echo         Seeding stock universe...
call npx prisma db seed >> "%LOG%" 2>&1
if !errorlevel! neq 0 (
    echo         Note: Seed may have already been applied — continuing.
)
>> "%LOG%" echo [%date% %time%] Database setup OK

:: ── Step 5b: Verify build compiles ──
echo.
echo         Verifying dashboard compiles correctly...
call npx next build >> "%LOG%" 2>&1
if !errorlevel! neq 0 (
    echo(
    echo  Build verification failed.
    echo  This usually means some files are missing from the install.
    echo  Try these steps:
    echo    1. Re-extract the HybridTurtle zip to a fresh folder
    echo    2. Make sure you extract ALL files ^(not just some^)
    echo    3. Run install.bat again from the new folder
    echo  See install.log for the specific error.
    >> "%LOG%" echo [%date% %time%] FAIL: next build verification
    goto :fail
)
echo         Build OK
>> "%LOG%" echo [%date% %time%] Build verification OK

:: ── Step 6: Create desktop shortcut ──
echo  [6/8] Creating desktop shortcut...
set "SCRIPT_DIR=%~dp0"
set "SHORTCUT_NAME=HybridTurtle Dashboard"

:: Use PowerShell to create a proper shortcut (paths are escaped to handle special chars)
powershell -NoProfile -ExecutionPolicy Bypass -Command "$scriptDir = '%SCRIPT_DIR%' -replace \"'\", \"''\"; $ws = New-Object -ComObject WScript.Shell; $desktop = [Environment]::GetFolderPath('Desktop'); $lnk = Join-Path $desktop '%SHORTCUT_NAME%.lnk'; $sc = $ws.CreateShortcut($lnk); $sc.TargetPath = Join-Path $scriptDir 'start.bat'; $sc.WorkingDirectory = $scriptDir; $sc.Description = 'Launch HybridTurtle Trading Dashboard'; $sc.IconLocation = 'shell32.dll,21'; $sc.Save()"

if !errorlevel! equ 0 (
    echo         Desktop shortcut created!
) else (
    echo         Could not create shortcut. No problem - you can run start.bat manually.
)

:: ── Step 7: Optional — Telegram Notifications ──
echo.
echo  [7/8] Telegram Notifications (optional)
echo.
echo   HybridTurtle can send you a daily summary on your phone
echo   via Telegram. You'll get stop updates, trigger alerts,
echo   and portfolio health every evening.
echo.
echo   If you don't have Telegram set up yet, just press Enter
echo   to skip — you can configure it later in the Settings page.
echo.
set /p SETUP_TELEGRAM="  Set up Telegram notifications? (Y/N or Enter to skip): "
if /i not "%SETUP_TELEGRAM%"=="Y" if /i not "%SETUP_TELEGRAM%"=="N" (
    set "SETUP_TELEGRAM=N"
)
if /i not "%SETUP_TELEGRAM%"=="Y" (
    echo         Skipped — configure anytime in Settings.
    goto :skip_tg_setup
)

echo.
echo   --- How to get your Telegram credentials ---
echo.
echo   Step 1: Get your Bot Token
echo     - Open Telegram on your phone
echo     - Search for @BotFather and send /newbot
echo     - Follow the prompts, then copy the token it gives you
echo.
echo   Step 2: Get your Chat ID
echo     - Search for @userinfobot in Telegram
echo     - It replies with your numeric ID
echo.

:: Check if credentials already exist in .env
set "HAS_TOKEN="
set "HAS_CHATID="
for /f "usebackq tokens=1,2 delims==" %%a in (".env") do (
    if "%%a"=="TELEGRAM_BOT_TOKEN" if not "%%b"=="" if not "%%b"=="your-bot-token-here" set "HAS_TOKEN=1"
    if "%%a"=="TELEGRAM_CHAT_ID" if not "%%b"=="" if not "%%b"=="your-chat-id-here" set "HAS_CHATID=1"
)

if defined HAS_TOKEN if defined HAS_CHATID (
    echo         Telegram credentials already found in .env
    echo.
    set /p TG_REPLACE="  Replace existing credentials? (Y/N): "
    if /i not "!TG_REPLACE!"=="Y" (
        echo         Keeping existing credentials.
        goto :skip_tg_creds
    )
)

call :read_tg_token
if "!TG_TOKEN!"=="" (
    echo         No token entered — skipping Telegram setup.
    goto :skip_tg_setup
)

call :read_tg_chatid
if "!TG_CHATID!"=="" (
    echo         No chat ID entered — skipping Telegram setup.
    goto :skip_tg_setup
)

:: Save credentials to .env (via env vars to avoid process listing leaks)
set "_TG_TOKEN=!TG_TOKEN!"
set "_TG_CHATID=!TG_CHATID!"
powershell -NoProfile -Command "$tok = $env:_TG_TOKEN; $cid = $env:_TG_CHATID; $f = Get-Content '.env' | Where-Object { $_ -notmatch '^TELEGRAM_BOT_TOKEN=' -and $_ -notmatch '^TELEGRAM_CHAT_ID=' }; $f += \"TELEGRAM_BOT_TOKEN=$tok\"; $f += \"TELEGRAM_CHAT_ID=$cid\"; Set-Content '.env' $f"
echo         Telegram credentials saved to .env

:: Send a test message
echo.
echo         Sending test message to your Telegram...
powershell -NoProfile -Command "$tok = $env:_TG_TOKEN; $cid = $env:_TG_CHATID; $r = Invoke-RestMethod -Uri \"https://api.telegram.org/bot$tok/sendMessage\" -Method Post -ContentType 'application/json' -Body ('{\"chat_id\":\"' + $cid + '\",\"text\":\"HybridTurtle connected! You will receive trading alerts here.\"}'); if ($r.ok) { Write-Output '         Test message sent — check your Telegram!' } else { Write-Output '         !! Test message failed — check your token and chat ID.' }" 2>nul || echo         !! Could not reach Telegram API — check your internet connection.

:skip_tg_creds
:skip_tg_setup

:: ── Step 8: Register ALL scheduled tasks ──
echo.
echo  [8/8] Setting up scheduled tasks...
echo.
echo   These background tasks keep your portfolio monitored
echo   automatically — no manual work needed once set up.
echo.

:: Check for admin privileges
net session >nul 2>&1
if !errorlevel! neq 0 (
    echo         Requesting administrator privileges for task registration...
    echo         (A Windows prompt will appear — click Yes)
    echo.
    >> "%LOG%" echo [%date% %time%] Elevating for scheduled task registration
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -ArgumentList '--register-tasks-only' -Verb RunAs -Wait"
    goto :post_task_check
)
:do_register_tasks

set "TASKS_OK=0"
set "TASKS_FAIL=0"

:: Task 1: Nightly Pipeline (Mon-Fri 21:30)
echo         Nightly pipeline (Mon-Fri 21:30)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0register-nightly-task.ps1" -FromBat >> "%LOG%" 2>&1
if !errorlevel! equ 0 (
    echo           OK
    set /a TASKS_OK+=1
) else (
    echo           FAILED — see install.log
    set /a TASKS_FAIL+=1
)

:: Task 2: Intraday Alert (Mon-Fri 15:30)
echo         Intraday alert (Mon-Fri 15:30)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0register-intraday-alert.ps1" -FromBat >> "%LOG%" 2>&1
if !errorlevel! equ 0 (
    echo           OK
    set /a TASKS_OK+=1
) else (
    echo           FAILED — see install.log
    set /a TASKS_FAIL+=1
)

:: Task 3: Midday Sync (Mon-Fri 10:00, 13:00, 16:00, 19:00)
echo         Midday sync (Mon-Fri 4x daily)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0register-midday-sync.ps1" -FromBat >> "%LOG%" 2>&1
if !errorlevel! equ 0 (
    echo           OK
    set /a TASKS_OK+=1
) else (
    echo           FAILED — see install.log
    set /a TASKS_FAIL+=1
)

:: Task 4: Auto-Stop Ratchet (at logon)
echo         Auto-stop ratchet (starts at logon)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0register-auto-stop-task.ps1" -FromBat >> "%LOG%" 2>&1
if !errorlevel! equ 0 (
    echo           OK
    set /a TASKS_OK+=1
) else (
    echo           FAILED — see install.log
    set /a TASKS_FAIL+=1
)

:: Task 5: Watchdog (daily 10:00 AM)
echo         Watchdog monitor (daily 10:00)...
schtasks /delete /tn "HybridTurtle Watchdog" /f >> "%LOG%" 2>&1
schtasks /create /tn "HybridTurtle Watchdog" /tr "\"%~dp0watchdog-task.bat\" --scheduled" /sc daily /st 10:00 /rl highest /f >> "%LOG%" 2>&1
if !errorlevel! equ 0 (
    echo           OK
    set /a TASKS_OK+=1
) else (
    echo           FAILED — see install.log
    set /a TASKS_FAIL+=1
)

echo.
echo         Tasks registered: !TASKS_OK! of 5
if !TASKS_FAIL! gtr 0 (
    echo         !TASKS_FAIL! task^(s^) failed — you can register them later
    echo         by running the register-*.bat files as Administrator.
)
>> "%LOG%" echo [%date% %time%] Scheduled tasks: !TASKS_OK! OK, !TASKS_FAIL! failed

:: If we were called just for task registration, exit now
if "%~1"=="--register-tasks-only" exit /b 0
goto :install_done

:post_task_check
:: Verify tasks were registered by the elevated process
set "TASKS_REGISTERED=0"
for /f "tokens=*" %%i in ('schtasks /query /fo list 2^>nul ^| findstr /c:"HybridTurtle"') do set /a TASKS_REGISTERED+=1
if !TASKS_REGISTERED! gtr 0 (
    echo.
    echo         Scheduled tasks registered successfully.
) else (
    echo.
    echo         Could not register tasks — you may need to run
    echo         the register-*.bat files manually as Administrator.
)
>> "%LOG%" echo [%date% %time%] Post-elevation task check: !TASKS_REGISTERED! tasks found

:install_done

:: ── Done! ──
echo.
echo  ===========================================================
echo   INSTALLATION COMPLETE
echo  ===========================================================
echo.
echo   What was set up:
echo.
echo     Dashboard ............. ready
echo     Database .............. ready
echo     Desktop shortcut ...... ready
if /i "%SETUP_TELEGRAM%"=="Y" (
    echo     Telegram alerts ....... configured
) else (
    echo     Telegram alerts ....... skipped (set up later in Settings)
)
echo     Scheduled tasks ....... registered
echo.
echo   Your scheduled tasks:
echo     Nightly pipeline      Mon-Fri 21:30
echo     Intraday alert        Mon-Fri 15:30
echo     Midday sync           Mon-Fri 10:00/13:00/16:00/19:00
echo     Auto-stop ratchet     starts when you log in
echo     Watchdog monitor      daily 10:00
echo.
echo   To launch the dashboard:
echo     Double-click "HybridTurtle Dashboard" on your Desktop
echo.
echo   The dashboard opens at: http://localhost:3000
echo   First run may take a moment while the app starts up.
echo.
echo   Full install log: install.log
echo  ===========================================================
echo.
>> "%LOG%" echo [%date% %time%] ====== Install complete ======

set /p LAUNCH="  Launch the dashboard now? (Y/N): "
if /i not "%LAUNCH%"=="Y" if /i not "%LAUNCH%"=="N" (
    echo         Input not recognized, defaulting to N.
    set "LAUNCH=N"
)
if /i "%LAUNCH%"=="Y" (
    call "%~dp0start.bat"
)

pause
exit /b 0

:: ── Error handler ──
:fail
echo.
echo  ===========================================================
echo   INSTALLATION FAILED
echo  ===========================================================
echo.
echo   Check install.log for details.
echo.
>> "%LOG%" echo [%date% %time%] ====== Install FAILED ======
pause
exit /b 1

:: ── Helper subroutines ──
:: Note: DisableDelayedExpansion protects input containing special chars.
:: Bot tokens with '!' are extremely rare but would be consumed by delayed
:: expansion when the value is passed back via endlocal & set.

:read_tg_token
setlocal DisableDelayedExpansion
set /p TG_TOKEN="  Paste your Bot Token: "
endlocal & set "TG_TOKEN=%TG_TOKEN%"
goto :eof

:read_tg_chatid
setlocal DisableDelayedExpansion
set /p TG_CHATID="  Paste your Chat ID: "
endlocal & set "TG_CHATID=%TG_CHATID%"
goto :eof

:create_nightly_bat
> "%~dp0nightly-task.bat" echo @echo off
>> "%~dp0nightly-task.bat" echo cd /d "%%~dp0"
>> "%~dp0nightly-task.bat" echo echo [%%date%% %%time%%] Starting nightly process... ^>^> nightly.log
>> "%~dp0nightly-task.bat" echo call npx tsx src/cron/nightly.ts --run-now 2^>^&1 ^| powershell -NoProfile -Command "$input ^| Tee-Object -FilePath 'nightly.log' -Append"
>> "%~dp0nightly-task.bat" echo echo [%%date%% %%time%%] Nightly process finished ^(exit code: %%ERRORLEVEL%%^) ^>^> nightly.log
goto :eof
