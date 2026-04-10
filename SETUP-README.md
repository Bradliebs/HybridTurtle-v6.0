# HybridTurtle Trading Dashboard v6.0

A systematic trading dashboard built on the Turtle Trading methodology with modern risk management.

---

## Quick Start (Windows)

### First Time Setup

1. **Double-click `install.bat`**
   - It will check for Node.js (and help you install it if missing)
   - Installs all dependencies automatically
   - Sets up the local SQLite database
   - Seeds the stock universe (268 tickers)
   - Creates a desktop shortcut

2. **That's it!** The installer will ask if you want to launch immediately.

### Daily Use

- **Double-click the "HybridTurtle Dashboard" shortcut** on your Desktop
- Or double-click `start.bat` in the project folder
- The dashboard opens at **http://localhost:3000**
- **Keep the black terminal window open** while using the dashboard
- Close the terminal window to stop the server

---

## What Each File Does

| File | Purpose |
|------|---------|
| `install.bat` | One-time setup — installs Node.js deps, database, desktop shortcut, scheduled tasks |
| `start.bat` | Daily launcher — starts the server and opens your browser |
| `run-dashboard.bat` | Compatibility alias — redirects to `start.bat` |
| `update.bat` | Run after getting new code — updates deps and database |
| `package.bat` | Package the app into a distributable zip |
| `nightly-task.bat` | Run nightly automation (Mon-Fri 21:30) |
| `watchdog-task.bat` | Check for missed nightly heartbeats, send Telegram alert |
| `midday-sync-task.bat` | Lightweight intra-day T212 position sync (Mon-Fri 10:00, 13:00, 16:00, 19:00) |
| `intraday-alert-task.bat` | Intraday trigger check + auto-stop ratchet (Mon-Fri 15:30) |
| `auto-stop-task.bat` | Auto-stop ratchet scheduler (at logon + hourly on weekdays) |
| `research-refresh-task.bat` | Research data refresh (candidate outcomes) |
| `register-nightly-task.bat` | Register nightly as a Windows Scheduled Task (Mon-Fri 21:30) |
| `register-watchdog-task.bat` | Register watchdog as a Windows Scheduled Task (10:00 AM daily) |
| `register-midday-sync.bat` | Register midday sync as a Windows Scheduled Task |
| `register-intraday-alert.bat` | Register intraday alert as a Windows Scheduled Task (Mon-Fri 15:30) |
| `register-auto-stop-task.bat` | Register auto-stop as a Windows Scheduled Task |
| `fix-account-types.bat` | Fix ISA vs Invest account type mismatches |
| `restore-backup.bat` | Restore database from a backup (emergency use) |

---

## System Requirements

- **Windows 10 or 11**
- **Node.js 18+** (20 or 22 LTS recommended — choose the **LTS** tab on nodejs.org)
- **4 GB RAM** minimum
- **Internet connection** (for live market data from Yahoo Finance)

---

## Features

- **7-Stage Scan Engine** — Systematic screening from 268 stocks
- **Risk Management** — Position sizing, stop-loss tracking, sleeve caps
- **Live Market Data** — Real-time quotes via Yahoo Finance (no API key needed)
- **Portfolio Tracking** — Sync with Trading 212 or manage manually
- **Technical Charts** — Candlestick charts with RSI, MACD, Fibonacci levels
- **Weekly Phase System** — Planning → Observation → Execution → Maintenance

---

## Telegram Signal Messages (Optional)

Use this if you want nightly Telegram summaries/signals.

1. Create a Telegram bot with **@BotFather** (`/newbot`) and copy the bot token.
2. Send at least one message to the bot.
3. Get your chat ID from:
   - `https://api.telegram.org/bot<TOKEN>/getUpdates`
4. In the app, open **Settings → Telegram Notifications** and test with **Send Test Message**.
5. Put these values in `.env`:
   - `TELEGRAM_BOT_TOKEN="..."`
   - `TELEGRAM_CHAT_ID="..."`
6. Restart with `start.bat`.
7. To automate nightly delivery, run `install.bat` and choose **Y** for the nightly Telegram task.

---

## Troubleshooting

### "Node.js not found"
Download and install from https://nodejs.org (choose the LTS version).
After installing, close and re-open the terminal, then try again.

### "npm install failed"
- Try running `install.bat` as Administrator (right-click → Run as administrator)
- Temporarily disable antivirus software
- Make sure you have internet access

### "Prisma engines do not seem to be compatible" / "not a valid Win32 application"
This means the Prisma database engine doesn't match your Node.js architecture. Usually caused by having 32-bit Node.js on a 64-bit machine.
1. Check your architecture: open a terminal and run `node -e "console.log(process.arch)"`
2. If it says `ia32` instead of `x64` — uninstall Node.js, then download and install the **64-bit (x64)** version from https://nodejs.org
3. Delete the `node_modules` folder and run `install.bat` again

If the architecture is already `x64`, the binary may be corrupted (e.g. antivirus quarantine). Delete `node_modules\.prisma`, then run `npx prisma generate`.

