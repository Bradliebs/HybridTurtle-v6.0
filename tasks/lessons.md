# HybridTurtle v6 — Lessons Learned

## Patterns & Rules

### 1. Cron file self-execution guard
**Problem:** When a `src/cron/*.ts` file has an auto-execute block at the bottom (`if (isDirectRun) { ... }`), using a broad check like `process.argv[1]?.includes('intraday-alert')` will match BOTH the cron file AND any script in `scripts/` that imports it (e.g. `scripts/run-intraday-alert.ts`), causing double execution.

**Fix:** Use the full relative path in the check:
```ts
const isDirectRun = process.argv[1]?.replace(/\\/g, '/').includes('src/cron/intraday-alert');
```

**Rule:** When adding a self-execute guard to a cron module that's also imported by a script, match on the full `src/cron/` path, not just the filename.

### 2. Sacred file safety
**Rule:** Never modify sacred files (`stop-manager.ts`, `position-sizer.ts`, `risk-gates.ts`, `regime-detector.ts`, `dual-score.ts`, `scan-engine.ts`). Always create wrapper modules that call their exported functions. For auto-stop features, call `runAutoStopCycle()` from `auto-stop-service.ts` which wraps the sacred `updateStopLoss()`.

### 3. Telegram message convention
- Always use `parseMode: 'HTML'` (not Markdown)
- Escape user-facing text with `escapeHtml()` (replace `&`, `<`, `>`)
- Auto-split messages > 4096 chars via `sendTelegramMessage()`
- Currency symbols: `£` for GBP/GBX, `€` for EUR, `$` default
- Always send a summary even when "all quiet" — confirms the task ran

### 4. Scheduled task pattern
For any new scheduled task, create all 3 files:
1. `*-task.bat` — batch runner with Node.js/.env checks, logging, `--scheduled` flag for non-interactive mode
2. `register-*.ps1` — PowerShell registration with self-elevation, task removal before re-register
3. `register-*.bat` — double-click wrapper that self-elevates and calls the PS1

### 5. Weekend skip pattern
Use the UK timezone check from `midday-sync.ts`:
```ts
function getUKDayOfWeek(): number {
  const now = new Date();
  const ukTime = new Date(now.toLocaleString('en-GB', { timeZone: 'Europe/London' }));
  return ukTime.getDay();
}
```
Write a `Heartbeat` with status `'SKIPPED'` when skipping weekends.

### 6. Verify Telegram delivery explicitly
**Problem:** When testing a scheduled task on a weekend, the weekend guard skips everything (including Telegram send), so `telegramSent: false` is expected but doesn't prove Telegram works. The user will think it's broken.

**Rule:** After building any Telegram-sending feature, always send a direct test message via `sendTelegramMessage()` to prove delivery works, regardless of scheduling guards. Don't mark verification complete until the user confirms receipt.
