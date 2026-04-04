/**
 * DEPENDENCIES
 * Consumed by: scripts/start-auto-stop-scheduler.ts, /api/stops/auto/route.ts
 * Consumes: stop-manager.ts (read-only: generateStopRecommendations, generateTrailingStopRecommendations, updateStopLoss),
 *           trading212.ts (setStopLoss), market-data.ts (getBatchPrices, getDailyPrices, calculateATR), prisma.ts
 * Risk-sensitive: YES — writes stop values to DB and places T212 orders automatically
 * Last modified: 2026-04-01
 * Notes: Autopilot stop ratchet — wraps sacred stop-manager outputs. Does NOT modify stop-manager.ts.
 *        Honors monotonic enforcement via updateStopLoss(). Polls on a cron schedule (default hourly).
 *        Only runs when user.autoStopsEnabled === true.
 */

import prisma from '@/lib/prisma';
import {
  generateStopRecommendations,
  generateTrailingStopRecommendations,
  updateStopLoss,
  inferLevelFromStop,
  StopLossError,
} from '@/lib/stop-manager';
import { getBatchPrices, getDailyPrices, calculateATR } from '@/lib/market-data';
import { Trading212Client } from '@/lib/trading212';
import type { T212AccountType } from '@/lib/trading212-dual';

export interface AutoStopResult {
  enabled: boolean;
  positionsChecked: number;
  stopsUpdated: number;
  t212Pushed: number;
  t212Failed: number;
  skipped: number;
  errors: string[];
  details: AutoStopDetail[];
}

export interface AutoStopDetail {
  positionId: string;
  ticker: string;
  currentStop: number;
  newStop: number;
  reason: string;
  dbApplied: boolean;
  t212Applied: boolean;
  error?: string;
}

/**
 * Run the auto-stop ratchet cycle for a user.
 * 1. Check if autopilot is enabled
 * 2. Get merged R-based + trailing ATR recommendations (same logic as GET /api/stops)
 * 3. For each recommendation where newStop > currentStop:
 *    a. Push to T212 (if connected)
 *    b. Write to DB via updateStopLoss (sacred, monotonic)
 * 4. Return summary
 */
