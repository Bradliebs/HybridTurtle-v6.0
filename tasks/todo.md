# HybridTurtle v6 — Task Tracker

## Completed

- [x] **Full Application Audit — Implementation** (2026-04-04)
  - Fixed watchdog heartbeat status mismatch — excluded `'OK'` and filtered out midday/intraday heartbeats
  - Added FX normalization failure Telegram alert in nightly pipeline
  - Fixed Telegram webhook timing attack — `crypto.timingSafeEqual()` replaces `!==`
  - Replaced raw SQL with Prisma client for near-stop alert queries
  - Fixed auto-stop T212 fallback — clears `accountType` when both accounts fail
  - Wrapped lazy-loaded tabs (Scores, CrossRef, Distribution, Performance) in ErrorBoundary with retry
  - Added confirmation dialogs on Safety Controls and Auto-Stop toggle switches
  - Build passes, 1025/1025 tests pass

- [x] **Intraday Trigger & Stop Alert** (2026-04-04)
  - Created `src/cron/intraday-alert.ts` — fetches live Yahoo prices, detects trigger-met candidates, auto-applies stops via `runAutoStopCycle()`, sends focused Telegram summary (always, even when quiet)
  - Created `scripts/run-intraday-alert.ts` — CLI entry point (`npm run intraday:alert`)
  - Created `intraday-alert-task.bat` — batch runner for Task Scheduler
  - Created `register-intraday-alert.ps1` + `.bat` — registers "HybridTurtle Intraday Alert" Mon-Fri 15:30
  - Updated `register-nightly-task.ps1` — moved nightly from 21:00 → 21:30
  - Added `"intraday:alert"` to `package.json` scripts
  - Verified: build passes, 1025/1025 tests pass, manual run works (weekend skip confirmed)
  - **Post-registration required:** Run `register-intraday-alert.bat` and `register-nightly-task.bat` to apply schedules

## In Progress

_(none)_

## Backlog

_(add future tasks here)_
