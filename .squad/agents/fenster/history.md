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
