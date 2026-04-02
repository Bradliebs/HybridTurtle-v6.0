---
description: "Diagnose nightly evening workflow failures: collect run status, step-by-step logs, heartbeat results, and recent errors"
agent: "agent"
tools: [read, search, execute]
argument-hint: "Describe the symptom (e.g. 'workflow failed at stop reconciliation step')"
---
Diagnose the most recent evening workflow failure. Follow these steps:

## 1. Check recent workflow runs

Search for the latest `TonightWorkflowRun` records in the database. Look at status (SUCCESS / PARTIAL / FAILED), step results, and error messages.

```bash
npm run workflow:card
```

## 2. Check heartbeat

Look for the latest `Heartbeat` record to see if the system reported SUCCESS, PARTIAL, or FAILED.

## 3. Inspect step-by-step results

The evening workflow has these ordered steps (defined in `packages/workflow/src/service.ts`):
1. **refresh-data** — Yahoo Finance OHLCV fetch for universe
2. **run-scan** — 7-stage signal scan
3. **review-candidates** — candidate review and filtering
4. **review-risk** — evening risk assessment
5. **generate-plan** — next-session execution plan
6. **sync-broker** — Trading 212 position sync
7. **verify-stops** — protective stop verification

For each step, report: status, duration, error (if any).

## 4. Check for common failure modes

- **Data fetch failures**: Yahoo Finance rate limiting, network timeouts, stale symbols
- **Scan failures**: Missing price data, regime detection issues
- **Stop reconciliation**: Position mismatches between DB and broker
- **Risk review**: Account state calculation errors

## 5. Check relevant logs

Search for recent errors in:
- [packages/workflow/src/service.ts](../../packages/workflow/src/service.ts) — workflow orchestration
- [packages/data/src/service.ts](../../packages/data/src/service.ts) — data ingestion
- [packages/broker/src/sync.ts](../../packages/broker/src/sync.ts) — broker sync

## 6. Summarize

Report:
- Which step failed and why
- Whether the failure is transient (retry) or structural (code fix needed)
- Recommended next action
