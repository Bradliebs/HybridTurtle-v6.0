# ============================================================
# HybridTurtle - Register Auto-Stop Scheduled Task
# ============================================================
# Called from register-auto-stop-task.bat (already elevated)
# OR right-click -> Run with PowerShell (self-elevates)
# ============================================================

param([switch]$FromBat)

# Self-elevate if not running as admin
if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Requesting administrator privileges..." -ForegroundColor Yellow
    Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}

Write-Host ""
Write-Host "  ==========================================================" -ForegroundColor Cyan
Write-Host "   HybridTurtle - Registering Auto-Stop Scheduled Task" -ForegroundColor Cyan
Write-Host "  ==========================================================" -ForegroundColor Cyan
Write-Host ""

try {
    # Resolve the project directory from this script's location
    $ProjectDir = Split-Path -Parent $PSCommandPath

    # Remove existing task if present
    $existing = Get-ScheduledTask -TaskName "HybridTurtle AutoStop" -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "  Removing existing task..." -ForegroundColor Yellow
        Unregister-ScheduledTask -TaskName "HybridTurtle AutoStop" -Confirm:$false
    }

    $Action = New-ScheduledTaskAction `
        -Execute "cmd.exe" `
        -Argument "/c `"$ProjectDir\auto-stop-task.bat`" --scheduled" `
        -WorkingDirectory $ProjectDir

    # Start at logon — the scheduler is a long-running process
    $Trigger = New-ScheduledTaskTrigger -AtLogOn

    $Settings = New-ScheduledTaskSettingsSet `
        -StartWhenAvailable `
        -DontStopIfGoingOnBatteries `
        -AllowStartIfOnBatteries `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 5) `
        -ExecutionTimeLimit (New-TimeSpan -Days 0)

    # Don't stop on idle — this is a long-running daemon
    $Settings.IdleSettings.StopOnIdleEnd = $false

    $Principal = New-ScheduledTaskPrincipal `
        -UserId "$env:USERNAME" `
        -LogonType Interactive `
        -RunLevel Limited

    $task = Register-ScheduledTask `
        -TaskName "HybridTurtle AutoStop" `
        -Action $Action `
        -Trigger $Trigger `
        -Settings $Settings `
        -Principal $Principal `
        -Description "HybridTurtle auto-stop scheduler — checks stops hourly Mon-Fri"

    Write-Host ""
    Write-Host "  SUCCESS: Task 'HybridTurtle AutoStop' registered!" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Trigger:     At logon (starts automatically)" -ForegroundColor White
    Write-Host "  Schedule:    Internal cron checks hourly Mon-Fri" -ForegroundColor White
    Write-Host "  Time limit:  None (runs continuously)" -ForegroundColor White
    Write-Host "  On failure:  Restarts up to 3 times (5 min interval)" -ForegroundColor White
    Write-Host "  Log file:    auto-stop.log" -ForegroundColor White
    Write-Host ""

} catch {
    Write-Host ""
    Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
if (-NOT $FromBat) {
    Write-Host "  Press any key to close..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}
