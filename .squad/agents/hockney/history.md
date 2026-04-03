# Project Context

- **Owner:** Brad Liebs
- **Project:** HybridTurtle v6.0 — Systematic trading dashboard for momentum trend-following across ~268 tickers (US, UK, European markets). Turns discretionary stock trading into a repeatable, risk-first workflow.
- **Stack:** Vitest + Zod validation, TypeScript, co-located test files (*.test.ts)
- **Test commands:** `npm run test:unit` (vitest), `npm run lint` (next lint), `npm run build` (production build)
- **Critical test areas:** Sacred files (stop-manager, position-sizer, risk-gates, regime-detector, dual-score, scan-engine), nullable prediction engine fields, floor-down rule for share quantities
- **Created:** 2026-04-02

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-04-02 — Full Test Coverage Audit

**Test suite baseline:** 61 test files, 955 tests, ALL GREEN. Run time ~48s.

**Sacred file test counts:**
- stop-manager.test.ts — 26 tests (30 describe/it blocks)
- position-sizer.test.ts — 4 tests (5 blocks) ⚠️ THIN
- risk-gates.test.ts — 11 tests (12 blocks)
- regime-detector.test.ts — 19 tests (23 blocks)
- dual-score.test.ts — 51 tests (62 blocks) ✅ STRONG
- scan-engine.ts — NO direct test file. Only scan-engine-core-lite.test.ts (11 tests) covers partial exports.

**Coverage by area:**
- src/lib: 33 of 86 source files have co-located tests (38%)
- API routes: 3 of ~100 routes have tests (3%) — only positions, execute, risk
- packages: 7 of 10 have tests. config, portfolio, and data (mostly) have NONE.

**Critical untested money-touching code:**
- FX conversion (market-data.ts getFXRate) — fallback returns 1.0 for unknown currencies
- Broker sync (packages/broker/src/sync.ts) — zero position reconciliation tests
- Scan engine 7-stage pipeline (scan-engine.ts runFullScan) — no test at all
- Stop service workflow (packages/stops/src/service.ts runProtectiveStopWorkflow) — constants only
- Workflow execution (packages/workflow/src/) — only 3 state transition tests
- All 5 stops API routes — zero tests
- Nightly pipeline route — zero tests

**Key architecture patterns discovered:**
- position-sizer.test.ts is dangerously thin (4 tests for a sacred file)
- scan-engine.ts exports 5 functions; only 3 tested via core-lite proxy
- packages/risk/src/sizing.test.ts is comprehensive (17 tests, floor-down verified)
- execute/route.test.ts is the heaviest file (23 tests, 39s runtime with real timeouts)

### 2026-04-02 — scan-engine.test.ts Created (ATR Spike Detection)

**File:** `src/lib/scan-engine.test.ts` — 20 tests, all passing.

**Scope:** ATR spike detection behavior only (first test file for this sacred file).

**What's tested:**
- Median ATR spike calculation (medianAtr14 × 1.3 threshold, boundary, fallback to atrSpiking)
- Spike action + status demotion (READY→WATCH, WATCH stays, FAR stays, no-spike passthrough)
- DI direction independence (bullish/bearish DI, high/low/boundary ADX — all produce SOFT_CAP)
- HARD_BLOCK regression guard (6 parameterized cases: no input combination produces HARD_BLOCK)

**Mock pattern for runFullScan:**
- 10 `vi.mock()` declarations needed: prisma, market-data, adaptive-atr-buffer, position-sizer, risk-gates, scan-guards, data-validator, earnings-calendar, hurst
- Single-ticker universe via `prisma.stock.findMany` mock
- `calculateAdaptiveBuffer` mock controls entry trigger → controls READY/WATCH/FAR classification
- `evaluateEarningsRisk` returns benign `action: null` to avoid interfering with status

**Key architecture note:** ATR spike detection runs regardless of `passesAllFilters` — it sits between Stage 3 (classification) and the earnings check, before the `passesAllFilters && status !== 'FAR'` gate.

**Pre-existing failure:** `breakout-failure-detector.test.ts` has 1 date-sensitive test failing (day-boundary issue). Not related to scan-engine.

### 2026-04-02 — FX Rate Tests Created (market-data + position-sizer)

**Files:** `src/lib/market-data.test.ts` (new, 11 tests), `src/lib/position-sizer.test.ts` (4 added, 8 total)

**Context:** Fenster fixed `getFXRate()` to throw on unknown pairs instead of returning 1.0. Tests guard the fix.

**What's tested (market-data.test.ts):**
- Same-currency identity (GBP→GBP, USD→USD returns 1)
- Known fallback pairs return correct rates when Yahoo fails (USDGBP=0.79, EURGBP=0.86, CHFGBP=0.89, GBPUSD=1.27)
- Unknown pairs (XYZ→GBP, BRL→GBP) throw — NEVER return 1.0
- All 7 foreign→GBP fallbacks verified ≠ 1.0 (regression guard)
- Live Yahoo rate returned when available
- Source code audit: `getFXRate` body contains no `?? 1` fallback

**What's tested (position-sizer.test.ts FX additions):**
- fxToGbp affects share count (lower FX = more shares)
- totalCost correctly denominated in GBP via fxToGbp
- fxToGbp=0 throws (unavailable rate guard)
- Negative fxToGbp throws

**Mocking pattern for market-data.ts:**
- Mock `yahoo-finance2` with class constructor (v3 API requires `new YahooFinance()`)
- Export `__mockQuote` from mock for test access
- Mock `fetch-retry` `withRetry` as passthrough: `vi.fn(async (fn) => fn())`
- Mock 5 sibling imports: regime-detector, market-data-eodhd, breakout-integrity, cache-persistence, cache-keys
- `server-only` handled by vitest alias (vitest.config.ts)
- FX cache survives between tests within same describe; use `forceRefresh: true` to bypass
- **Result:** 990 tests pass (up from 974, +16 tests).
