# Work Routing

How to decide who handles what.

## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| Architecture & design | Keaton | System design, API contracts, sacred file oversight, schema design |
| Code review | Keaton | Review PRs, quality gating, sacred file approval |
| Scope & priorities | Keaton | What to build next, trade-offs, triage |
| React components & pages | McManus | Dashboard UI, charts, tables, widgets, TailwindCSS |
| Frontend data fetching | McManus | Client state, lazy loading, page layout |
| API routes & endpoints | Fenster | REST endpoints, route handlers, middleware |
| Database & migrations | Fenster | Prisma schema, migrations, queries, seeds |
| Data pipeline | Fenster | Yahoo Finance ingestion, broker sync, workflow scripts |
| Trading logic (non-sacred) | Fenster | New modules wrapping sacred file outputs |
| Package layer | Fenster | packages/* (broker, config, data, model, portfolio, risk, signals, stops, workflow, backtest) |
| Testing | Hockney | Write tests, find edge cases, verify fixes, coverage |
| Trading logic validation | Hockney | Test sacred file boundaries, risk-sensitive code verification |
| Session logging | Scribe | Automatic — never needs routing |
| Work monitoring | Ralph | Backlog status, issue tracking, pipeline health |

## Issue Routing

| Label | Action | Who |
|-------|--------|-----|
| `squad` | Triage: analyze issue, assign `squad:{member}` label | Lead |
| `squad:{name}` | Pick up issue and complete the work | Named member |

### How Issue Assignment Works

1. When a GitHub issue gets the `squad` label, the **Lead** triages it — analyzing content, assigning the right `squad:{member}` label, and commenting with triage notes.
2. When a `squad:{member}` label is applied, that member picks up the issue in their next session.
3. Members can reassign by removing their label and adding another member's label.
4. The `squad` label is the "inbox" — untriaged issues waiting for Lead review.

## Rules

1. **Eager by default** — spawn all agents who could usefully start work, including anticipatory downstream work.
2. **Scribe always runs** after substantial work, always as `mode: "background"`. Never blocks.
3. **Quick facts → coordinator answers directly.** Don't spawn an agent for "what port does the server run on?"
4. **When two agents could handle it**, pick the one whose domain is the primary concern.
5. **"Team, ..." → fan-out.** Spawn all relevant agents in parallel as `mode: "background"`.
6. **Anticipate downstream work.** If a feature is being built, spawn the tester to write test cases from requirements simultaneously.
7. **Issue-labeled work** — when a `squad:{member}` label is applied to an issue, route to that member. The Lead handles all `squad` (base label) triage.
