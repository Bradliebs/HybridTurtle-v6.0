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