export async function runAutoStopCycle(userId: string = 'default-user'): Promise<AutoStopResult> {
  // ── Check toggle ──
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      autoStopsEnabled: true,
      t212ApiKey: true,
      t212ApiSecret: true,
      t212Environment: true,
      t212Connected: true,
      t212IsaApiKey: true,
      t212IsaApiSecret: true,
      t212IsaConnected: true,
    },
  });

  if (!user) {
    return { enabled: false, positionsChecked: 0, stopsUpdated: 0, t212Pushed: 0, t212Failed: 0, skipped: 0, errors: ['User not found'], details: [] };
  }

  if (!user.autoStopsEnabled) {
    return { enabled: false, positionsChecked: 0, stopsUpdated: 0, t212Pushed: 0, t212Failed: 0, skipped: 0, errors: [], details: [] };
  }

  // ── Gather open positions ──
  const positions = await prisma.position.findMany({
    where: { userId, status: 'OPEN' },
    include: { stock: { select: { ticker: true, currency: true, t212Ticker: true } } },
  });

  if (positions.length === 0) {
    return { enabled: true, positionsChecked: 0, stopsUpdated: 0, t212Pushed: 0, t212Failed: 0, skipped: 0, errors: [], details: [] };
  }

  const tickers = positions.map((p) => p.stock.ticker);

  // ── Fetch live prices + ATR ──
  const livePrices = await getBatchPrices(tickers);
  const priceMap = new Map<string, number>(
    tickers.map((ticker) => [ticker, livePrices[ticker] || 0])
  );

  const atrMap = new Map<string, number>();
  for (const ticker of tickers) {
    try {
      const bars = await getDailyPrices(ticker, 'compact');
      if (bars.length >= 15) {
        atrMap.set(ticker, calculateATR(bars, 14));
      }
    } catch { /* skip — ATR is best-effort */ }
  }

  // ── Generate merged recommendations (R-based + trailing ATR) ──
  const rBasedRecs = await generateStopRecommendations(userId, priceMap, atrMap);
  let trailingRecs: Awaited<ReturnType<typeof generateTrailingStopRecommendations>> = [];
  try {
    trailingRecs = await generateTrailingStopRecommendations(userId);
  } catch { /* trailing ATR is best-effort */ }

  // Merge: keep whichever rec has the higher newStop per position
  const merged = new Map<string, { positionId: string; ticker: string; currentStop: number; newStop: number; newLevel: string; reason: string }>();

  for (const rec of rBasedRecs) {
    merged.set(rec.positionId, {
      positionId: rec.positionId,
      ticker: rec.ticker,
      currentStop: rec.currentStop,
      newStop: rec.newStop,
      newLevel: rec.newLevel,
      reason: `[auto] ${rec.reason}`,
    });
  }

  for (const rec of trailingRecs) {
    const existing = merged.get(rec.positionId);
    if (!existing || rec.trailingStop > existing.newStop) {
      merged.set(rec.positionId, {
        positionId: rec.positionId,
        ticker: rec.ticker,
        currentStop: rec.currentStop,
        newStop: rec.trailingStop,
        newLevel: inferLevelFromStop(rec.trailingStop, 0, 1),
        reason: `[auto] ${rec.reason}`,
      });
    }
  }

  // ── Apply each recommendation ──
  const result: AutoStopResult = {
    enabled: true,
    positionsChecked: positions.length,
    stopsUpdated: 0,
    t212Pushed: 0,
    t212Failed: 0,
    skipped: 0,
    errors: [],
    details: [],
  };

  for (const rec of Array.from(merged.values())) {
    const detail: AutoStopDetail = {
      positionId: rec.positionId,
      ticker: rec.ticker,
      currentStop: rec.currentStop,
      newStop: rec.newStop,
      reason: rec.reason,
      dbApplied: false,
      t212Applied: false,
    };

    const pos = positions.find((p) => p.id === rec.positionId);
    if (!pos) {
      detail.error = 'Position not found in current set';
      result.skipped++;
      result.details.push(detail);
      continue;
    }

    // ── Push to T212 first (if connected) ──
    const t212Ticker = pos.t212Ticker || pos.stock.t212Ticker;
    if (t212Ticker) {
      try {
        const client = getT212ClientForPosition(user, pos.accountType as T212AccountType | null);
        if (client) {
          await client.setStopLoss(t212Ticker, pos.shares, rec.newStop);
          detail.t212Applied = true;
          result.t212Pushed++;
        }
      } catch (err) {
        const msg = (err as Error).message;
        // If primary account fails with "not owned", try fallback account
        if (msg.includes('selling-equity-not-owned') || msg.includes('not found in T212 positions')) {
          try {
            const fallbackType: T212AccountType = (pos.accountType === 'isa') ? 'invest' : 'isa';
            const fallbackClient = getT212ClientForPosition(user, fallbackType);
            if (fallbackClient) {
              await fallbackClient.setStopLoss(t212Ticker, pos.shares, rec.newStop);
              detail.t212Applied = true;
              result.t212Pushed++;
              // Fix accountType in DB
              await prisma.position.update({ where: { id: pos.id }, data: { accountType: fallbackType } });
            }
          } catch (fallbackErr) {
            detail.error = `T212 fallback failed: ${(fallbackErr as Error).message}`;
            result.t212Failed++;
            // Both accounts failed — clear accountType so next cycle tries both
            try {
              await prisma.position.update({ where: { id: pos.id }, data: { accountType: null } });
            } catch { /* best-effort reset */ }
          }
        } else {
          detail.error = `T212: ${msg}`;
          result.t212Failed++;
        }
      }
    }

    // ── Write to DB via sacred updateStopLoss (monotonic enforced) ──
    try {
      await updateStopLoss(rec.positionId, rec.newStop, rec.reason);
      detail.dbApplied = true;
      result.stopsUpdated++;
    } catch (err) {
      if (err instanceof StopLossError) {
        // Monotonic violation — stop is already at or above recommended level
        detail.error = detail.error
          ? `${detail.error}; DB skip: ${err.message}`
          : `DB skip: ${err.message}`;
        result.skipped++;
      } else {
        detail.error = detail.error
          ? `${detail.error}; DB error: ${(err as Error).message}`
          : `DB error: ${(err as Error).message}`;
        result.errors.push(`${rec.ticker}: ${(err as Error).message}`);
      }
    }

    result.details.push(detail);
  }

  console.log(`[auto-stops] Cycle complete: ${result.stopsUpdated} updated, ${result.t212Pushed} T212 pushed, ${result.skipped} skipped, ${result.errors.length} errors`);
  return result;
}

// ── Helper: build T212 client from user credentials ──
function getT212ClientForPosition(
  user: {
    t212ApiKey: string | null;
    t212ApiSecret: string | null;
    t212Environment: string;
    t212Connected: boolean;
    t212IsaApiKey: string | null;
    t212IsaApiSecret: string | null;
    t212IsaConnected: boolean;
  },
  accountType: T212AccountType | string | null,
): Trading212Client | null {
  const acctType: T212AccountType = accountType === 'isa' ? 'isa' : 'invest';

  if (acctType === 'isa') {
    if (!user.t212IsaApiKey || !user.t212IsaApiSecret || !user.t212IsaConnected) return null;
    return new Trading212Client(
      user.t212IsaApiKey,
      user.t212IsaApiSecret,
      user.t212Environment as 'demo' | 'live',
    );
  }

  if (!user.t212ApiKey || !user.t212ApiSecret || !user.t212Connected) return null;
  return new Trading212Client(
    user.t212ApiKey,
    user.t212ApiSecret,
    user.t212Environment as 'demo' | 'live',
  );
}