### "Port 3000 already in use"
The `start.bat` script handles this automatically. If it persists:
1. Open Task Manager (Ctrl+Shift+Esc)
2. Find any "Node.js" processes
3. End them
4. Try `start.bat` again

### Dashboard shows no data
1. Go to the **Scan** page
2. Click **Run Full Scan** — this fetches live data from Yahoo Finance
3. The first scan may take 2-3 minutes for all 268 tickers

### Need to reset the database
Delete the file `prisma/dev.db` and run `install.bat` again.

### Trading 212 connection fails immediately / auth error
Trading 212 uses Basic Auth with base64 encoding, not a bearer token. Verify your API key and secret are correct and that you are using the right environment (Demo vs Live).

---

## Environment Variables

Copy `.env.example` to `.env` and configure. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | SQLite path (default: `file:./dev.db`) |
| `NEXTAUTH_URL` | Yes | App URL (default: `http://localhost:3000`) |
| `NEXTAUTH_SECRET` | Yes | Random secret for JWT signing |
| `CRON_SECRET` | Yes | Secret for authenticating cron/nightly API calls |
| `BROKER_ADAPTER` | No | `disabled` (default), `mock`, or `trading212` |
| `T212_INVEST_API_KEY` | If T212 | Trading 212 Invest account API key |
| `T212_ISA_API_KEY` | If T212 | Trading 212 ISA account API key |
| `T212_INVEST_ACCOUNT_ID` | If T212 | Trading 212 Invest account ID |
| `T212_ISA_ACCOUNT_ID` | If T212 | Trading 212 ISA account ID |
| `T212_ENVIRONMENT` | If T212 | `live` or `demo` |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot token for notifications |
| `TELEGRAM_CHAT_ID` | No | Telegram chat ID for notifications |
| `ENABLE_TELEGRAM_ALERTS` | No | Enable/disable Telegram alerts |
| `ENABLE_BROKER_TRADING` | No | Enable live broker execution |
| `ENABLE_AUTO_SUBMISSION` | No | Enable auto-submission of orders |
| `MARKET_DATA_PROVIDER` | No | `yahoo` (default) or `eodhd` |
| `EODHD_API_KEY` | If EODHD | EODHD API key |
| `MODEL_SERVICE_URL` | No | Python model service URL (Docker) |
| `ENABLE_ML_SCORING` | No | Enable ML prediction scoring |

See `.env.example` for the complete list with defaults.

---

## Scheduled Tasks

| Task | Schedule | Purpose |
|------|----------|---------|
| **Nightly** | Mon-Fri 21:30 | Full 10-step pipeline (health, stops, laggards, risk, equity, scan, Telegram) |
| **Watchdog** | Daily 10:00 | Check nightly heartbeat — alert if missed |
| **Midday Sync** | Mon-Fri 10:00, 13:00, 16:00, 19:00 | T212 position auto-closure detection |
| **Intraday Alert** | Mon-Fri 15:30 | Trigger check + auto-stop ratchet |
| **Auto-Stop** | At logon + hourly on weekdays | Stop ratchet scheduler (requires Settings toggle ON) |
| **Research Refresh** | Manual / scheduled | Candidate outcome data refresh |

All tasks are registered via their `register-*.bat` files (run as Administrator).

---

## For Developers

```bash
# Dev server with hot reload
npm run dev

# Build for production
npm run build && npm start

# Database management
npm run db:studio              # Visual database browser
npm run db:deploy              # Apply pending schema migrations
npm run db:migrate             # Create new migration
npm run db:generate            # Regenerate Prisma client
npm run db:seed                # Re-seed stock universe
npm run db:status              # Show migration status
npm run db:auto-migrate        # Auto-apply pending migrations

# Trading operations
npm run workflow:run           # Run nightly workflow pipeline
npm run workflow:card          # Show tonight's workflow card
npm run signals:run            # Run signal scan
npm run signals:view           # Show signal candidates
npm run broker:sync            # Sync Trading 212 positions
npm run broker:scheduler       # Run broker sync scheduler
npm run portfolio:view         # Show portfolio state
npm run stops:view             # Show stop dashboard
npm run stops:auto             # Hourly stop ratchet (requires toggle ON in Settings)
npm run risk:state             # Show risk account state
npm run intraday:alert         # Run intraday trigger checks

# Market data
npm run refresh:daily-bars     # Refresh daily OHLCV data
npm run market-data:scheduler  # Run market data scheduler
npm run validate:universe      # Validate ticker universe

# Testing & diagnostics
npm run test:unit              # Run unit tests (vitest)
npm run test:unit:watch        # Watch-mode tests
npm run audit:harness          # Run audit harness
npm run fix:account-types      # Fix ISA/Invest account type mismatches
npm run lint                   # ESLint
```

### Docker (Alternative)

Docker Compose is available for containerised deployment. See `docs/DEPLOYMENT.md` for full instructions.

```bash
docker compose up              # Start app + SQLite
docker compose --profile model up  # Include optional Python model service
```

---

*Built with Next.js 14, Prisma, TailwindCSS, and lightweight-charts.*

---

For complete end-user instructions (full system walkthrough), see `USER-GUIDE.md`.
