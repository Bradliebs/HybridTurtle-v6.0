# HybridTurtle v6 — Project Guidelines

Systematic trading dashboard for momentum trend-following across ~268 tickers (US, UK, European markets). Turns discretionary stock trading into a repeatable, risk-first workflow.

## Architecture

- **Stack:** Next.js 14 App Router, React 18, TypeScript, TailwindCSS, Prisma ORM, SQLite
- **Broker:** Trading 212 (dual-account: Invest + ISA)
- **Data source:** Yahoo Finance (free, no API key)
- **Notifications:** Telegram Bot API
- **Auth:** NextAuth JWT (single-user local app)

### Directory structure

| Path | Purpose |
|------|---------|
| `src/app/` | Next.js App Router pages and API routes (~28 pages, ~46 route groups) |
| `src/lib/` | Core trading logic — **contains sacred files** (see below) |
| `src/components/` | React UI components |
| `packages/` | Modular domain packages (broker, config, data, model, portfolio, risk, signals, stops, workflow, backtest) |
| `prisma/` | Schema, migrations, seeds (SQLite) |
| `scripts/` | CLI tools run via `tsx` (broker sync, signal scan, workflow, etc.) |
| `services/model-service/` | Optional Python model service (Docker profile `model`) |
| `Planning/` | CSV/TXT universe files and cluster maps |
| `data/` | Universe CSV |
| `docs/` | Reference docs — link here, don't duplicate |

### Package layer (`packages/`)

Each package has a barrel `index.ts`. Import from the package root, not internal files:

```ts
// ✅ Good
import { runSignalScan } from '../../packages/signals/src';
// ❌ Bad
import { runSignalScan } from '../../packages/signals/src/candidates';
```

Key packages: `broker` (T212 adapter + sync), `config` (Zod-validated env), `data` (Yahoo OHLCV ingestion), `model` (ML prediction layer), `portfolio` (review & views), `risk` (account state, sizing, validation), `signals` (breakout/trend analysis, scan), `stops` (protective stop workflow), `workflow` (evening pipeline orchestration), `backtest` (signal replay).

## Sacred Files — DO NOT MODIFY without explicit instruction

These files affect real money. Changes require explicit user approval:

| File | Rule |
|------|------|
| `src/lib/stop-manager.ts` | Stops NEVER decrease. Monotonic enforcement is the most important rule. |
| `src/lib/position-sizer.ts` | Uses `floorShares()` only — never `Math.round`/`Math.ceil`. FX conversion before sizing. |
| `src/lib/risk-gates.ts` | All 6 gates must pass. No bypass, no override, no soft exceptions. |
| `src/lib/regime-detector.ts` | 3 consecutive days required for BULLISH confirmation. Do not reduce. |
| `src/lib/dual-score.ts` | BQS/FWS/NCS weights are intentional. Do not rebalance. |
| `src/lib/scan-engine.ts` | 7-stage pipeline. Stages cannot be added, removed, or reordered casually. |

When adding new features, follow the existing pattern: create new modules that _wrap_ or _post-process_ sacred file outputs. Never inject logic into them.

## Build & Test

```bash
npm install           # install deps + runs prisma generate (postinstall)
npm run dev           # local dev server (Next.js)
npm run build         # production build
npm run test:unit     # vitest (src/**/*.test.ts, packages/**/*.test.ts)
npm run lint          # next lint
```

### Database

```bash
npm run db:migrate    # prisma migrate dev (create migration)
npm run db:deploy     # prisma migrate deploy (apply migrations)
npm run db:generate   # prisma generate (regenerate client)
npm run db:studio     # prisma studio GUI
npm run db:seed       # seed database
```

**Never use `db push`** — it's intentionally blocked. Always use migrations.

### Key scripts

```bash
npm run workflow:run       # run evening workflow pipeline
npm run signals:run        # run signal scan
npm run broker:sync        # sync Trading 212 positions
npm run portfolio:view     # show portfolio state
npm run stops:view         # show stop dashboard
npm run validate:universe  # validate universe data
```

## Conventions

- **Path alias:** `@/*` maps to `src/*` — use it in app/component imports
- **Env config:** All environment variables validated via Zod in `packages/config/src/env.ts`. Add new vars there.
- **DEPENDENCY headers:** Most files in `src/lib/` and `packages/` start with a JSDoc block listing consumers, dependencies, risk-sensitivity, and last-modified date. Preserve and update these headers when editing files.
- **Prisma schema:** SQLite provider. 69 tables. All migrations are additive — never drop columns in production.
- **Risk-sensitive code:** Any code touching position sizing, stop management, or order execution must be flagged `Risk-sensitive: YES` in its header.
- **Floor-down rule:** Share quantities are always `Math.floor()`. Never round up. This applies in both `src/lib/position-sizer.ts` and `packages/risk/src/sizing.ts`.
- **Nullable novel signals:** Prediction engine fields are nullable (`Float?`). The system must work identically when they're all null.
- **Test files:** Co-located as `*.test.ts` next to source. Vitest with node environment.

## Detailed documentation

Do not duplicate — link to these:

- [SYSTEM-BREAKDOWN.md](../SYSTEM-BREAKDOWN.md) — Full technical reference (pages, components, API routes, modules)
- [TRADING-LOGIC.md](../TRADING-LOGIC.md) — All trading rules, thresholds, decision logic
- [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) — Docker, CI, cloud deployment
- [USER-GUIDE.md](../USER-GUIDE.md) — End-user guide
- [DASHBOARD-GUIDE.md](../DASHBOARD-GUIDE.md) — Dashboard usage
- [SETUP-README.md](../SETUP-README.md) — Setup instructions

## Pitfalls

- **`db push` is blocked** — Always `db:migrate`. The npm script intentionally errors.
- **Excluding temp files:** tsconfig excludes `_investigate_*.ts`, `_temp_*.ts`, `_temp_*.js` — these are scratch files, don't clean them up.
- **Broker modes:** `BROKER_ADAPTER` can be `mock`, `trading212`, or `disabled`. Default is `disabled`. Mock mode uses fixtures at `docs/fixtures/mock-broker-state.json`.
- **SQLite limitations:** No concurrent writes. Nightly pipeline steps are sequential by design.
- **Model service is optional:** The Python model service runs under Docker profile `model`. The app works without it (`modelLayerEnabled` defaults to `false`).
