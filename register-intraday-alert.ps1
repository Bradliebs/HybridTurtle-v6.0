# ============================================================
# HybridTurtle - Register Intraday Alert Scheduled Task
# ============================================================
# Checks live prices against signal triggers and auto-applies stops.
# Sends a focused Telegram summary at 15:30 UK time on weekdays.
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
Write-Host "   HybridTurtle - Registering Intraday Alert Scheduled Task" -ForegroundColor Cyan
Write-Host "  ==========================================================" -ForegroundColor Cyan
Write-Host ""

try {
    # Resolve the project directory from this script's location
    $ProjectDir = Split-Path -Parent $PSCommandPath

    # Remove existing task if present
    $existing = Get-ScheduledTask -TaskName "HybridTurtle Intraday Alert" -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "  Removing existing task..." -ForegroundColor Yellow
        Unregister-ScheduledTask -TaskName "HybridTurtle Intraday Alert" -Confirm:$false
    }

    $Action = New-ScheduledTaskAction `
        -Execute "cmd.exe" `
        -Argument "/c `"$ProjectDir\intraday-alert-task.bat`" --scheduled" `
        -WorkingDirectory $ProjectDir

    # Trigger: Mon-Fri at 15:30 (3:30 PM UK time)
    $Trigger = New-ScheduledTaskTrigger `
        -Weekly `
        -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday `
        -At 15:30

    $Settings = New-ScheduledTaskSettingsSet `
        -StartWhenAvailable `
        -DontStopIfGoingOnBatteries `
        -AllowStartIfOnBatteries `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

    $Principal = New-ScheduledTaskPrincipal `
        -UserId "$env:USERNAME" `
        -LogonType S4U `
        -RunLevel Highest

    $task = Register-ScheduledTask `
        -TaskName "HybridTurtle Intraday Alert" `
        -Action $Action `
        -Trigger $Trigger `
        -Settings $Settings `
        -Principal $Principal `
        -Description "HybridTurtle intraday trigger check & auto-stop ratchet (Mon-Fri 15:30)"

    Write-Host ""
    Write-Host "  Task registered successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Schedule: Mon-Fri at 15:30" -ForegroundColor White
    Write-Host "  Action:   intraday-alert-task.bat --scheduled" -ForegroundColor White
    Write-Host "  Timeout:  15 minutes" -ForegroundColor White
    Write-Host ""
    Write-Host "  To test now:  double-click intraday-alert-task.bat" -ForegroundColor Yellow
    Write-Host "  To remove:    schtasks /delete /tn `"HybridTurtle Intraday Alert`" /f" -ForegroundColor Yellow
    Write-Host ""

} catch {
    Write-Host ""
    Write-Host "  FAILED to register task: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Try running as administrator, or register manually:" -ForegroundColor Yellow
    Write-Host "    schtasks /create /tn `"HybridTurtle Intraday Alert`" /tr `"cmd /c intraday-alert-task.bat --scheduled`" /sc weekly /d MON,TUE,WED,THU,FRI /st 15:30 /ru %USERNAME%" -ForegroundColor Gray
    Write-Host ""
}

if (-NOT $FromBat) {
    Write-Host "Press any key to close..."
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}
