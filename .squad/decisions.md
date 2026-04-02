# Squad Decisions

## Active Decisions

### 2026-04-02 — Critical Findings Require Fixes

#### D1: Stop-Manager Bypass in reset-from-t212
- **Issue:** Direct prisma.position.update bypasses monotonic enforcement
- **Action:** Wrap reset logic in dedicated function in stop-manager.ts with audit logging
- **Priority:** CRITICAL
- **Owner:** TBD
- **Status:** Pending

#### D2: ATR Spike HARD_BLOCK Validation
- **Issue:** ATR spike bypass (>2.5× baseline) not validated in scan-engine
- **Action:** Add validation gate to reject entries when ATR spike detected
- **Priority:** CRITICAL
- **Owner:** TBD
- **Status:** Pending

#### D3: Trading Logic Discrepancies
- **Issue:** Code/docs mismatch on cooldown (2 vs 3 days), FWS weight (0.25 vs 0.30)
- **Action:** Align code to documented TRADING-LOGIC.md specifications
- **Priority:** HIGH
- **Owner:** TBD
- **Status:** Pending

#### D4: Risk Gates Fail-Open Behavior
- **Issue:** Gates 4 & 5 pass true when cluster/sector data missing
- **Action:** Make fail-closed or explicit logging; no silent bypasses
- **Priority:** MEDIUM
- **Owner:** TBD
- **Status:** Pending

#### D5: Test Coverage Expansion
- **Issue:** scan-engine.ts unexamined, position-sizer.test.ts thin (4 tests)
- **Action:** Add comprehensive test suites (20+ tests per file)
- **Priority:** HIGH
- **Owner:** TBD
- **Status:** Pending

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
