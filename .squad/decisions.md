# Squad Decisions

## Active Decisions

### 2026-04-02 — Critical Findings Require Fixes

#### D1: Stop-Manager Bypass in reset-from-t212
- **Issue:** Direct prisma.position.update bypasses monotonic enforcement
- **Action:** Add safety guardrails at API boundary (no-op guard, protection demotion gate, audit trail)
- **Priority:** CRITICAL
- **Owner:** Fenster
- **Status:** RESOLVED (2026-04-02)
- **Decision:** Bypass is intentional (full position recalibration from broker). Sacred file `stop-manager.ts` untouched. All safety logic in reset-from-t212/route.ts wrapper + frontend confirmation dialog.

#### D2: ATR Spike HARD_BLOCK Validation
- **Issue:** ATR spike logic had bugs (adx<18 check, silent ignore when adx>=18)
- **Action:** Replace with unconditional SOFT_CAP when spiking (READY→WATCH demotion)
- **Priority:** CRITICAL
- **Owner:** Fenster & Hockney
- **Status:** RESOLVED (2026-04-02)
- **Decision:** Brad approved SOFT_CAP-only (no HARD_BLOCK) for all spike cases. Warning visibility preferred over blocking. scan-engine.test.ts created with 20 regression guards.

#### D3: Trading Logic Discrepancies
- **Issue:** Code/docs mismatch on cooldown (documented 5 vs actual 3 days), FWS weight (documented 20 vs actual 10)
- **Action:** Update TRADING-LOGIC.md to match code (code is source of truth)
- **Priority:** HIGH
- **Owner:** Fenster
- **Status:** RESOLVED (2026-04-02)
- **Decision:** Code values are correct. TRADING-LOGIC.md updated: cooldown 3 days confirmed, FWS weight 10 with OVERLAP-02 reference.

#### D4: Risk Gates Fail-Open Behavior
- **Issue:** Gates 4 & 5 pass true when cluster/sector data missing
- **Action:** Make fail-closed or explicit logging; no silent bypasses
- **Priority:** MEDIUM
- **Owner:** TBD
- **Status:** Pending
- **Raised by:** Keaton (architecture review 2026-04-02)

#### D5: Test Coverage Expansion
- **Issue:** scan-engine.ts unexamined, position-sizer.test.ts thin (4 tests)
- **Action:** Add comprehensive test suites (20+ tests per file)
- **Priority:** HIGH
- **Owner:** Hockney (partial)
- **Status:** PARTIAL (scan-engine ATR spike tests complete; full pipeline and position-sizer expansion pending)
- **Completed:** scan-engine.test.ts created with 20 tests covering ATR spike detection (2026-04-02)

## Resolved Decisions (Archive)

### 2026-04-02 — Approved User Directives

- **Directive 1 (2026-04-02T22:24:07Z):** ATR spike uses SOFT_CAP for both DI directions. Brad approved explicit decision to prefer warning visibility over hard blocking.
- **Directive 2 (2026-04-02T22:51:41Z):** Failed breakout cooldown is 3 days (code correct, TRADING-LOGIC.md was stale). Confirmed Brad's intentional design decision.

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
