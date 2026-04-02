# Project Context

- **Owner:** Brad Liebs
- **Project:** HybridTurtle v6.0 — Systematic trading dashboard for momentum trend-following across ~268 tickers (US, UK, European markets). Turns discretionary stock trading into a repeatable, risk-first workflow.
- **Stack:** Next.js 14 App Router, React 18, TypeScript, TailwindCSS, Prisma ORM, SQLite, Trading 212 broker, Yahoo Finance data, Telegram notifications
- **Scale:** 28 pages, 46 route groups (~109 endpoints), 40 DB tables (24 core + 16 prediction engine), 17 prediction phases
- **Sacred files:** stop-manager.ts, position-sizer.ts, risk-gates.ts, regime-detector.ts, dual-score.ts, scan-engine.ts — affect real money, require explicit approval
- **Created:** 2026-04-02

## Learnings

<!-- Append new learnings below. Each entry is something lasting about the project. -->

### 2026-04-02 — Team Review Results (Critical Findings Across Three Agents)

**Cross-team findings shared:**
- **Keaton found:** reset-from-t212 bypass + risk gate fail-open
- **Trading Logic Reviewer found:** ATR HARD_BLOCK missing + cooldown/FWS mismatches
- **Hockney found:** scan-engine untested + position-sizer dangerously thin

**Action items pending:** 5 critical/high fixes documented in .squad/decisions.md (D1–D5).

### 2026-04-02 — Full Architecture Review (System-Wide)

**Sacred files:** All 6 confirmed intact. Monotonic stop enforcement solid. floorShares() used correctly. Risk gates enforce all 6 checks. 3-day regime stability confirmed. BQS/FWS/NCS weights untouched. 7-stage pipeline intact with CORE_LITE overlay.

**Critical finding:** `src/app/api/positions/reset-from-t212/route.ts` bypasses stop-manager monotonic enforcement via direct prisma.position.update on currentStop/stopLoss. Intentional for corrupted data recovery — but lacks a monotonic guard and should be wrapped in a dedicated reset function within stop-manager.ts with explicit audit logging.

**Risk gate concern:** Gates 4 (cluster) and 5 (sector) pass with `true` when cluster/sector data is missing. This means positions without cluster/sector assignment silently bypass concentration limits. Should be fail-closed or logged.

**Package layer issues:** backtest package imports from src/lib/dual-score and src/lib/breakout-probability (layer violation). config package has no barrel index.ts. signals/candidates.ts bypasses workflow barrel export.

**Schema:** 69 models, ~25 FK fields missing indexes. 3 models have broken @updatedAt patterns (SignalBeliefState, BrokerPosition, BrokerOrder). Mixed ID strategy (38 CUID / 30 autoincrement) — acceptable but undocumented.

**API routes:** 109 route files across 42 groups. All delegate properly to sacred files. /api/nightly (757 lines) is the biggest refactoring candidate. Error handling is consistent with apiError() wrapper.

**Key paths:**
- Sacred files: `src/lib/{stop-manager,position-sizer,risk-gates,regime-detector,dual-score,scan-engine}.ts`
- Risk bypass: `src/app/api/positions/reset-from-t212/route.ts` (line 116-129)
- Missing barrel: `packages/config/src/` (no index.ts)
- Layer violations: `packages/backtest/src/runner.ts` imports from `src/lib/`
