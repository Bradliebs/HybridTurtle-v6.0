---
applyTo: "src/lib/{stop-manager,position-sizer,risk-gates,regime-detector,dual-score,scan-engine}.ts"
description: "Use when viewing, editing, or referencing sacred trading files (stop-manager, position-sizer, risk-gates, regime-detector, dual-score, scan-engine). Enforces safety rules for files that affect real money."
---
# Sacred File Guard

**These files affect real money. Do NOT modify without explicit user approval.**

## Rules by file

| File | Critical constraint |
|------|---------------------|
| `stop-manager.ts` | Stops NEVER decrease. Monotonic enforcement is the single most important rule. |
| `position-sizer.ts` | `floorShares()` only — never `Math.round` / `Math.ceil`. FX conversion before sizing. |
| `risk-gates.ts` | All 6 gates must pass. No bypass, no override, no soft exceptions. |
| `regime-detector.ts` | 3 consecutive days required for BULLISH confirmation. Do not reduce. |
| `dual-score.ts` | BQS/FWS/NCS weights are intentional. Do not rebalance. |
| `scan-engine.ts` | 7-stage pipeline. Stages cannot be added, removed, or reordered casually. |

## What to do instead

- Create new modules that **wrap** or **post-process** outputs from these files.
- Never inject new logic into sacred files.
- If a change is truly needed, confirm the exact rule being modified and get explicit approval.

## Header convention

Each sacred file has a JSDoc dependency header. If you do make an approved edit, update the `Last modified` date and verify the consumer list is still accurate.
