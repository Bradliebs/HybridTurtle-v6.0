# Project Context

- **Owner:** Brad Liebs
- **Project:** HybridTurtle v6.0 — Systematic trading dashboard for momentum trend-following across ~268 tickers (US, UK, European markets). Turns discretionary stock trading into a repeatable, risk-first workflow.
- **Stack:** Next.js 14 App Router, TypeScript, Prisma ORM, SQLite, Trading 212 broker adapter, Yahoo Finance data, Telegram Bot API
- **Backend Scale:** 46 route groups (~109 endpoints), 40 DB tables (24 core + 16 prediction engine), 10 packages (broker, config, data, model, portfolio, risk, signals, stops, workflow, backtest)
- **Key workflows:** Evening pipeline (workflow:run), signal scan (signals:run), broker sync (broker:sync), stop management, position sizing
- **Sacred files (DO NOT MODIFY):** stop-manager.ts, position-sizer.ts, risk-gates.ts, regime-detector.ts, dual-score.ts, scan-engine.ts
- **Created:** 2026-04-02

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-04-02 — ATR Spike Detection Fix (scan-engine.ts)
- **Sacred file edit** (explicit Brad approval): Replaced broken ADX-based ATR spike logic with correct SOFT_CAP-always behavior.
- **Bug was:** `adx < 18` check instead of DI direction; `adx >= 18` silently ignored spikes; HARD_BLOCK path documented but never existed in code.
- **Brad's decision:** No HARD_BLOCK for ATR spikes — warning (SOFT_CAP → WATCH) over blocking, regardless of DI direction.
- **Key pattern:** When both branches of a condition produce the same action, simplify — don't branch. The DI check was removed entirely since both paths demote to WATCH.
- **TRADING-LOGIC.md updated** in three places: pipeline overview, ATR Spike Logic section, and post-classification overrides.
- **Tests:** 955/955 passed, 61 test files — no regressions.

### 2026-07-18 — Reset-from-T212 Safety Guardrails (D1 fix)
- **Problem:** `reset-from-t212/route.ts` bypassed monotonic stop enforcement (stop-manager.ts) via direct `prisma.position.update()`. Only bypass in the codebase.
- **Decision:** Full position resets are legitimate (new entry price from broker), so routing through `updateStopLoss()` would reject valid resets. Added safety guardrails instead.
- **Changes:**
  1. **No-op guard:** Skips reset if T212 entry price matches current (within 0.5% tolerance) and shares unchanged.
  2. **Protection demotion gate:** If position has protection above INITIAL (BREAKEVEN/LOCK_08R/LOCK_1R_TRAIL), returns HTTP 409 requiring `?force=true` query param to proceed.
  3. **Enhanced audit trail:** StopHistory reason now prefixed `BROKER-SYNC RESET:` with old protection level and `[DEMOTION — force=true]` tag when applicable.
  4. **Console warning:** Logs protection demotions for monitoring.
  5. **Frontend:** PositionsTable.tsx button handler catches 409, shows confirmation dialog, retries with `?force=true`.
- **Sacred file preserved:** stop-manager.ts untouched. All safety logic lives in the route wrapper.
- **Tests:** 955 passed, 1 pre-existing failure (breakout-failure-detector, unrelated).

### 2026-04-02 — Doc Alignment + Cooldown Confirmation
- **Issue:** TRADING-LOGIC.md had stale values: cooldown documented as 5 days (actual 3), FWS weight as 20 (actual 10).
- **Decision:** Code is source of truth. Updated TRADING-LOGIC.md to match actual implementation.
- **Changes:** 4 edits total: cooldown 3-day references (3 occurrences), FWS weight 10 with OVERLAP-02 note.
- **Confirmation:** Brad confirmed cooldown reduction to 3 days was intentional design decision.
- **Impact:** Documentation now reflects actual behavior.
